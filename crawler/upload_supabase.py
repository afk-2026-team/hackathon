"""Crawling_DB → Supabase Storage 불변 스냅샷 업로드·검증 (interview 26102414_43_06 Q2·Q7·Q8).

    node scripts/secrets.mjs run --env dev --services supabase -- uv run python -m crawler.upload_supabase
    node scripts/secrets.mjs run --env dev --services supabase -- uv run python -m crawler.upload_supabase --verify

- 대상: 버킷 $SUPABASE_STORAGE_BUCKET 의 SNAPSHOT_PREFIX 아래. README.md 는 올리지 않는다(사람용 안내).
- 대상 경로가 비어 있지 않으면 시작하지 않는다. 덮어쓰기(x-upsert)는 하지 않는다.
- 중간에 실패하면 아무것도 지우지 않고 멈춘 뒤, 그때까지 올린 목록을 출력한다(정리는 사람이 결정).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

from app.knowledge.okf import GUIDE_FILES

SNAPSHOT_PREFIX = "crawling_db/example-v1"  # 불변 스냅샷 경로 — 새 버전은 새 경로(example-v2)로
MANIFEST = "manifest.json"
CONTENT_TYPE = "text/markdown; charset=utf-8"
TIMEOUT_SECONDS = 30
LIST_LIMIT = 1000


class StorageError(RuntimeError):
    pass


def _env() -> tuple[str, str, str]:
    return os.environ["SUPABASE_URL"].rstrip("/"), os.environ["SUPABASE_SECRET_KEY"], os.environ["SUPABASE_STORAGE_BUCKET"]


def _request(method: str, path: str, *, body: bytes | None = None, headers: dict | None = None) -> bytes:
    url, key, _ = _env()
    req = urllib.request.Request(f"{url}{path}", data=body, method=method,
                                 headers={"apikey": key, "Authorization": f"Bearer {key}", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        # 응답 본문은 Storage 오류 메시지다(키를 담지 않는다). 경로만 남긴다
        raise StorageError(f"{method} {path} → HTTP {e.code}: {e.read()[:300].decode('utf-8', 'replace')}") from None


def _object_path(name: str) -> str:
    _, _, bucket = _env()
    return f"/storage/v1/object/{bucket}/{urllib.parse.quote(f'{SNAPSHOT_PREFIX}/{name}')}"


def list_remote(prefix: str = SNAPSHOT_PREFIX) -> list[str]:
    """prefix 아래 객체 전부(하위 폴더 재귀). Storage list 는 한 단계씩만 보여준다."""
    _, _, bucket = _env()
    body = json.dumps({"prefix": prefix, "limit": LIST_LIMIT, "offset": 0}).encode()
    items = json.loads(_request("POST", f"/storage/v1/object/list/{bucket}", body=body, headers={"Content-Type": "application/json"}))
    names: list[str] = []
    for item in items:
        child = f"{prefix}/{item['name']}"
        names += list_remote(child) if item.get("id") is None else [child]  # id 가 없으면 폴더
    return sorted(names)


def local_files(bundle: Path) -> list[Path]:
    return sorted(p for p in bundle.rglob("*.md") if p.name not in GUIDE_FILES)


def _source_commit(bundle: Path) -> dict:
    head = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    dirty = subprocess.run(["git", "status", "--porcelain", "--", str(bundle), f":!{bundle}/README.md"],
                           capture_output=True, text=True, check=True).stdout.strip()
    return {"commit": head, "bundle_dirty": bool(dirty)}


def upload(bundle: Path) -> int:
    existing = list_remote()
    if existing:
        print(f"❌ 대상 경로가 비어 있지 않아 시작하지 않는다: {SNAPSHOT_PREFIX}/ 에 {len(existing)}개", file=sys.stderr)
        return 1
    files = local_files(bundle)
    entries, uploaded = [], []
    try:
        for path in files:
            rel = path.relative_to(bundle).as_posix()
            data = path.read_bytes()
            _request("POST", _object_path(rel), body=data, headers={"Content-Type": CONTENT_TYPE, "x-upsert": "false"})
            uploaded.append(rel)
            entries.append({"path": rel, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)})
        manifest = {
            "snapshot": SNAPSHOT_PREFIX,
            "status": "frozen-example",
            "okf_version": "0.2",
            "uploaded_at": datetime.now().astimezone().isoformat(),
            "source": _source_commit(bundle),
            "excluded": list(GUIDE_FILES),
            "count": len(entries),
            "files": entries,
        }
        _request("POST", _object_path(MANIFEST), body=json.dumps(manifest, ensure_ascii=False, indent=2).encode(),
                 headers={"Content-Type": "application/json", "x-upsert": "false"})
    except StorageError as e:
        print(f"❌ 업로드 중단(삭제하지 않음): {e}", file=sys.stderr)
        print(f"   이미 올라간 객체 {len(uploaded)}개: {uploaded}", file=sys.stderr)
        return 1
    print(f"✅ {len(entries)}개 + {MANIFEST} 업로드 → {_env()[2]}/{SNAPSHOT_PREFIX}/")
    return 0


def verify(bundle: Path) -> int:
    manifest = json.loads(_request("GET", _object_path(MANIFEST)))
    remote = set(list_remote())
    expected = {f"{SNAPSHOT_PREFIX}/{e['path']}" for e in manifest["files"]} | {f"{SNAPSHOT_PREFIX}/{MANIFEST}"}
    problems = [f"원격 객체 집합 불일치: 초과 {sorted(remote - expected)} 누락 {sorted(expected - remote)}"] if remote != expected else []
    if any(Path(n).name in GUIDE_FILES for n in remote):
        problems.append("README.md 가 업로드돼 있다")
    ok = 0
    for e in manifest["files"]:
        data = _request("GET", _object_path(e["path"]))
        local = (bundle / e["path"]).read_bytes()
        if hashlib.sha256(data).hexdigest() == e["sha256"] == hashlib.sha256(local).hexdigest():
            ok += 1
        else:
            problems.append(f"sha256 불일치: {e['path']}")
    for p in problems:
        print(f"❌ {p}")
    print(f"verified {ok}/{manifest['count']} (remote objects {len(remote)}, manifest {MANIFEST} present)")
    return 1 if problems or ok != manifest["count"] else 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", default="Crawling_DB")
    parser.add_argument("--verify", action="store_true", help="업로드하지 않고 다시 내려받아 manifest 와 대조")
    args = parser.parse_args(argv)
    bundle = Path(args.bundle)
    return verify(bundle) if args.verify else upload(bundle)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

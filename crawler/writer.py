"""정규화된 레코드 → OKF v0.2 concept 파일·index.md·log.md. 계약 검증은 app/knowledge/okf.py 가 한다."""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

import yaml

from app.knowledge.okf import OKF_VERSION, load_bundle

PRODUCER = "heak-crawler/0.1.0"  # generated.by actor(§7)
FOLDERS = {  # content_kind → (폴더, index 제목)
    "product": ("products", "제품 후기"),
    "clinic": ("clinics", "피부과·의원 후기"),
    "video": ("videos", "리뷰 영상"),
}
# 레코드에서 frontmatter 로 내보낼 키(순서 = 파일 속 순서). 그 밖의 키는 body 표로만 간다
FRONT_KEYS = (
    "type", "title", "description", "resource", "tags", "category", "category_source", "content_kind", "source_kind",
    "crawl_query", "sponsored", "sponsored_evidence", "sponsored_source", "foreigner_friendly", "foreigner_evidence", "country_signals",
    "country_evidence", "language_signals", "language_source", "provenance",
)


def concept_text(record: dict, generated_at: datetime) -> str:
    front = {k: record[k] for k in FRONT_KEYS if record.get(k) is not None}
    front["sources"] = record["sources"]
    front["generated"] = {"by": PRODUCER, "at": generated_at.isoformat()}
    front["status"] = "draft"  # 사람 검수 전(§5.4) — 응답에서 '미검수'로 표시한다
    front["stale_after"] = (generated_at + timedelta(days=record["stale_days"])).isoformat()
    meta_rows = "\n".join(f"| `{k}` | {v} |" for k, v in record["meta"].items())
    body = (
        f"\n# Summary\n\n{record['description']}[^origin]\n\n"
        f"# Source meta\n\n| 필드 | 값 |\n|---|---|\n{meta_rows}\n\n"
        f"API 응답의 메타·스니펫만 담았다. 원문 전문은 [출처]({record['resource']})에서 본다.\n\n"
        f"[^origin]: {record['title']}\n"
    )
    return "---\n" + yaml.safe_dump(front, allow_unicode=True, sort_keys=False, width=1000) + "---\n" + body


def write_concepts(records: list[dict], out: Path, generated_at: datetime) -> tuple[list[str], list[str]]:
    """concept id 가 같으면 같은 파일을 덮어쓴다(멱등). (생성된 id, 갱신된 id)."""
    created, updated = [], []
    for record in records:
        path = out / f"{record['id']}.md"
        (updated if path.exists() else created).append(record["id"])
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(concept_text(record, generated_at), encoding="utf-8")
    return created, updated


def append_log(out: Path, day: str, entries: list[str]) -> None:
    """§9 — 날짜 헤딩(YYYY-MM-DD) 아래 항목, 최신이 위."""
    path = out / "log.md"
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else ["# Directory Update Log", ""]
    heading = f"## {day}"
    new = [f"* {e}" for e in entries]
    if heading in lines:
        at = lines.index(heading) + 1
        lines[at:at] = new
    else:
        lines[2:2] = [heading, *new, ""]
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_indexes(out: Path) -> None:
    """§8 — 폴더마다 concept 목록, 루트는 하위 폴더 목록 + okf_version."""
    concepts = load_bundle(out)
    root_lines = [f"---\nokf_version: \"{OKF_VERSION}\"\n---", "", "# Crawling_DB — Home 조언자용 OKF 번들", ""]
    for kind, (folder, heading) in FOLDERS.items():
        members = sorted((c for c in concepts if c.meta["content_kind"] == kind), key=lambda c: c.id)
        if not members:
            continue
        items = [f"* [{c.meta['title']}]({Path(c.id).name}.md) - {c.meta['description'][:80]}" for c in members]
        (out / folder / "index.md").write_text("\n".join([f"# {heading}", "", *items]) + "\n", encoding="utf-8")
        root_lines.append(f"* [{heading}]({folder}/) - {len(members)}건")
    root_lines += ["", "* [Update log](log.md) - 크롤링 실행 이력"]
    (out / "index.md").write_text("\n".join(root_lines) + "\n", encoding="utf-8")

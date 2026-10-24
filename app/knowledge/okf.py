from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import yaml

# OKF v0.2 (seed/knowledge-catalog/okf/SPEC.md) — 예약 파일·필수 키는 §3.1·§4.1, 수명주기 값은 §5.4
OKF_VERSION = "0.2"
RESERVED_FILES = ("index.md", "log.md")
# 사람용 번들 안내 파일 — OKF 예약 파일은 아니지만 concept 도 아니다(Crawling_DB/README.md)
GUIDE_FILES = ("README.md",)
STATUSES = ("draft", "stable", "deprecated")
FRONTMATTER_FENCE = "---"

# 이 번들(Crawling_DB)의 producer 확장 계약 — 크롤러(crawler/writer.py)가 쓰고 retrieve 가 읽는다
CONTENT_KINDS = ("product", "clinic", "video")
SOURCE_KINDS = ("naver_blog", "youtube", "naver_shop", "naver_local")
SPONSORED = ("yes", "no", "unknown")  # 있음/없음/확인 못 함(기획안 §5)
PROVENANCES = ("measured", "mock", "dry-run", "estimate")  # workflow.md §6
REQUIRED_KEYS = (
    "type", "title", "description", "resource", "tags", "sources", "generated", "status", "stale_after",
    "provenance", "category", "category_source", "content_kind", "source_kind", "sponsored",
    "country_signals", "language_signals",
)


@dataclass(frozen=True)
class Concept:
    id: str  # OKF Concept ID — 번들 루트 기준 경로에서 .md 를 뗀 값
    meta: dict
    body: str


def split_frontmatter(text: str) -> tuple[dict | None, str]:
    """`---` 로 감싼 YAML frontmatter 와 body 를 나눈다. frontmatter 가 없으면 (None, 원문)."""
    lines = text.split("\n")
    if not lines or lines[0].strip() != FRONTMATTER_FENCE:
        return None, text
    for i in range(1, len(lines)):
        if lines[i].strip() == FRONTMATTER_FENCE:
            meta = yaml.safe_load("\n".join(lines[1:i])) or {}
            if not isinstance(meta, dict):
                raise ValueError("frontmatter 가 mapping 이 아니다")
            return meta, "\n".join(lines[i + 1 :])
    raise ValueError("frontmatter 닫는 --- 가 없다")


def parse_instant(value) -> datetime:
    """OKF 타임스탬프 — ISO 8601 + 명시 UTC 오프셋(§5). YAML 이 datetime 으로 읽은 값도 받는다."""
    instant = value if isinstance(value, datetime) else datetime.fromisoformat(str(value))
    if instant.tzinfo is None:
        raise ValueError(f"UTC 오프셋이 없는 타임스탬프: {value!r}")
    return instant


def concept_paths(root: Path) -> list[Path]:
    return sorted(p for p in root.rglob("*.md") if p.name not in RESERVED_FILES + GUIDE_FILES)


def load_bundle(root: str | Path) -> list[Concept]:
    root = Path(root)
    concepts = []
    for path in concept_paths(root):
        meta, body = split_frontmatter(path.read_text(encoding="utf-8"))
        if meta is None:
            raise ValueError(f"{path}: concept 에 frontmatter 가 없다")
        concepts.append(Concept(id=path.relative_to(root).with_suffix("").as_posix(), meta=meta, body=body))
    return concepts


def _concept_errors(c: Concept) -> list[str]:
    m, errors = c.meta, []
    missing = [k for k in REQUIRED_KEYS if k not in m]
    if missing:
        return [f"{c.id}: 빠진 키 {missing}"]
    for key, allowed in (("status", STATUSES), ("content_kind", CONTENT_KINDS), ("source_kind", SOURCE_KINDS),
                         ("sponsored", SPONSORED), ("provenance", PROVENANCES)):
        if m[key] not in allowed:
            errors.append(f"{c.id}: {key}={m[key]!r} 허용값 {allowed}")
    if not str(m["resource"]).startswith("https://"):
        errors.append(f"{c.id}: resource 는 https URL 이어야 한다")
    if not isinstance(m["tags"], list) or not m["tags"]:
        errors.append(f"{c.id}: tags 는 비어 있지 않은 목록이어야 한다")
    for key in ("country_signals", "language_signals"):
        if not isinstance(m[key], list):
            errors.append(f"{c.id}: {key} 는 목록이어야 한다(근거가 없으면 [])")
    if not isinstance(m["sources"], list) or not m["sources"] or any("resource" not in s for s in m["sources"]):
        errors.append(f"{c.id}: sources 는 resource 를 가진 항목 1개 이상(§5.1)")
    if not isinstance(m["generated"], dict) or "by" not in m["generated"] or "at" not in m["generated"]:
        errors.append(f"{c.id}: generated 는 {{by, at}} (§5.2)")
    else:
        try:
            parse_instant(m["generated"]["at"])
        except ValueError as e:
            errors.append(f"{c.id}: generated.at {e}")
    try:
        parse_instant(m["stale_after"])
    except ValueError as e:
        errors.append(f"{c.id}: stale_after {e}")
    if m["sponsored"] != "unknown" and not m.get("sponsored_evidence"):
        errors.append(f"{c.id}: sponsored={m['sponsored']} 인데 sponsored_evidence 가 없다")
    if m["country_signals"] and not m.get("country_evidence"):
        errors.append(f"{c.id}: country_signals 가 있는데 country_evidence 가 없다")
    return errors


def _reserved_errors(root: Path) -> list[str]:
    errors = []
    for index in root.rglob("index.md"):
        meta, _ = split_frontmatter(index.read_text(encoding="utf-8"))
        allowed = {"okf_version"} if index.parent == root else set()
        if meta is not None and set(meta) - allowed:
            errors.append(f"{index.relative_to(root)}: index.md frontmatter 는 루트 okf_version 만 허용(§8)")
    for log in root.rglob("log.md"):
        for line in log.read_text(encoding="utf-8").splitlines():
            if line.startswith("## "):
                try:
                    datetime.strptime(line[3:].strip(), "%Y-%m-%d")
                except ValueError:
                    errors.append(f"{log.relative_to(root)}: 날짜 헤딩은 YYYY-MM-DD(§9): {line!r}")
    return errors


def validate_bundle(root: str | Path) -> tuple[list[str], dict[str, int]]:
    """번들 위반 목록과 content_kind 별 개수. 위반이 없으면 errors == []."""
    root = Path(root)
    if not (root / "index.md").is_file():
        return [f"{root}: 루트 index.md 가 없다"], {}
    concepts = load_bundle(root)
    errors = _reserved_errors(root)
    counts = {kind: 0 for kind in CONTENT_KINDS}
    for c in concepts:
        errors += _concept_errors(c)
        if c.meta.get("content_kind") in counts:
            counts[c.meta["content_kind"]] += 1
    counts["total"] = len(concepts)
    return errors, counts

"""respond 턴의 [Official catalog] 블록 — 서버가 고른 공식 카탈로그 후보의 표시 사실만 쓴다.

호출자는 카탈로그 id 목록만 넘긴다(metadata.catalog_candidate_ids). 문장은 여기서 서버 카탈로그 파일로 다시 만들므로
외부 클라이언트가 임의의 카탈로그 문장을 모델 문맥에 넣을 수 없다. 모르는 id 는 UnknownCatalogIds 로 드러낸다.
"""

from __future__ import annotations

from app.schemas.discovery import Catalog, CatalogItem

CATALOG_IDS_KEY = "catalog_candidate_ids"  # A 프록시 → B 그래프 전달 키(metadata 최상위)
MAX_CATALOG_IDS = 6  # 질문 있는 턴의 beauty 3 + medical 3 과 같은 상한
NO_CATALOG = "results: 0\n(no official catalog candidates were provided for this turn)"


class UnknownCatalogIds(Exception):
    def __init__(self, ids: list[str]) -> None:
        super().__init__(f"unknown catalog ids: {', '.join(ids)}")
        self.ids = ids


def price_text(item: CatalogItem) -> str:
    if item.price_krw is not None:
        return f"KRW {item.price_krw:,.0f} (Korean store price as listed)"
    if item.list_price is not None:
        lp = item.list_price
        return f"{lp.currency} {lp.amount:,.2f} as listed by the seller ({lp.basis}); not converted, not compared with a KRW budget"
    return "price not listed"


def catalog_block(ids: list[str], catalog: Catalog) -> str:
    if not ids:
        return NO_CATALOG
    by_id = {i.id: i for i in catalog.items}
    unknown = [i for i in ids if i not in by_id]
    if unknown:
        raise UnknownCatalogIds(unknown)
    lines = [f"results: {len(ids)}"]
    for item in (by_id[i] for i in ids):
        sources = "; ".join(f"{s.label} <{s.url}>" for s in item.sources)
        lines.append(
            f"- [{item.id}] {item.kind} · {item.category} — {item.title} ({item.subtitle})\n"
            f"  price: {price_text(item)}\n"
            f"  listing facts: {' '.join(item.reasons) or 'none'}\n"
            f"  sources: {sources} | sponsored: {item.sponsorship}"
        )
    return "\n".join(lines)

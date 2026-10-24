"""질문 텍스트 ↔ 카탈로그 태그의 결정론적 대조 — AI 후보를 질문 주제 쪽으로 먼저 세운다.

효과·품질·인기 순위가 아니다. 질문에 나온 단어가 카탈로그 태그(진료과·지역·제품 종류)와 같은지만 본다.
동의어 표는 닫힌 목록(tripwire)이다 — 추가하면 테스트에서 드러난다.
"""

from __future__ import annotations

import re
from collections.abc import Sequence

from app.schemas.discovery import CatalogItem

# 질문 표현 → 카탈로그 태그. 영어는 단어 시작 일치(접두), 한국어는 부분 문자열 일치
QUESTION_TAGS: dict[str, str] = {
    # 진료과
    "dermatolog": "dermatology", "skin clinic": "dermatology", "피부과": "dermatology",
    "plastic surg": "plastic_surgery", "cosmetic surg": "plastic_surgery", "성형": "plastic_surgery",
    "dental": "dental", "dentist": "dental", "teeth": "dental", "tooth": "dental", "치과": "dental",
    "checkup": "checkup", "check-up": "checkup", "health screening": "checkup", "건강검진": "checkup", "검진": "checkup",
    # 지역
    "seoul": "seoul", "서울": "seoul", "gangnam": "gangnam", "강남": "gangnam", "seocho": "seocho", "서초": "seocho",
    "busan": "busan", "부산": "busan", "jeju": "jeju", "제주": "jeju", "myeongdong": "myeongdong", "명동": "myeongdong",
    "hongdae": "mapo", "홍대": "mapo", "mapo": "mapo", "마포": "mapo", "jongno": "jongno", "종로": "jongno",
    "yongsan": "yongsan", "용산": "yongsan", "songpa": "songpa", "송파": "songpa", "yeouido": "yeongdeungpo", "여의도": "yeongdeungpo",
    # 제품 종류
    "cream": "cream", "크림": "cream", "moisturi": "moisturizer", "보습": "moisturizer",
    "sunscreen": "sunscreen", "sun cream": "sunscreen", "sunblock": "sunscreen", "선크림": "sunscreen", "자외선": "suncare",
    "cleanser": "cleanser", "cleansing": "cleanser", "클렌저": "cleanser", "세안": "cleanser",
    "toner": "toner", "토너": "toner", "serum": "serum", "세럼": "serum", "essence": "essence", "에센스": "essence",
    "ampoule": "ampoule", "앰플": "ampoule", "sheet mask": "sheet_mask", "마스크팩": "sheet_mask", "mask": "mask",
    "lip": "lip", "립": "lip", "tint": "tint", "틴트": "tint", "cushion": "cushion", "쿠션": "cushion",
    "foundation": "foundation", "파운데이션": "foundation", "makeup": "makeup", "메이크업": "makeup", "화장": "makeup",
    "shampoo": "shampoo", "샴푸": "shampoo", "hair": "hair", "헤어": "hair", "scalp": "scalp", "두피": "scalp",
    "eye cream": "eye_cream", "아이크림": "eye_cream",
}
# 클리닉(장소)을 묻는 표현 — 있으면 의료 후보에서 장소를 안내 문서보다 앞에 둔다
PLACE_WORDS = ("clinic", "hospital", "doctor", "where can i", "병원", "의원", "클리닉", "어디")
MEDICAL_DEPARTMENTS = frozenset({"dermatology", "plastic_surgery", "dental", "checkup"})
MAX_GUIDES_WHEN_PLACE = 1  # 장소를 물을 때 안내 문서(guide)는 보조로 1개까지
GUIDE_TAG = "official_guide"  # 안내 데스크처럼 place 지만 진료 기관이 아닌 공식 안내 항목


def is_medical_guide(item: CatalogItem) -> bool:
    return item.category == "medical" and (item.kind != "place" or GUIDE_TAG in item.tags)


def _hit(term: str, text: str) -> bool:
    if re.search(r"[가-힣]", term):
        return term in text
    return re.search(r"(?<![a-z])" + re.escape(term), text) is not None


def question_tags(question: str) -> set[str]:
    text = (question or "").lower()
    return {tag for term, tag in QUESTION_TAGS.items() if _hit(term, text)}


def asks_for_place(question: str, tags: set[str]) -> bool:
    text = (question or "").lower()
    return bool(tags & MEDICAL_DEPARTMENTS) or any(_hit(w, text) for w in PLACE_WORDS)


def prioritize(items: Sequence[CatalogItem], question: str, limit: int) -> list[tuple[CatalogItem, list[str]]]:
    """질문 태그 일치 수 내림차순, 같으면 입력 순서(프로필 추천 순서). (항목, 일치 태그) 를 limit 개 돌려준다.

    장소를 묻는 의료 질문이면 같은 일치 수에서 진료 기관을 먼저 두고, 안내 항목(guide·official_guide 장소)은 MAX_GUIDES_WHEN_PLACE 개까지만 넣는다.
    """
    tags = question_tags(question)
    want_place = asks_for_place(question, tags)
    scored = []
    for pos, item in enumerate(items):
        hits = [t for t in item.tags if t in tags]
        scored.append((-len(hits), int(want_place and is_medical_guide(item)), pos, item, hits))
    scored.sort(key=lambda r: r[:3])
    out: list[tuple[CatalogItem, list[str]]] = []
    guides = 0
    for _, _, _, item, hits in scored:
        if want_place and is_medical_guide(item):
            if guides >= MAX_GUIDES_WHEN_PLACE:
                continue
            guides += 1
        out.append((item, hits))
        if len(out) == limit:
            break
    return out

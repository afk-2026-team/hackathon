"""카탈로그 한국어 파일(app/data/discovery_catalog_ko.json)에 빠진 항목을 정해진 문장 패턴으로 채운다.

대상은 정형 문장으로 만든 항목(OLIVE YOUNG Global 제품, 공공데이터 의료기관)이다.
알 수 없는 문장·분류가 하나라도 있으면 아무것도 쓰지 않고 실패한다(추측 번역 금지). 그런 항목은 손으로 번역해 넣는다.
이미 있는 한국어 항목은 건드리지 않는다.

사용: uv run python scripts/catalog_ko_fill.py          # 계획만 출력
      uv run python scripts/catalog_ko_fill.py --apply  # 파일에 쓴다
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "app" / "data" / "discovery_catalog.json"
KO = ROOT / "app" / "data" / "discovery_catalog_ko.json"

# OLIVE YOUNG Global 분류 경로의 각 단계
PATH_KO = {
    "Skincare": "스킨케어", "Moisturizers": "보습", "Essence & Serum": "에센스·세럼", "Cream": "크림", "Toner": "토너",
    "Cleansers": "클렌저", "Cleansing Foams": "클렌징 폼", "Cleansing Balms&Oils": "클렌징 밤·오일", "Cleansing Milk": "클렌징 밀크",
    "Spot Care": "스팟 케어", "Face Mist": "페이스 미스트", "Face Masks": "페이스 마스크", "Sheet Masks": "시트 마스크",
    "Suncare": "선케어", "Sunscreen": "선크림", "Makeup": "메이크업", "Lip": "립", "Lip Balm & Treatment": "립밤·트리트먼트",
    "Lip Gloss & Lip Tint": "립글로스·립틴트", "Face": "페이스", "Makeup Cushion": "메이크업 쿠션", "Foundation": "파운데이션",
    "Concealer": "컨실러", "Powder & Pact": "파우더·팩트", "Face Primer": "페이스 프라이머", "Blush": "블러셔", "Eye": "아이",
    "Eyeliner": "아이라이너", "Eyeshadow": "아이섀도", "Eyelashes": "속눈썹", "Hair": "헤어", "Hair Wash": "헤어 워시",
    "Shampoo": "샴푸", "Treatments": "트리트먼트", "Hair Ampoule & Tonic": "헤어 앰플·토닉", "Hair Treatments": "헤어 트리트먼트",
    "Hair Essence & Serum": "헤어 에센스·세럼", "Bath & Body": "바디", "Bath & Shower": "배스·샤워", "Body Wash": "바디워시",
    "Body Moisturizers": "바디 보습", "Body Cream": "바디 크림", "Hands Care": "핸드 케어", "Hands Cream & Mask": "핸드크림·마스크",
}

MED_TYPE_KO = {
    "clinic": "의원", "dental clinic": "치과의원", "general hospital": "종합병원",
    "tertiary general hospital": "상급종합병원", "dental hospital": "치과병원",
}
SPECIALTY_KO = {"dermatology and dentistry": "피부과·치과", "dermatology": "피부과", "dentistry": "치과", "plastic surgery": "성형외과"}

# 한 번씩만 나오는 문장(원문 그대로 키)
FIXED_KO = {
    "The seller files this cream under Essence & Serum": "판매처는 이 크림을 에센스·세럼으로 분류해요",
    "Ingredient list on the seller page is given in Korean only": "판매처 페이지의 성분 목록은 한국어로만 제공돼요",
    "Listing has 3 options; the ingredient list shown is for the Bio Collagen option": "판매 페이지에 옵션이 3개 있고, 표시된 성분 목록은 Bio Collagen 옵션 기준이에요",
    "The seller marks this as the upgraded version": "판매처가 업그레이드 버전으로 표시해요",
    "SPF50+ PA++++ appears in the seller's product name": "판매처 상품명에 SPF50+ PA++++가 표기돼 있어요",
    "Listing has several base types (Skin Correcting, Glowing, Filter, Smoothing)": "판매 페이지에 여러 베이스 타입이 있어요(Skin Correcting, Glowing, Filter, Smoothing)",
    "Pan sizes differ by option on the listing": "판매 페이지에서 옵션마다 팬 크기가 달라요",
    "Listing offers Volume and Long types": "판매 페이지에 Volume, Long 타입이 있어요",
    "Listing has four 100ml types (e.g. Deep Moisture, Total Recovery, Gel Revital)": "판매 페이지에 100ml 타입이 네 가지 있어요(예: Deep Moisture, Total Recovery, Gel Revital)",
    "Listed in the Medical Korea registry of hospitals registered to treat foreign patients": "Medical Korea의 외국인 환자 진료 등록 병원 목록에 있어요",
    "Classified as a dental institution in HIRA public data": "건강보험심사평가원 공공데이터에서 치과 기관으로 분류돼요",
    "HIRA records dermatology as a department with specialist doctors": "건강보험심사평가원 자료에 피부과 전문의가 있는 진료과로 기록돼 있어요",
    "HIRA records plastic surgery as a department with specialist doctors": "건강보험심사평가원 자료에 성형외과 전문의가 있는 진료과로 기록돼 있어요",
    "Designated national health checkup institution (NHIS list)": "국가건강검진기관으로 지정돼 있어요(국민건강보험공단 목록)",
    "Accredited under the KAHF foreign patient accreditation program (Medical Korea list)": "KAHF 외국인환자 유치기관 평가인증을 받았어요(Medical Korea 목록)",
}

LABEL_KO = {
    "OLIVE YOUNG Global product page": "올리브영 글로벌 상품 페이지",
    "Medical Korea – Registered Hospitals": "Medical Korea – 등록 병원",
    "KHIDI – Medical Korea portal listing (EN), registered hospitals (data.go.kr, 2025-09-24)": "한국보건산업진흥원 – Medical Korea 포털 등록 병원 목록(영문, 공공데이터포털, 2025-09-24)",
    "KHIDI – Foreign patient attraction institutions (data.go.kr, list dated 2026-07-21)": "한국보건산업진흥원 – 외국인환자 유치기관 목록(공공데이터포털, 2026-07-21 기준)",
    "HIRA – Nationwide hospitals and pharmacies (data.go.kr, 2026-09)": "건강보험심사평가원 – 전국 병의원 및 약국 현황(공공데이터포털, 2026-09)",
    "NHIS – National health checkup institutions (data.go.kr)": "국민건강보험공단 – 국가건강검진기관(공공데이터포털)",
    "Medical Korea – KAHF Accredited Hospitals": "Medical Korea – KAHF 인증 병원",
}


class Unknown(Exception):
    pass


def path_ko(path: str) -> str:
    parts = [p.strip() for p in path.split(">")]
    missing = [p for p in parts if p not in PATH_KO]
    if missing:
        raise Unknown(f"category step {missing}")
    return " > ".join(PATH_KO[p] for p in parts)


def reason_ko(text: str) -> str:
    if text in FIXED_KO:
        return FIXED_KO[text]
    if m := re.fullmatch(r"Seller category: (.+)", text):
        return f"판매처 분류: {path_ko(m.group(1))}"
    if m := re.fullmatch(r"The seller files this under (.+)", text):
        return f"판매처 분류상 {path_ko(m.group(1))}에 속해요"
    if m := re.fullmatch(r"Ingredient list names (.+?)( \(seller label\))?", text):
        return f"성분 목록에 표기된 성분: {m.group(1)}" + (" (판매처 표기)" if m.group(2) else "")
    if m := re.fullmatch(r"The listing has (\d+) options \(shades, types or single/set\); check the option in store", text):
        return f"판매 페이지에 옵션이 {m.group(1)}개 있어요(색상·타입·단품/세트). 매장에서 옵션을 확인하세요"
    raise Unknown(f"reason {text!r}")


def beauty_description_ko(text: str) -> str:
    m = re.fullmatch(
        r"Listed by the seller under (.+?)\. Size on the listing: (.+?)\. "
        r"Seller label: made in South Korea(?:; manufacturer/distributor: (.+)| \(manufacturer/distributor in Korean: (.+)\)\.)",
        text,
    )
    if not m:
        raise Unknown(f"beauty description {text!r}")
    company = (m.group(3) or m.group(4)).rstrip(".")
    return f"판매처 분류: {path_ko(m.group(1))}. 판매 페이지 표기 용량: {m.group(2)}. 판매처 표기: 대한민국산, 제조·판매: {company}."


def area_ko(item: dict) -> str:
    address = (item.get("location") or {}).get("address") or ""
    tokens = address.split()
    if len(tokens) < 2 or not re.search(r"[가-힣]", tokens[0]):
        raise Unknown(f"Korean address for area: {address!r}")
    return f"{tokens[0]} {tokens[1]}"


def medical_description_ko(item: dict) -> str:
    rest = item["description"]
    out: list[str] = []
    patterns = [
        (r"A (clinic|dental clinic|general hospital|tertiary general hospital|dental hospital) in .+? \(HIRA classification: (\S+)\)\.\s*",
         lambda m: f"{area_ko(item)}에 있는 {MED_TYPE_KO[m.group(1)]}이에요(건강보험심사평가원 분류: {m.group(2)})."),
        (r"Listed as a national health checkup institution designated by NHIS\.\s*",
         lambda m: "국민건강보험공단이 지정한 국가건강검진기관 목록에 있어요."),
        (r"Registered with KHIDI as a medical institution that attracts foreign patients \(registration ([^;]+); status 'maintained' in the list dated (\d{4}-\d{2}-\d{2})\)\.\s*",
         lambda m: f"한국보건산업진흥원(KHIDI)에 외국인환자 유치 의료기관으로 등록돼 있어요(등록번호 {m.group(1)}, {m.group(2)} 목록 기준 '유지' 상태)."),
        (r"Listed among KAHF-accredited hospitals on Medical Korea\.\s*",
         lambda m: "Medical Korea의 KAHF 인증 병원 목록에 있어요."),
        (r"HIRA lists (dermatology|plastic surgery) among its departments \((\d+) \1 specialist\(s\) reported\)\.\s*",
         lambda m: f"건강보험심사평가원 자료에 {SPECIALTY_KO[m.group(1)]} 진료과가 있어요({SPECIALTY_KO[m.group(1)]} 전문의 {m.group(2)}명 신고)."),
        (r"HIRA data lists specialist doctors in (dermatology and dentistry|dermatology|dentistry|plastic surgery) among its departments\.\s*",
         lambda m: f"건강보험심사평가원 자료에 {SPECIALTY_KO[m.group(1)]} 전문의가 있는 진료과가 있어요."),
        (r"English address in the Medical Korea listing: (.+?)\.\s*(?=Medical decisions)",
         lambda m: f"Medical Korea 목록의 영문 주소: {m.group(1)}."),
        (r"Medical decisions and bookings are made by the institution\.\s*",
         lambda m: "진료 판단과 예약은 해당 의료기관이 해요."),
    ]
    while rest:
        for pattern, fn in patterns:
            m = re.match(pattern, rest)
            if m:
                out.append(fn(m))
                rest = rest[m.end():]
                break
        else:
            raise Unknown(f"medical sentence {rest[:80]!r} in {item['id']}")
    return " ".join(out)


def korean_name(item: dict) -> str | None:
    name = item["subtitle"].split("·")[0].strip()
    return name if re.search(r"[가-힣]", name) else None


def fill(catalog: dict, ko: dict) -> tuple[dict, dict[str, str], list[str]]:
    entries, labels, problems = {}, {}, []
    for item in catalog["items"]:
        if item["id"] in ko["items"]:
            continue
        try:
            if item["category"] == "beauty" and item["kind"] == "product":
                description = beauty_description_ko(item["description"])
            elif item["category"] == "medical" and item["kind"] == "place":
                description = medical_description_ko(item)
            else:
                raise Unknown(f"no pattern for {item['category']}/{item['kind']}")
            entry = {"description": description, "reasons": [reason_ko(r) for r in item["reasons"]]}
            if name := korean_name(item):
                entry = {"title": name, **entry}
            for src in item["sources"]:
                if src["url"] in ko["source_labels"]:
                    continue
                if src["label"] not in LABEL_KO:
                    raise Unknown(f"source label {src['label']!r}")
                if labels.get(src["url"], LABEL_KO[src["label"]]) != LABEL_KO[src["label"]]:
                    raise Unknown(f"one URL with two labels: {src['url']}")
                labels[src["url"]] = LABEL_KO[src["label"]]
            entries[item["id"]] = entry
        except Unknown as exc:
            problems.append(f"{item['id']}: {exc}")
    return entries, labels, problems


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--apply", action="store_true", help="write the Korean file (default: plan only)")
    args = ap.parse_args()
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    ko = json.loads(KO.read_text(encoding="utf-8"))
    entries, labels, problems = fill(catalog, ko)
    print(f"new items: {len(entries)}, new source labels: {len(labels)}, problems: {len(problems)}")
    for p in problems:
        print("  ✗", p)
    if problems:
        print("Nothing written. Translate these by hand or add a pattern, then run again.")
        return 1
    if args.apply and (entries or labels):
        ko["items"].update(entries)
        ko["source_labels"].update(labels)
        KO.write_text(json.dumps(ko, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"written: {KO.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

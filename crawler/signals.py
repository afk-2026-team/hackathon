"""API 텍스트에서 근거가 있는 신호만 뽑는다. 아래 사전은 닫힌 목록(tripwire)이다 — 바꾸면 리뷰한다.

근거가 없으면 빈 값을 돌려준다. 국가만으로 취향을 단정하지 않는다(기획안 §5-1): 국가 신호는 텍스트에 국가가
명시된 경우뿐이고, 그 문장 조각을 evidence 로 함께 남긴다.
"""

from __future__ import annotations

import html
import re

TAG_RE = re.compile(r"<[^>]+>")
EVIDENCE_WINDOW = 40  # 근거 스니펫으로 남길 매치 앞뒤 글자 수

# 국가명 → ISO 3166-1 alpha-2. 라틴 표기는 단어 경계로만 맞춘다(UK 가 다른 단어 속에서 잡히지 않게)
COUNTRY_TERMS = {
    "미국": "US", "USA": "US", "America": "US", "American": "US",
    "일본": "JP", "Japan": "JP", "Japanese": "JP", "日本": "JP",
    "중국": "CN", "China": "CN", "Chinese": "CN", "中国": "CN",
    "대만": "TW", "Taiwan": "TW", "台灣": "TW",
    "홍콩": "HK", "Hong Kong": "HK",
    "태국": "TH", "Thailand": "TH",
    "베트남": "VN", "Vietnam": "VN",
    "싱가포르": "SG", "Singapore": "SG",
    "필리핀": "PH", "Philippines": "PH",
    "인도네시아": "ID", "Indonesia": "ID",
    "말레이시아": "MY", "Malaysia": "MY",
    "영국": "GB", "UK": "GB",
    "호주": "AU", "Australia": "AU",
    "캐나다": "CA", "Canada": "CA",
    "프랑스": "FR", "France": "FR",
    "독일": "DE", "Germany": "DE",
}
FOREIGNER_TERMS = ("외국인", "외국 손님", "통역", "관광객", "foreigner", "foreign", "tourist", "English", "영어", "interpreter")
# 협찬 표시 문구(공정위 추천·보증 지침의 대표 표기). 없다고 비협찬으로 단정하지 않는다 → unknown
# 부정형 자기 선언 — 긍정 문구("광고")를 포함하므로 먼저 본다. 작성자 주장일 뿐이라 sponsored_source 로 구분한다
NOT_SPONSORED_TERMS = ("not sponsored", "NOT sponsored", "no sponsorship", "광고를 포함하지 않", "광고 아님", "협찬 아님", "협찬 없이", "내돈내산")
SPONSORED_TERMS = ("협찬", "제공받아", "제공 받아", "원고료", "체험단", "소정의", "광고", "#ad", "sponsored", "Sponsored", "유료 광고")


def clean(text: str | None) -> str:
    """API 가 넣은 <b> 태그와 HTML 엔티티를 지운다."""
    return html.unescape(TAG_RE.sub("", text or "")).strip()


def _term_pattern(term: str) -> re.Pattern:
    return re.compile(rf"\b{re.escape(term)}\b") if term.isascii() else re.compile(re.escape(term))


def _evidence(text: str, match: re.Match) -> str:
    start, end = max(0, match.start() - EVIDENCE_WINDOW), match.end() + EVIDENCE_WINDOW
    return text[start:end].strip()


def first_hit(text: str, terms) -> str | None:
    """terms 중 처음 맞는 위치의 근거 스니펫. 없으면 None."""
    hits = [m for t in terms if (m := _term_pattern(t).search(text))]
    return _evidence(text, min(hits, key=lambda m: m.start())) if hits else None


def country_signals(text: str) -> tuple[list[str], dict[str, str]]:
    codes: dict[str, str] = {}
    for term, code in COUNTRY_TERMS.items():
        if code not in codes and (m := _term_pattern(term).search(text)):
            codes[code] = _evidence(text, m)
    return sorted(codes), {code: codes[code] for code in sorted(codes)}


def language_signals(text: str) -> list[str]:
    """문자 체계로 본 텍스트 언어(ISO 639-1). 측정이 아니라 표기 관측이다."""
    langs = set()
    if re.search(r"[가-힣]", text):
        langs.add("ko")
    if re.search(r"[぀-ヿ]", text):
        langs.add("ja")
    elif re.search(r"[一-鿿]", text) and "ko" not in langs:
        langs.add("zh")
    if len(re.findall(r"[A-Za-z]{3,}", text)) >= 3:
        langs.add("en")
    return sorted(langs)

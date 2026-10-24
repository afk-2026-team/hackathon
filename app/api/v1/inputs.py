"""chat/completions·responses 공용 입력 매핑 — 발화·프로필 → 그래프 입력(설계 §3.3 + interview Q1·Q5)."""

from __future__ import annotations

from collections.abc import Mapping

from langchain_core.messages import HumanMessage

from app.services import catalog_context as catalog_ctx
from app.services import discovery as discovery_svc
from app.utils.errors import OpenAIError

PROFILE_FIELDS = ("language", "country", "gender", "age_band")
# 온보딩 선호(선택). 명시적으로 검증해 받는다 — 의료 적합성 추론에는 쓰지 않는다(국적·성별로 추론하는 지침 없음)
PREFERENCE_FIELDS = ("currency", "interests", "budget_krw", "current_product")
MAX_INTERESTS = 10
MAX_INTEREST_CHARS = 40
MAX_PRODUCT_CHARS = 200
MAX_BUDGET_KRW = 100_000_000
TEXT_PART_TYPES = ("text", "input_text")  # chat content part · responses input part
PART_SEPARATOR = "\n"  # content parts 의 text 를 이어 붙이는 구분자
# 발화 없는 Home 요청을 Jev 가 판단할 문장으로 바꾼다. 성별·연령은 넣지 않는다(interview Q5·SC-7)
HOME_REQUEST = (
    "[Home feed] A traveler visiting Korea (country: {country}, language: {language}) just finished onboarding. "
    "Recommend K-beauty products, skin clinics, and review videos for the top of their home screen."
)
# 사용자가 직접 고른 선호가 있을 때만 Home 요청 끝에 붙인다(없으면 위 문장 그대로)
HOME_PREFERENCES = " Their stated preferences: {preferences}."


def join_parts(content) -> str:
    if isinstance(content, list):
        return PART_SEPARATOR.join(p.text for p in content if p.type in TEXT_PART_TYPES and p.text)
    return content or ""


def profile_from_metadata(metadata: dict | None) -> dict | None:
    """metadata.profile(객체) 또는 OpenAI 규격의 평탄한 문자열 metadata(language·country·gender·age_band)."""
    if not metadata:
        return None
    raw = metadata.get("profile") if isinstance(metadata.get("profile"), dict) else metadata
    profile = {k: str(raw[k]).strip() for k in PROFILE_FIELDS if raw.get(k) not in (None, "")}
    profile.update(_preferences_from(raw))
    if not profile:
        return None
    if "country" in profile:
        profile["country"] = profile["country"].upper()  # ISO 3166-1 alpha-2
    if "language" in profile:
        profile["language"] = profile["language"].lower().split("-")[0]  # ISO 639-1
    return profile


def _bad(field: str, rule: str) -> OpenAIError:
    return OpenAIError(400, f"metadata.profile.{field} 이(가) 올바르지 않다: {rule}", "invalid_request_error", f"metadata.profile.{field}")


def _preferences_from(raw: dict) -> dict:
    """currency(ISO 4217 3자)·interests(문자열 목록)·budget_krw(양의 정수)·current_product(문자열). 형식이 틀리면 400."""
    out: dict = {}
    cur = raw.get("currency")
    if cur not in (None, ""):
        if not isinstance(cur, str) or len(cur.strip()) != 3 or not cur.strip().isalpha():
            raise _bad("currency", "ISO 4217 세 글자(예: USD)")
        out["currency"] = cur.strip().upper()
    interests = raw.get("interests")
    if interests not in (None, []):
        if not isinstance(interests, list) or len(interests) > MAX_INTERESTS or not all(
            isinstance(i, str) and 0 < len(i.strip()) <= MAX_INTEREST_CHARS for i in interests
        ):
            raise _bad("interests", f"문자열 목록, 최대 {MAX_INTERESTS}개·각 {MAX_INTEREST_CHARS}자")
        out["interests"] = [i.strip() for i in interests]
    budget = raw.get("budget_krw")
    if budget not in (None, ""):
        if isinstance(budget, bool) or not isinstance(budget, (int, float)) or not 0 < budget <= MAX_BUDGET_KRW:
            raise _bad("budget_krw", f"0 보다 크고 {MAX_BUDGET_KRW} 이하인 숫자")
        out["budget_krw"] = int(budget)
    product = raw.get("current_product")
    if product not in (None, ""):
        if not isinstance(product, str) or len(product.strip()) > MAX_PRODUCT_CHARS:
            raise _bad("current_product", f"{MAX_PRODUCT_CHARS}자 이하 문자열")
        if product.strip():
            out["current_product"] = product.strip()
    return out


def catalog_from_metadata(metadata: dict | None) -> str:
    """metadata.catalog_candidate_ids(공식 카탈로그 id 목록) → respond 턴의 [Official catalog] 본문.

    id 만 받고 문장은 서버 카탈로그로 다시 만든다(임의 문맥 주입 차단). 키가 없으면 '후보 없음' 블록이다.
    """
    raw = (metadata or {}).get(catalog_ctx.CATALOG_IDS_KEY)
    if raw in (None, []):
        return catalog_ctx.NO_CATALOG
    param = f"metadata.{catalog_ctx.CATALOG_IDS_KEY}"
    if not isinstance(raw, list) or len(raw) > catalog_ctx.MAX_CATALOG_IDS or not all(isinstance(i, str) and i for i in raw) \
            or len(set(raw)) != len(raw):
        raise OpenAIError(400, f"{param} 는 중복 없는 카탈로그 id 문자열 목록(최대 {catalog_ctx.MAX_CATALOG_IDS}개)이어야 한다",
                          "invalid_request_error", param)
    try:
        return catalog_ctx.catalog_block(raw, discovery_svc.load_catalog())
    except catalog_ctx.UnknownCatalogIds as exc:
        raise OpenAIError(400, f"{param} 에 카탈로그에 없는 id 가 있다: {exc.ids}", "invalid_request_error", param) from None
    except discovery_svc.CatalogUnavailable as exc:
        raise OpenAIError(503, f"공식 카탈로그를 읽을 수 없다: {exc}", "server_error", param) from None


def home_request(profile: dict) -> str:
    text = HOME_REQUEST.format(country=profile.get("country", "not_given"), language=profile.get("language", "not_given"))
    prefs = []
    if profile.get("interests"):
        prefs.append("interests " + ", ".join(profile["interests"]))
    if profile.get("budget_krw"):
        prefs.append(f"budget about KRW {profile['budget_krw']:,}")
    if profile.get("current_product"):
        prefs.append(f"currently uses {profile['current_product']}")
    return text + (HOME_PREFERENCES.format(preferences="; ".join(prefs)) if prefs else "")


def graph_input_from(
    text: str | None, profile: dict | None, headers: Mapping[str, str], *, multi_turn: bool, thread_header: str,
    catalog: str = catalog_ctx.NO_CATALOG,
) -> tuple[dict, dict]:
    """발화가 있으면 그 발화, 없고 프로필만 있으면 Home 요청 문장을 Jev·respond 의 질문으로 쓴다.

    catalog 는 이번 턴 전용 [Official catalog] 본문이다. Jev 에는 넣지 않고(원문 질문만 분류) respond 턴에만 보인다.
    멀티턴 checkpointer 가 이전 턴 값을 남기지 않도록 매 턴 덮어쓴다.
    """
    if not text and not profile:
        raise OpenAIError(
            400,
            "사용자 발화나 metadata.profile 중 하나는 있어야 한다. "
            '예: {"messages": [], "metadata": {"profile": {"language": "en", "country": "US"}}}',
            "invalid_request_error",
            "messages",
        )
    graph_input: dict = {"messages": [HumanMessage(text or home_request(profile))], "catalog": catalog}
    if profile:
        graph_input["profile"] = profile
    if not multi_turn:
        return graph_input, {}
    thread_id = headers.get(thread_header.lower())
    if not thread_id:
        raise OpenAIError(
            400,
            f"멀티턴 모드에서는 요청 헤더 {thread_header} 가 필요하다. 예: -H '{thread_header}: my-session-1'",
            "invalid_request_error",
            thread_header,
            "missing_thread_header",
        )
    return graph_input, {"configurable": {"thread_id": thread_id}}


def runtime_for(request, model: str):
    registry = request.app.state.registry
    if model not in registry:
        # 입력 계약 검증 — stream=true 여도 SSE 를 열기 전에 404 로 막는다(spec §3.2)
        raise OpenAIError(404, f"Model not found: {model}. 사용 가능한 model: {list(registry)}", "invalid_request_error", "model", "model_not_found")
    return registry[model]

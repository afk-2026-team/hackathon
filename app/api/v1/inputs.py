"""chat/completions·responses 공용 입력 매핑 — 발화·프로필 → 그래프 입력(설계 §3.3 + interview Q1·Q5)."""

from __future__ import annotations

from collections.abc import Mapping

from langchain_core.messages import HumanMessage

from app.utils.errors import OpenAIError

PROFILE_FIELDS = ("language", "country", "gender", "age_band")
TEXT_PART_TYPES = ("text", "input_text")  # chat content part · responses input part
PART_SEPARATOR = "\n"  # content parts 의 text 를 이어 붙이는 구분자
# 발화 없는 Home 요청을 Jev 가 판단할 문장으로 바꾼다. 성별·연령은 넣지 않는다(interview Q5·SC-7)
HOME_REQUEST = (
    "[Home feed] A traveler visiting Korea (country: {country}, language: {language}) just finished onboarding. "
    "Recommend K-beauty products, skin clinics, and review videos for the top of their home screen."
)


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
    if not profile:
        return None
    if "country" in profile:
        profile["country"] = profile["country"].upper()  # ISO 3166-1 alpha-2
    if "language" in profile:
        profile["language"] = profile["language"].lower().split("-")[0]  # ISO 639-1
    return profile


def home_request(profile: dict) -> str:
    return HOME_REQUEST.format(country=profile.get("country", "not_given"), language=profile.get("language", "not_given"))


def graph_input_from(
    text: str | None, profile: dict | None, headers: Mapping[str, str], *, multi_turn: bool, thread_header: str
) -> tuple[dict, dict]:
    """발화가 있으면 그 발화, 없고 프로필만 있으면 Home 요청 문장을 Jev·respond 의 질문으로 쓴다."""
    if not text and not profile:
        raise OpenAIError(
            400,
            "사용자 발화나 metadata.profile 중 하나는 있어야 한다. "
            '예: {"messages": [], "metadata": {"profile": {"language": "en", "country": "US"}}}',
            "invalid_request_error",
            "messages",
        )
    graph_input: dict = {"messages": [HumanMessage(text or home_request(profile))]}
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

from __future__ import annotations

import logging
import os

import yaml
from langchain_core.language_models import BaseChatModel

from app.utils.config import resolve_path
from app.utils.logger import AGENT_LOGGER_NAME

logger = logging.getLogger(AGENT_LOGGER_NAME)


def load_model_spec(path: str, override: dict) -> dict:
    """모델 선언 yaml + 프로필 행 override → spec dict. yaml 키가 없으면 자연 raise(KeyError)."""
    with open(resolve_path(path), encoding="utf-8") as f:
        spec = yaml.safe_load(f)
    # config 계약 검증(spec §4.2 K3) — 오타 키가 조용히 무시되는 것을 막는다. 풀백이 아니다.
    unknown = set(override) - set(spec["sampling"])
    if unknown:
        raise ValueError(f"override 키 {sorted(unknown)} 는 {path} 의 sampling 에 없다: {sorted(spec['sampling'])}")
    spec["sampling"] = {**spec["sampling"], **override}
    return spec


def build_llm(spec: dict) -> BaseChatModel:
    """provider 분기는 여기 한 곳. 모르는 provider 는 KeyError 로 자연 raise."""
    builders = {"anthropic": _anthropic}
    llm = builders[spec["provider"]](spec)
    logger.info(f"[LLM] ✅ {type(llm).__name__}({spec['model_name']}) provider={spec['provider']}")
    return llm


def _anthropic(spec: dict) -> BaseChatModel:
    from langchain_anthropic import ChatAnthropic

    return ChatAnthropic(
        model=spec["model_name"],
        base_url=spec["base_url"],
        api_key=os.environ[spec["api_key_env"]],
        timeout=spec["limits"]["timeout_seconds"],
        max_retries=spec["limits"]["max_retries"],
        # sampling 에 있는 키만 넘긴다 — 모델이 거부하는 키(예: temperature)는 선언 yaml 에서 빼는 방식으로 끈다
        **spec["sampling"],
    )

from __future__ import annotations

import logging
import os

import yaml

from app.utils.config import resolve_path
from app.utils.logger import AGENT_LOGGER_NAME

logger = logging.getLogger(AGENT_LOGGER_NAME)


def load_classifier_spec(path: str) -> dict:
    """결정 모델 선언 yaml → spec dict."""
    with open(resolve_path(path), encoding="utf-8") as f:
        return yaml.safe_load(f)


def build_classifier(spec: dict):
    """결정 모델(provider) 분기는 여기 한 곳. 모르는 provider 는 KeyError 로 자연 raise."""
    builders = {"typesafe": _typesafe}
    classifier = builders[spec["provider"]](spec)
    logger.info(f"[Classifier] ✅ {type(classifier).__name__}({spec['model_name']}) provider={spec['provider']}")
    return classifier


def _typesafe(spec: dict):
    from langchain_typesafe import TypeSafeClassifier

    return TypeSafeClassifier(
        model=spec["model_name"],
        # 라이브러리 기본 TYPESAFE_API_KEY 가 아니라 선언 yaml 이 정한 변수 이름을 읽는다
        api_key=os.environ[spec["api_key_env"]],
        base_url=spec["base_url"],
        timeout=spec["limits"]["timeout_seconds"],
    )

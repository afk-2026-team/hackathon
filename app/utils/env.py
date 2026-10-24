from __future__ import annotations

import logging

from dotenv import load_dotenv

from app.utils.config import resolve_path
from app.utils.logger import AGENT_LOGGER_NAME

logger = logging.getLogger(AGENT_LOGGER_NAME)


def load_env_files(paths: list[str]) -> None:
    """기동 시 1회. 파일이 없으면 open 이 자연 raise 한다(load_dotenv 의 조용한 False 를 피한다). 값은 로그에 남기지 않는다."""
    for path in paths:
        with open(resolve_path(path), encoding="utf-8") as f:
            load_dotenv(stream=f, override=False)
    logger.info(f"[Env] ✅ 키 파일 {len(paths)}개 로드")

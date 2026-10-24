from __future__ import annotations

import logging

AGENT_LOGGER_NAME = "agent"
# 외부 HTTP 클라이언트(Anthropic SDK=httpx, langchain-typesafe=httpx2)는 요청마다 INFO 를 쏟아 판정 로그를 가린다
_NOISY_LOGGERS = ("httpx", "httpcore", "httpx2")


def init_logging(level: str, agent_name: str) -> None:
    """엔트리포인트(app/serve.py)에서 1회만 호출한다."""
    logging.basicConfig(level=level, format=f"%(asctime)s %(levelname)s [{agent_name}] %(name)s %(message)s")
    for name in _NOISY_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)

from __future__ import annotations

import uvicorn

from app.server import create_app
from app.utils.config import load_config
from app.utils.logger import init_logging


def main() -> None:
    """키는 팀 실행기가 환경변수로 주입한다: node scripts/secrets.mjs run --env dev --services ash_workflow -- uv run python -m app.serve"""
    config = load_config()  # 계약 위반이면 여기서 raise → 비 0 종료(V7)
    init_logging(config["log_level"], config["AGENT_NAME"])
    uvicorn.run(
        create_app(config),
        host=config["server"]["host"],
        port=config["server"]["port"],
        log_level=config["log_level"].lower(),
    )


if __name__ == "__main__":
    main()

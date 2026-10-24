from __future__ import annotations

import os
from pathlib import Path

import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG_PATH = "envs/agent_config.yaml"
CONFIG_ENV_VAR = "AGENT_CONFIG"

SERVING_TYPE = "chat/completions"  # 서빙 표면은 이것 하나(spec §3)
LOG_LEVELS = ("DEBUG", "INFO", "WARNING", "ERROR")
PORT_RANGE = range(1, 65536)

# 키 계약(spec §4.1·§6.5) — 여기와 envs/agent_config.yaml 을 함께 바꾼다. 모르는 키는 기동 거부(K3).
TOP_KEYS = {"AGENT_NAME", "log_level", "server", "profiles", "jev", "router", "prompt", "multi_turn"}
BLOCK_KEYS = {
    "server": {"host", "port", "serving_type"},
    "jev": {"model_path", "questions_prompt"},
    "router": {"branching_enabled", "decline_labels"},
    "prompt": {"respond_system", "respond_turn", "decline_system"},
    "multi_turn": {"enabled", "thread_header"},
}
PROFILE_KEYS = {"id", "llm"}
PROFILE_LLM_KEYS = {"path", "override"}


def resolve_path(path: str | Path) -> Path:
    """config 안의 상대경로는 프로젝트 루트 기준으로 푼다."""
    p = Path(path)
    return p if p.is_absolute() else PROJECT_ROOT / p


def load_config(path: str | None = None) -> dict:
    """우선순위: 인자 path > 환경변수 AGENT_CONFIG > envs/agent_config.yaml."""
    chosen = path or os.environ.get(CONFIG_ENV_VAR) or DEFAULT_CONFIG_PATH
    with open(resolve_path(chosen), encoding="utf-8") as f:
        config = yaml.safe_load(f)
    validate_config(config)
    return config


def _exact_keys(where: str, actual: dict, expected: set[str]) -> None:
    unknown, missing = set(actual) - expected, expected - set(actual)
    if unknown or missing:
        raise ValueError(f"{where} 키 계약 위반 — 모르는 키 {sorted(unknown)}, 빠진 키 {sorted(missing)}")


def _is_bool(where: str, value: object) -> None:
    if not isinstance(value, bool):
        raise ValueError(f"{where} 는 true/false 여야 한다: {value!r}")


def validate_config(config: dict) -> None:
    """config 계약 검증(spec §4.2 K3·K4) — 쓴 쪽이 고칠 값이면 기동을 거부한다. 풀백이 아니다."""
    _exact_keys("최상위", config, TOP_KEYS)
    for block, keys in BLOCK_KEYS.items():
        _exact_keys(block, config[block], keys)

    if config["log_level"] not in LOG_LEVELS:
        raise ValueError(f"log_level 허용값 {LOG_LEVELS}: {config['log_level']!r}")
    server = config["server"]
    if server["serving_type"] != SERVING_TYPE:
        raise ValueError(f"server.serving_type 허용값은 {SERVING_TYPE!r} 하나: {server['serving_type']!r}")
    if not isinstance(server["port"], int) or server["port"] not in PORT_RANGE:
        raise ValueError(f"server.port 는 1..65535 정수: {server['port']!r}")

    profiles = config["profiles"]
    if not isinstance(profiles, list) or not profiles:
        raise ValueError("profiles 는 1행 이상이어야 한다(0행 → 기동 거부)")
    for i, row in enumerate(profiles):
        _exact_keys(f"profiles[{i}]", row, PROFILE_KEYS)
        _exact_keys(f"profiles[{i}].llm", row["llm"], PROFILE_LLM_KEYS)
        if not isinstance(row["llm"]["override"], dict):
            raise ValueError(f"profiles[{i}].llm.override 는 mapping 이어야 한다(비어도 {{}})")
    ids = [row["id"] for row in profiles]
    if len(ids) != len(set(ids)):
        raise ValueError(f"profiles id 중복: {ids}")

    _is_bool("router.branching_enabled", config["router"]["branching_enabled"])
    if not isinstance(config["router"]["decline_labels"], list):
        raise ValueError("router.decline_labels 는 라벨 목록이어야 한다(비우려면 [])")
    _is_bool("multi_turn.enabled", config["multi_turn"]["enabled"])
    header = config["multi_turn"]["thread_header"]
    if not isinstance(header, str) or not header.strip():
        raise ValueError(f"multi_turn.thread_header 는 비어 있지 않은 헤더 이름이어야 한다: {header!r}")

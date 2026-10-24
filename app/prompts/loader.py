from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import TypeAdapter

PROMPTS_DIR = Path(__file__).resolve().parent
_cache: dict[str, dict] = {}


def load_prompt(filename: str) -> dict:
    """app/prompts/<filename> 을 1회 읽어 캐시한다. 파일이 없으면 자연 raise."""
    if filename not in _cache:
        with open(PROMPTS_DIR / filename, encoding="utf-8") as f:
            _cache[filename] = yaml.safe_load(f)
    return _cache[filename]


def load_system(filename: str) -> str:
    """(C) raw system 메시지 형식 — 본문 필드 content 가 없으면 KeyError."""
    return load_prompt(filename)["content"]


def load_template(filename: str) -> str:
    """(T) 단일 템플릿 형식 — 본문 필드 template 이 없으면 KeyError."""
    return load_prompt(filename)["template"]


def load_questions(filename: str) -> dict:
    """결정 모델 질문 형식 — questions 의 각 항목을 langchain-typesafe Question(Noul|Choice|Score)으로 검증해 돌려준다."""
    from langchain_typesafe import Question

    adapter = TypeAdapter(Question)
    return {qid: adapter.validate_python(raw) for qid, raw in load_prompt(filename)["questions"].items()}


def load_workflow_prompts(config: dict) -> dict:
    """그래프 조립 시점에 주입할 프롬프트 묶음. 파일명은 config 가 갖는다(spec §2.4·K5)."""
    names = config["prompt"]
    return {
        "respond_system": load_system(names["respond_system"]),
        "respond_turn": load_template(names["respond_turn"]),
        "decline_system": load_system(names["decline_system"]),
        "pseudo_jev_system": load_system(names["pseudo_jev_system"]),
        "jev_questions": load_questions(config["jev"]["questions_prompt"]),
    }

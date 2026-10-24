from __future__ import annotations

import logging
from dataclasses import dataclass

from langgraph.graph.state import CompiledStateGraph

from app.graph.builder import build_graph
from app.knowledge.okf import load_bundle
from app.models.classifier_loader import build_classifier, load_classifier_spec
from app.models.llm_loader import build_llm, load_model_spec
from app.prompts.loader import load_workflow_prompts
from app.utils.config import resolve_path
from app.utils.logger import AGENT_LOGGER_NAME

logger = logging.getLogger(AGENT_LOGGER_NAME)


@dataclass(frozen=True)
class ProfileRuntime:
    graph: CompiledStateGraph
    nodes: list[str]  # /health 관측 근거(W9)
    multi_turn: bool
    knowledge_count: int  # 기동 시 읽은 OKF concept 수


def build_registry(config: dict) -> dict[str, ProfileRuntime]:
    """기동 게이트 — 프로필 전부를 기동 시 1회 컴파일한다(W7). 하나라도 실패하면 예외가 그대로 올라가 기동이 멈춘다."""
    prompts = load_workflow_prompts(config)
    classifier = build_classifier(load_classifier_spec(config["jev"]["model_path"]))
    concepts = load_bundle(resolve_path(config["knowledge"]["bundle_path"]))
    if not concepts:  # 근거 없이 조언자를 띄우지 않는다
        raise ValueError(f"knowledge.bundle_path 에 concept 이 없다: {config['knowledge']['bundle_path']} — 크롤러를 먼저 실행한다")
    registry: dict[str, ProfileRuntime] = {}
    for row in config["profiles"]:
        llm = build_llm(load_model_spec(row["llm"]["path"], row["llm"]["override"]))
        graph = build_graph(llm, classifier, config, prompts, concepts)
        node_names = [n for n in graph.get_graph().nodes if not n.startswith("__")]
        registry[row["id"]] = ProfileRuntime(
            graph=graph, nodes=node_names, multi_turn=config["multi_turn"]["enabled"], knowledge_count=len(concepts)
        )
    logger.info(f"[BootGate] ✅ 프로필 {len(registry)}개 컴파일: {list(registry)}")
    return registry

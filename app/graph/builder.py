from __future__ import annotations

import logging
from functools import partial

from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import PromptTemplate
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.graph import nodes as N
from app.graph.state import AgentState
from app.utils.logger import AGENT_LOGGER_NAME

logger = logging.getLogger(AGENT_LOGGER_NAME)


def build_graph(llm: BaseChatModel, classifier, config: dict, prompts: dict) -> CompiledStateGraph:
    """서빙 계층과의 단일 진입점(W2). knob 을 읽어 노드·엣지·checkpointer 를 정하고, 노드에는 필요한 값만 주입한다(W3·W4)."""
    router, multi_turn = config["router"], config["multi_turn"]
    questions = prompts["jev_questions"]

    # config 계약 검증(K3) — decline 라벨은 Jev 가 실제로 고를 수 있는 라벨이어야 한다
    labels = set(questions[N.CATEGORY_QID].criteria)
    unknown = set(router["decline_labels"]) - labels
    if unknown:
        raise ValueError(f"router.decline_labels {sorted(unknown)} 는 category criteria 에 없다: {sorted(labels)}")

    graph = StateGraph(AgentState)
    graph.add_node(
        N.JEV_JUDGE,
        partial(N.jev_judge, classifier=classifier, questions=questions, decline_labels=router["decline_labels"]),
    )
    graph.add_node(
        N.RESPOND,
        partial(
            N.respond,
            llm=llm,
            system_prompt=prompts["respond_system"],
            turn_template=PromptTemplate.from_template(prompts["respond_turn"]),
        ),
    )
    graph.add_edge(START, N.JEV_JUDGE)
    if router["branching_enabled"]:
        graph.add_node(N.DECLINE, partial(N.decline, llm=llm, system_prompt=prompts["decline_system"]))
        graph.add_conditional_edges(N.JEV_JUDGE, N.route_after_judge, [N.RESPOND, N.DECLINE])
        graph.add_edge(N.DECLINE, END)
    else:
        graph.add_edge(N.JEV_JUDGE, N.RESPOND)
    graph.add_edge(N.RESPOND, END)

    checkpointer = InMemorySaver() if multi_turn["enabled"] else None
    compiled = graph.compile(checkpointer=checkpointer)
    logger.info(
        f"[Graph] ✅ branching={router['branching_enabled']} multi_turn={multi_turn['enabled']} "
        f"nodes={[n for n in compiled.get_graph().nodes if not n.startswith('__')]}"
    )
    return compiled

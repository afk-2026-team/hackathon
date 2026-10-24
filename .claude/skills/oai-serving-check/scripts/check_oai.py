"""OpenAI 호환 응답 형식 판정기 — 표준 라이브러리만 쓴다.

사용:
  python check_oai.py completion <response.json> [--model M]
  python check_oai.py stream     <response.sse>  [--model M]
  python check_oai.py error      <response.json> [--status N]
  python check_oai.py models     <models.json>   [--expect-ids a,b]
출력: 첫 줄 PASS|FAIL, 이후 위반 1건당 1줄("- <규칙 id>: <설명>"). 종료코드 0=PASS, 1=FAIL.
"""
from __future__ import annotations

import argparse
import json
import sys

FINISH = {"stop", "length", "tool_calls", "content_filter"}
DONE = "[DONE]"


def check_completion(obj: dict, model: str | None) -> list[str]:
    v = []
    if obj.get("object") != "chat.completion":
        v.append(f"C1: object 는 'chat.completion' 이어야 한다: {obj.get('object')!r}")
    if not isinstance(obj.get("id"), str) or not obj["id"]:
        v.append("C2: id 는 비어 있지 않은 문자열")
    if not isinstance(obj.get("created"), int):
        v.append("C3: created 는 정수(unix seconds)")
    if model is not None and obj.get("model") != model:
        v.append(f"C4: model 이 요청 값과 다르다: {obj.get('model')!r} != {model!r}")
    choices = obj.get("choices")
    if not isinstance(choices, list) or not choices:
        return v + ["C5: choices 는 1개 이상인 목록"]
    for i, ch in enumerate(choices):
        if ch.get("index") != i:
            v.append(f"C6: choices[{i}].index != {i}")
        msg = ch.get("message") or {}
        if msg.get("role") != "assistant":
            v.append(f"C7: choices[{i}].message.role 은 'assistant'")
        if not isinstance(msg.get("content"), str) or not msg["content"].strip():
            v.append(f"C8: choices[{i}].message.content 는 비어 있지 않은 문자열")
        if ch.get("finish_reason") not in FINISH:
            v.append(f"C9: choices[{i}].finish_reason ∈ {sorted(FINISH)}: {ch.get('finish_reason')!r}")
    return v


def check_stream(text: str, model: str | None) -> list[str]:
    v = []
    frames = [f for f in text.replace("\r\n", "\n").split("\n\n") if f.strip()]
    if not frames:
        return ["S0: 프레임이 없다"]
    for i, f in enumerate(frames):
        if not f.startswith("data: "):
            v.append(f"S1: 프레임 {i} 가 'data: ' 로 시작하지 않는다: {f[:40]!r}")
    if frames[-1] != f"data: {DONE}":
        v.append(f"S2: 마지막 프레임은 'data: {DONE}': {frames[-1][:40]!r}")
    body = [f[len("data: "):] for f in frames if f.startswith("data: ") and f != f"data: {DONE}"]
    if sum(1 for f in frames if f == f"data: {DONE}") != 1:
        v.append(f"S3: [DONE] 는 정확히 1번")
    chunks = []
    for i, raw in enumerate(body):
        try:  # 판정기 자체의 입력 파싱 — 깨진 JSON 은 위반으로 보고하고 계속 본다
            chunks.append(json.loads(raw))
        except json.JSONDecodeError:
            v.append(f"S4: chunk {i} 가 JSON 이 아니다: {raw[:40]!r}")
    if not chunks:
        return v + ["S5: chat.completion.chunk 가 없다"]
    ids = {c.get("id") for c in chunks}
    if len(ids) != 1:
        v.append(f"S6: 모든 chunk 의 id 가 같아야 한다: {sorted(map(str, ids))}")
    for i, c in enumerate(chunks):
        if c.get("object") != "chat.completion.chunk":
            v.append(f"S7: chunk {i} object != 'chat.completion.chunk'")
        if not isinstance(c.get("created"), int):
            v.append(f"S8: chunk {i} created 는 정수")
        if model is not None and c.get("model") != model:
            v.append(f"S9: chunk {i} model 이 요청 값과 다르다")
        if "choices" not in c:
            v.append(f"S10: chunk {i} 에 choices 가 없다")
    with_choices = [c for c in chunks if c.get("choices")]
    usage = [c for c in chunks if c.get("choices") == []]
    if len(usage) > 1:
        v.append(f"S11: usage chunk(choices=[])는 0~1개: {len(usage)}")
    if usage and chunks[-1] is not usage[0]:
        v.append("S12: usage chunk 는 [DONE] 바로 앞이어야 한다")
    if not with_choices:
        return v + ["S13: choices 가 있는 chunk 가 없다"]
    if with_choices[0]["choices"][0].get("delta", {}).get("role") != "assistant":
        v.append("S14: 첫 chunk delta.role 은 'assistant'")
    last = with_choices[-1]["choices"][0]
    if last.get("finish_reason") not in FINISH:
        v.append(f"S15: 마지막 chunk finish_reason ∈ {sorted(FINISH)}: {last.get('finish_reason')!r}")
    for i, c in enumerate(with_choices[:-1]):
        if c["choices"][0].get("finish_reason") is not None:
            v.append(f"S16: 마지막 이전 chunk {i} 의 finish_reason 은 null")
    content = "".join(c["choices"][0].get("delta", {}).get("content") or "" for c in with_choices)
    if not content.strip():
        v.append("S17: delta.content 를 이어 붙인 결과가 비어 있다")
    return v


def check_error(obj: dict, status: int | None) -> list[str]:
    v = []
    if set(obj) != {"error"}:
        v.append(f"E1: 최상위 키는 'error' 하나여야 한다(FastAPI detail 금지): {sorted(obj)}")
    err = obj.get("error") or {}
    if not isinstance(err.get("message"), str) or not err["message"]:
        v.append("E2: error.message 는 비어 있지 않은 문자열")
    if not isinstance(err.get("type"), str):
        v.append("E3: error.type 은 문자열")
    if status is not None and status >= 500 and err.get("type") != "server_error":
        v.append("E4: 5xx 는 type='server_error'")
    if status is not None and 400 <= status < 500 and err.get("type") != "invalid_request_error":
        v.append("E5: 4xx 는 type='invalid_request_error'")
    for k in ("param", "code"):
        if k in err and err[k] is not None and not isinstance(err[k], str):
            v.append(f"E6: error.{k} 는 문자열 또는 null")
    return v


def check_models(obj: dict, expect_ids: list[str] | None) -> list[str]:
    v = []
    if obj.get("object") != "list":
        v.append("M1: object 는 'list'")
    data = obj.get("data")
    if not isinstance(data, list):
        return v + ["M2: data 는 목록"]
    for i, m in enumerate(data):
        if m.get("object") != "model" or not isinstance(m.get("id"), str) or not isinstance(m.get("created"), int) or not isinstance(m.get("owned_by"), str):
            v.append(f"M3: data[{i}] 는 {{id:str, object:'model', created:int, owned_by:str}}")
    if expect_ids is not None and sorted(m.get("id") for m in data) != sorted(expect_ids):
        v.append(f"M4: id 집합이 기대와 다르다: {sorted(m.get('id') for m in data)} != {sorted(expect_ids)}")
    return v


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("kind", choices=["completion", "stream", "error", "models"])
    ap.add_argument("path")
    ap.add_argument("--model")
    ap.add_argument("--status", type=int)
    ap.add_argument("--expect-ids")
    a = ap.parse_args()
    with open(a.path, encoding="utf-8") as f:
        raw = f.read()
    if a.kind == "stream":
        violations = check_stream(raw, a.model)
    else:
        obj = json.loads(raw)
        violations = {
            "completion": lambda: check_completion(obj, a.model),
            "error": lambda: check_error(obj, a.status),
            "models": lambda: check_models(obj, a.expect_ids.split(",") if a.expect_ids else None),
        }[a.kind]()
    print("PASS" if not violations else "FAIL")
    for line in violations:
        print(f"- {line}")
    return 0 if not violations else 1


if __name__ == "__main__":
    sys.exit(main())

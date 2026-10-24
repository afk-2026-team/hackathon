---
name: oai-serving-check
description: OpenAI 호환 서빙 응답 형식 검증 체크리스트. /v1/chat/completions 의 chat.completion JSON, stream=true SSE(chat.completion.chunk + [DONE]), OpenAI error envelope, /v1/models 목록을 규칙 id 단위로 판정한다. 라이브서버 V3·V4·V6 판정, OpenAI 호환 응답 확인, SSE 형식 점검, "응답 형식 맞는지 봐줘" 에 사용한다.
---

# oai-serving-check — OpenAI 호환 응답 형식 판정

응답을 **파일로 저장한 뒤** 판정기를 돌린다. 판정기는 표준 라이브러리만 쓰므로 프로젝트 venv 없이도 돈다.
답변 *품질* 은 보지 않는다(형식·거동만).

## 사용법

```bash
S=.claude/skills/oai-serving-check/scripts/check_oai.py
# 비스트리밍 (V3)
curl -s -o temp/v3.json -w '%{http_code}' $BASE/v1/chat/completions -H 'Content-Type: application/json' \
  -d '{"model":"'$M'","messages":[{"role":"user","content":"…"}],"stream":false}'
python3 $S completion temp/v3.json --model $M
# 스트리밍 (V4) — -N 으로 버퍼링 끄기
curl -N -s -o temp/v4.sse -w '%{http_code}' … '"stream":true}'
python3 $S stream temp/v4.sse --model $M
# 오류 envelope (V6) — 상태 코드는 curl -w 로 따로 받아 --status 로 넘긴다
python3 $S error temp/v6.json --status 404
# 모델 목록 (V2)
python3 $S models temp/v2.json --expect-ids m1,m2
```

출력 첫 줄이 `PASS`/`FAIL`, 이어서 위반이 `- <규칙 id>: <설명>` 으로 1줄씩 나온다. 종료코드 0=PASS·1=FAIL.
1급 증빙에는 명령 원문과 이 출력을 그대로 붙인다.

## 체크리스트 (판정기 규칙 id)

| 대상 | id | 규칙 |
|---|---|---|
| chat.completion | C1–C4 | `object="chat.completion"`, `id` 비지 않은 문자열, `created` 정수, `model` = 요청 값 |
| | C5–C9 | `choices` ≥1, `index` 순번, `message.role="assistant"`, `content` 비지 않음, `finish_reason ∈ {stop,length,tool_calls,content_filter}` |
| SSE | S1–S3 | 모든 프레임 `data: ` 로 시작(프레임 구분 빈 줄), 마지막 프레임 `data: [DONE]`, `[DONE]` 정확히 1번 |
| | S4–S10 | 각 chunk JSON, 같은 `id`, `object="chat.completion.chunk"`, `created` 정수, `model` = 요청 값, `choices` 키 존재 |
| | S11–S12 | usage chunk(`choices: []`)는 0~1개이며 `[DONE]` 바로 앞 |
| | S13–S17 | 첫 chunk `delta.role="assistant"`, 마지막 choices chunk 의 `finish_reason` 유효, 그 앞 chunk 는 `finish_reason: null`, `delta.content` 연결이 비지 않음 |
| error | E1–E6 | 최상위 키 `error` 하나(FastAPI `detail` 금지), `message`·`type` 문자열, 5xx→`server_error`, 4xx→`invalid_request_error`, `param`·`code` 문자열|null |
| models | M1–M4 | `object="list"`, `data[]` 각 `{id, object:"model", created, owned_by}`, (선택) id 집합 일치 |

## 판정기가 보지 않는 것 (사람·다른 지표 몫)

- HTTP 상태 코드·`Content-Type` 헤더 — curl `-w '%{http_code} %{content_type}'` 로 따로 받아 판정한다.
- 없는 model 의 스트리밍 요청이 **SSE 를 열기 전에** 404 JSON 인지 — `content_type` 이 `application/json` 인지로 본다.
- 스트림·비스트림 텍스트 동등성 — 실제 LLM 은 비결정적이라 라이브에서는 관측만 하고, mock LLM pytest 로 판정한다.

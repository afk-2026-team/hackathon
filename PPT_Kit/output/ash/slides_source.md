# Sparks · 오늘 만든 것 (ash 작업분) — 압축용 원본

> 이 파일은 `slides.html`·`slides.pdf`(2장)의 **원본 텍스트와 근거 자료**입니다.
> 팀 최종본(최대 2장)으로 줄일 때 PDF 대신 이 파일을 쓰세요.
> - 각 항목에 **우선순위(P1 반드시 · P2 가능하면 · P3 빼도 됨)** 를 달았습니다.
> - 수치는 모두 실측이고, 근거 위치(`path:줄`)를 함께 적었습니다. 줄일 때 수치를 바꾸거나 반올림하지 마세요.
> - 기준 시점: 2026-10-24 16시(KST), 저장소 `afk-2026-team/hackathon` main.

## 한 줄 요약 (P1 — 1줄만 남긴다면)
- EN: **A shared Claude Code "factory" for the whole team, and one always-on AI Function that works with any model and any judge, grounded in a structured (Google OKF) context DB.**
- KO: 팀 전원이 같은 규칙으로 일하는 Claude Code 소프트웨어 팩토리 + 모델·판정기를 갈아 끼울 수 있는 상시 AI Function + Google OKF로 정형화한 크롤링 Context DB.

---

## 1/2 · THE FACTORY — 팀 공용 Claude Code base layer

### 슬라이드 문구 (원문 그대로)
- 제목 (P1): **Every teammate's Claude Code runs one factory line**
- 부제 (P2): A shared base layer of work rules and doc rules: same steps, same artifacts, same proof, whoever runs the task.
- 5단계 파이프라인 (P1 — 단계 이름만 남겨도 됨)

| 단계 | 이름 | 설명 |
|---|---|---|
| ① INTERVIEW | Intent | The only human gate: an approved quote |
| ② PLAN | Criteria | Every AC is a CHECK + EXPECT |
| ③ DEVLOG | Build | Commands verbatim, dead ends kept |
| ④ CHECKLIST | Verdict | Fresh-eyes validator, PASS needs evidence |
| ⑤ WIKI-DESK | Memory | OKF pointer cards → `path:line` |

- 실패 경로 (P2): ↺ FAIL routes back by cause: build bug → ③ · wrong plan → ② · unclear intent → ①
- 카드 3개
  - TODAY, MEASURED (P2): **59 linked docs**. 13 intents → 18 plans → 15 build logs → 13 verdicts, all chained by `upstream`
  - QUALITY FLOOR (P1): **13 evidence-backed verdicts**. 12 PASS · 1 FAIL caught, sent back to build, re-checked to PASS
  - WHERE CLAUDE WORKS (P1 — GUIDE 필수 항목): Claude Code plans and builds. A separate Claude validator judges. The librarian skill feeds past decisions back in.

### 왜 했나 (발표 멘트용, P2)
- Claude Code가 SDLC 문서 체인(의도 → 계획 → 실행 기록 → 검증)을 따라 매번 같은 방식으로 일하게 해서, 누가 작업하든 결과물 품질의 **하한**을 끌어올립니다.
- 사람 승인은 interview 한 곳에서만 받습니다. 그다음부터는 에이전트가 자율로 진행하고, 완료는 검증(PASS)으로만 선언합니다.

### 근거
| 내용 | 위치 |
|---|---|
| 사람 게이트는 interview 한 곳 | `.claude/rules/workflow.md:16-17` |
| AC = CHECK + EXPECT | `.claude/rules/workflow.md:30` |
| FAIL 원인별 되돌림 | `.claude/rules/workflow.md:41-43` |
| 문서 이름·upstream 규칙 | `.claude/rules/docs.md` §1·§2 |
| 사서 스킬 설치 | `docs/devlog/devlog_26102410_SDD서고환경_설치.md:10-18` |
| 59건 = 13·18·15·13 | `docs/<type>/<type>_2610*` 개수. 이 발표자료 작업 문서 4건을 넣기 **전** 기준 |
| 12 PASS · 1 FAIL → 재검 PASS | `docs/checklist/checklist_26102414_조언자_OKF_크롤링DB_워크플로우.md:40`, `docs/checklist/checklist_26102414_26_35_조언자_OKF_크롤링DB_워크플로우.md:7-12` |

---

## 2/2 · THE FUNCTION — 어댑터·팩토리 AI workflow + OKF Context DB

### 슬라이드 문구 (원문 그대로)
- 제목 (P1): **One always-on Function. Any model, same contract.**
- 부제 (P2): The step every beauty answer goes through, built as a LangGraph workflow behind an OpenAI-compatible API.
- 흐름 (P1)

| 단계 | 이름 | 설명 |
|---|---|---|
| REQUEST | Profile + question | `/v1/chat` · `/v1/responses` |
| ① JUDGE · FACTORY | Topic & intent | 스위치: **JEV** (기본) / Pseudo_JEV |
| ② RETRIEVE | Top-5 evidence | Rules only, no LLM |
| ③ RESPOND · ADAPTER | Answer + source IDs | Haiku · Sonnet · Opus |

- 분기 (P3): Out of scope (stocks, weather) → polite decline, retrieve skipped
- 카드 3개
  - ADAPTER · ANY MODEL (P1): 1 yaml = 1 model. One `build_llm()` picks the provider, so cost vs. quality is a config change.
  - FACTORY · JEV FALLBACK (P1): `jev.mode` builds JEV or Sonnet-as-JEV with the same output shape. Live E2E 10/10 in JEV format, 0 format errors
  - CONTEXT DB · GOOGLE OKF v0.2 (P1): 30 crawled blogs & videos → structured concepts. 실제 concept 발췌 (P3, 공간 없으면 삭제)
    ```yaml
    category: k_medical
    sponsored: unknown        # + evidence
    foreigner_friendly: true
    provenance: measured
    ```

### 왜 했나 (발표 멘트용, P2)
- **패턴화:** 뷰티 추천 Agent에서 언제나 실행되는 Function(판정 → 근거 검색 → 응답)을 패턴으로 묶고, LangChain/LangGraph workflow로 설계했습니다.
- **어댑터 (모델 애그노스틱 · 토큰 이코노믹스):** 모델 1개 = yaml 1개입니다. 응답 모델을 Haiku·Sonnet·Opus 중에서 설정만 바꿔 고릅니다. 공급자 분기 코드는 한 곳뿐입니다.
- **팩토리 (Jev 대체 경로):** Jev 모델을 못 쓰게 되는 상황에 대비했습니다.
  - `jev.mode: pseudo_jev`로 바꾸고 서버를 재시작하면 Sonnet이 Jev와 같은 출력 형식(ClassifierResponse)을 냅니다.
  - 형식은 json_schema 제약 디코딩으로 강제합니다.
  - 고르지 않은 쪽 판정기는 만들지 않습니다.
- **Context DB (OKF 정형화):** 크롤링한 웹 데이터는 비정형입니다. 이것을 Google의 Open Knowledge Format v0.2로 정형화해서 AI workflow가 해석하기 쉽게 만들었습니다.
  - 협찬 여부, 국가·언어 신호, 외국인 친화 여부를 **근거 문장과 함께** 기록합니다.
  - 측정한 값과 추정한 값은 `provenance`로 구분합니다.

### 근거
| 내용 | 위치 |
|---|---|
| Chat·Responses API | `docs/devlog/devlog_26102414_조언자_OKF_크롤링DB_워크플로우.md:20` |
| 판정기 스위치 | `envs/agent_config.yaml:25` (`mode: jev`), `app/utils/boot_gate.py:28-33` (`build_judge`) |
| 근거 5건, 규칙 기반 | `envs/agent_config.yaml:50` (`top_n: 5`), `docs/devlog/devlog_26102414_조언자_OKF_크롤링DB_워크플로우.md:16` |
| 모델 3종 yaml, `build_llm` | `envs/models/claude-{haiku,sonnet,opus}-5-5_anthropic.yaml`, `app/models/llm_loader.py:27-29` |
| E2E 10/10, 형식 오류 0 | `docs/devlog/devlog_26102415_32_11_Pseudo_JEV_json_schema_보강.md:33`, `docs/checklist/checklist_26102415_32_11_Pseudo_JEV_json_schema_보강.md:23` |
| 범위 밖 → decline | `docs/devlog/devlog_26102415_32_11_Pseudo_JEV_json_schema_보강.md:44-45` |
| Google OKF v0.2 | `Crawling_DB/README.md:16` |
| 30건 (product 15 · clinic 10 · video 5, 블로그 25 · YouTube 5) | `docs/checklist/checklist_26102414_26_35_조언자_OKF_크롤링DB_워크플로우.md:17` |
| OKF 발췌 원본 | `Crawling_DB/clinics/naver-blog-khshi001-224435086306.md:12,17,18,27` |

---

## 압축할 때 주의 (GUIDE.md 기준)
- 형식: 1920×1080, **최대 2장**, 본문 28px 이상, 왼쪽 위 팀 이름 `Sparks`, 하단 로고 띠(폭 90%, 겹침 금지), 최종 제출은 PDF.
- GUIDE "2장 · 오늘 만든 것"의 필수 요소는 **Claude를 어디에 썼는지**입니다. P1 "WHERE CLAUDE WORKS"는 남겨 주세요.
- 다른 팀원 작업과 합쳐 1장으로 줄일 때 추천 조합: 1/2의 5단계 이름 + QUALITY FLOOR, 2/2의 흐름 4단계 + ADAPTER·FACTORY·OKF 세 줄.
- 다시 렌더링하려면 `slides.html`을 Chrome에서 열고 인쇄 → PDF로 저장(여백 없음, 배경 그래픽 체크)합니다.
- 아직 없는 것:
  - 실제 앱 화면 스크린샷(GUIDE 권장)
  - 1장 "무엇을, 누구에게" 내용

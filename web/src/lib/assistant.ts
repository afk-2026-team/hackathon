// Home AI 연결 — 같은 origin 의 POST /v1/responses(discovery_server 프록시 → app.serve).
// 백엔드 계약: metadata.profile = { language, country, gender?, age_band?, currency?, interests?, budget_krw?, current_product? }.
// 질문이 없으면 Home 추천 요청이 된다. 응답 metadata 의 candidates(서버가 고른 실제 카탈로그 후보)와
// recommended_ids(모델이 답에 실제 인용한 후보 id)만 화면 링크에 쓴다 — 답 본문의 이름으로 상품을 추정하지 않는다.
import { ApiError } from './api'
import type { ListPrice, ProfilePayload, Source } from './types'

export const ASSISTANT_PATH = '/v1/responses'
export const ASSISTANT_TIMEOUT_MS = 65_000 // 서버 프록시 상한(60s)보다 조금 길게
export const MAX_QUESTION_CHARS = 2000 // 서버 검증(max_length)과 같은 값

export interface AssistantProfile {
  language: string
  country: string
  gender?: string
  age_band?: string
  currency?: string
  interests?: string[]
  budget_krw?: number
  current_product?: string
}

// 서버 검증 한도와 같은 값(app/api/v1/inputs.py). 넘는 값은 보내기 전에 잘라 422 를 피한다.
export const MAX_INTERESTS = 10
export const MAX_INTEREST_CHARS = 40
export const MAX_BUDGET_KRW = 100_000_000
export const MAX_PRODUCT_CHARS = 200

/** 서버가 고른 실제 카탈로그 후보(필요한 필드만). */
export interface AssistantCandidate {
  id: string
  kind: string
  category: 'beauty' | 'medical'
  title: string
  subtitle: string
  image_url: string | null
  price_krw: number | null
  list_price: ListPrice | null
  reasons: string[]
  sources: Source[]
}
export type CandidatesStatus = 'ok' | 'unavailable' | 'none'

export type AssistantErrorKind = 'invalid_input' | 'network' | 'timeout' | 'unavailable' | 'http' | 'parse' | 'aborted'

// message 는 사용자 문구(상태 코드·내부 원인 없음). 서버 원문은 detail 에만 둔다.
// ApiError 를 상속한다 — 화면은 다른 API 와 같이 instanceof ApiError·status 로 분기할 수 있다.
export class AssistantError extends ApiError {
  constructor(message: string, readonly kind: AssistantErrorKind, status = 0, detail = '') {
    super(message, status, detail)
  }
}

const HTTP_MESSAGES: Record<'unavailable' | 'timeout' | 'invalid_input' | 'http', string> = {
  unavailable: "The AI assistant isn't available right now. Please try again later.",
  timeout: 'The assistant took too long to answer. Please try again.',
  invalid_input: 'Please check your question and try again.',
  http: "The assistant couldn't answer right now. Please try again.",
}

export interface AssistantAnswer {
  responseId: string
  status: 'completed' | 'incomplete'
  text: string
  candidates: AssistantCandidate[]
  candidatesStatus: CandidatesStatus // none = 서버가 후보 정보를 보내지 않음
  recommendedIds: string[] // 모델이 답에 인용한 후보 id(후보 목록에 있는 것만)
}

/** 온보딩 결과(ProfilePayload) → /v1/responses metadata.profile. age_range 는 백엔드 이름 age_band 로 옮긴다. */
export function toAssistantProfile(p: ProfilePayload): AssistantProfile {
  const out: AssistantProfile = { language: p.language.toLowerCase().split('-')[0], country: p.country.toUpperCase() }
  if (p.gender) out.gender = p.gender
  if (p.age_range) out.age_band = p.age_range
  if (p.currency && /^[A-Za-z]{3}$/.test(p.currency)) out.currency = p.currency.toUpperCase()
  const pref = p.preferences
  const interests = (pref?.interests ?? []).map((i) => i.trim()).filter((i) => i && i.length <= MAX_INTEREST_CHARS).slice(0, MAX_INTERESTS)
  if (interests.length) out.interests = interests
  if (typeof pref?.budget_krw === 'number' && pref.budget_krw > 0 && pref.budget_krw <= MAX_BUDGET_KRW) out.budget_krw = Math.round(pref.budget_krw)
  const product = pref?.current_product?.trim()
  if (product) out.current_product = product.slice(0, MAX_PRODUCT_CHARS)
  return out
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0

function parseCandidate(v: unknown): AssistantCandidate | null {
  const c = v as Record<string, unknown>
  if (!c || !isStr(c.id) || !isStr(c.title) || (c.category !== 'beauty' && c.category !== 'medical')) return null
  const lp = c.list_price as ListPrice | null | undefined
  return {
    id: c.id,
    kind: isStr(c.kind) ? c.kind : 'product',
    category: c.category,
    title: c.title,
    subtitle: typeof c.subtitle === 'string' ? c.subtitle : '',
    image_url: isStr(c.image_url) ? c.image_url : null,
    price_krw: typeof c.price_krw === 'number' ? c.price_krw : null,
    list_price: lp && typeof lp.amount === 'number' && isStr(lp.currency) ? lp : null,
    reasons: Array.isArray(c.reasons) ? c.reasons.filter(isStr) : [],
    sources: Array.isArray(c.sources) ? (c.sources as Source[]).filter((s) => s && isStr(s.url) && isStr(s.label)) : [],
  }
}

/** 응답 metadata 의 후보 정보. 형식이 다르거나 없으면 빈 목록(가짜 후보를 만들지 않는다). */
export function parseCandidates(metadata: unknown): Pick<AssistantAnswer, 'candidates' | 'candidatesStatus' | 'recommendedIds'> {
  const m = metadata as Record<string, unknown> | null | undefined
  if (!m || m.candidates_basis !== 'server_recommendation') return { candidates: [], candidatesStatus: 'none', recommendedIds: [] }
  const candidates = (Array.isArray(m.candidates) ? m.candidates : []).map(parseCandidate).filter((c): c is AssistantCandidate => !!c)
  const ids = new Set(candidates.map((c) => c.id))
  const recommendedIds = (Array.isArray(m.recommended_ids) ? m.recommended_ids : []).filter((x): x is string => isStr(x) && ids.has(x))
  const candidatesStatus: CandidatesStatus = m.candidates_status === 'ok' ? 'ok' : 'unavailable'
  return { candidates, candidatesStatus, recommendedIds: [...new Set(recommendedIds)] }
}

export function validateQuestion(question: string | undefined): string | undefined {
  const q = question?.trim()
  if (!q) return undefined
  if (q.length > MAX_QUESTION_CHARS) {
    throw new AssistantError(`Please keep your question under ${MAX_QUESTION_CHARS} characters.`, 'invalid_input')
  }
  return q
}

interface AskOptions {
  question?: string
  signal?: AbortSignal
  timeoutMs?: number
  threadId?: string // 백엔드 multi_turn 이 켜졌을 때만 의미가 있다
}

/** 질문(또는 질문 없는 Home 요청)을 보내고 텍스트 답을 돌려준다. 실패는 원인별 AssistantError. */
export async function requestAssistant(profile: ProfilePayload, opts: AskOptions = {}): Promise<AssistantAnswer> {
  if (!profile?.country || !profile?.language) {
    throw new AssistantError('Finish the basic setup (country and language) first.', 'invalid_input')
  }
  const input = validateQuestion(opts.question)
  const ctrl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ctrl.abort()
  }, opts.timeoutMs ?? ASSISTANT_TIMEOUT_MS)
  const onOuterAbort = () => ctrl.abort()
  opts.signal?.addEventListener('abort', onOuterAbort)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.threadId) headers['X-Thread-Id'] = opts.threadId

  let res: Response
  try {
    res = await fetch(ASSISTANT_PATH, {
      method: 'POST',
      headers,
      body: JSON.stringify({ input: input ?? null, stream: false, metadata: { profile: toAssistantProfile(profile) } }),
      signal: ctrl.signal,
    })
  } catch {
    if (timedOut) throw new AssistantError('The assistant took too long to answer. Please try again.', 'timeout')
    if (opts.signal?.aborted) throw new AssistantError('Request cancelled.', 'aborted')
    throw new AssistantError("We couldn't reach the server. Check your connection and try again.", 'network')
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onOuterAbort)
  }

  if (!res.ok) {
    let detail = ''
    try {
      detail = ((await res.json()) as { error?: { message?: string } })?.error?.message ?? ''
    } catch {
      /* 본문이 JSON 이 아니면 상태 코드만 쓴다 */
    }
    const kind = res.status === 503 ? 'unavailable' : res.status === 504 ? 'timeout' : res.status === 422 ? 'invalid_input' : 'http'
    throw new AssistantError(HTTP_MESSAGES[kind], kind, res.status, detail)
  }
  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new AssistantError('The assistant sent a response we could not read.', 'parse')
  }
  return parseAnswer(data)
}

/** OpenAI Responses 객체에서 output_text 를 모은다. 형식이 다르면 parse 오류(빈 답을 성공으로 위장하지 않는다). */
export function parseAnswer(data: unknown): AssistantAnswer {
  const d = data as { id?: unknown; object?: unknown; status?: unknown; output?: unknown; metadata?: unknown }
  if (!d || d.object !== 'response' || typeof d.id !== 'string' || !Array.isArray(d.output)) {
    throw new AssistantError('The assistant sent an unexpected response.', 'parse')
  }
  if (d.status !== 'completed' && d.status !== 'incomplete') {
    throw new AssistantError('The assistant has not finished answering.', 'parse')
  }
  const text = (d.output as { type?: string; content?: { type?: string; text?: unknown }[] }[])
    .filter((m) => m?.type === 'message' && Array.isArray(m.content))
    .flatMap((m) => m.content!.filter((c) => c?.type === 'output_text' && typeof c.text === 'string').map((c) => c.text as string))
    .join('')
  if (!text.trim()) throw new AssistantError('The assistant returned an empty answer.', 'parse')
  return { responseId: d.id, status: d.status, text, ...parseCandidates(d.metadata) }
}

// ── 화면용 호출(INTEGRATION 화면 세션 요청 형태) ──
export interface AskAssistantInput {
  profile: ProfilePayload
  input?: string // 없으면 Home 추천 요청(선호는 metadata.profile 로 전달)
  signal?: AbortSignal
  threadId?: string
}

export interface AssistantResult extends AssistantAnswer {
  question: string | null // 실제로 보낸 input(null = 백엔드 Home 요청)
}

export async function askAssistant({ profile, input, signal, threadId }: AskAssistantInput): Promise<AssistantResult> {
  const question = validateQuestion(input) ?? null
  const answer = await requestAssistant(profile, { question: question ?? undefined, signal, threadId })
  return { ...answer, question }
}

// ── 질문-응답 상태(화면은 이 상태만 그린다) ──
export interface AssistantTurn {
  id: string
  question: string | null // null = 질문 없는 Home 추천 요청
  answer?: AssistantAnswer & { question?: string | null }
  error?: { message: string; kind: AssistantErrorKind }
}

export interface AssistantState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  turns: AssistantTurn[]
}

export type AssistantAction =
  | { type: 'ask'; id: string; question: string | null }
  | { type: 'answer'; id: string; answer: AssistantAnswer & { question?: string | null } }
  | { type: 'fail'; id: string; error: { message: string; kind: AssistantErrorKind } }
  | { type: 'reset' }

export const initialAssistantState: AssistantState = { status: 'idle', turns: [] }

export function assistantReducer(state: AssistantState, action: AssistantAction): AssistantState {
  switch (action.type) {
    case 'ask':
      return { status: 'loading', turns: [...state.turns, { id: action.id, question: action.question }] }
    case 'answer':
      return { status: 'ready', turns: state.turns.map((t) => (t.id === action.id ? { ...t, answer: action.answer, error: undefined } : t)) }
    case 'fail':
      if (action.error.kind === 'aborted') return { status: state.turns.some((t) => t.answer) ? 'ready' : 'idle', turns: state.turns.filter((t) => t.id !== action.id) }
      return { status: 'error', turns: state.turns.map((t) => (t.id === action.id ? { ...t, error: action.error } : t)) }
    case 'reset':
      return initialAssistantState
  }
}

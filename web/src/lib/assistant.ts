// Home AI 연결 — 같은 origin 의 POST /v1/responses(discovery_server 프록시 → app.serve).
// 백엔드 계약: metadata.profile = { language, country, gender?, age_band? }. 질문이 없으면 Home 추천 요청이 된다.
// 통화·관심사·사용 제품은 metadata 로 읽히지 않는다. Home 요청에서는 사용자가 고른 관심사·예산·사용 제품을
// 백엔드가 실제로 읽는 input 문장(homeQuestion)으로만 전달한다. 성별·연령은 문장에 넣지 않는다.
import { ApiError } from './api'
import type { CatalogItem, ProfilePayload } from './types'

export const ASSISTANT_PATH = '/v1/responses'
export const ASSISTANT_TIMEOUT_MS = 65_000 // 서버 프록시 상한(60s)보다 조금 길게
export const MAX_QUESTION_CHARS = 2000 // 서버 검증(max_length)과 같은 값

export interface AssistantProfile {
  language: string
  country: string
  gender?: string
  age_band?: string
}

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
}

/** 온보딩 결과(ProfilePayload) → /v1/responses metadata.profile. age_range 는 백엔드 이름 age_band 로 옮긴다. */
export function toAssistantProfile(p: ProfilePayload): AssistantProfile {
  const out: AssistantProfile = { language: p.language.toLowerCase().split('-')[0], country: p.country.toUpperCase() }
  if (p.gender) out.gender = p.gender
  if (p.age_range) out.age_band = p.age_range
  return out
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
  const d = data as { id?: unknown; object?: unknown; status?: unknown; output?: unknown }
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
  return { responseId: d.id, status: d.status, text }
}

// ── 화면용 호출(INTEGRATION 화면 세션 요청 형태) ──
export interface AskAssistantInput {
  profile: ProfilePayload
  input?: string // 없으면 Home 추천 요청(homeQuestion 이 있으면 그 문장, 없으면 백엔드 Home 요청)
  signal?: AbortSignal
  catalog?: CatalogItem[] // 답 본문에 나온 실제 제품명을 상세 열기 id 로 잇는 데만 쓴다
  threadId?: string
}

export interface AssistantResult extends AssistantAnswer {
  itemIds: string[] // 답 본문에 이름이 그대로 나온 카탈로그 항목만(추정 매칭 없음)
  followUps?: string[] // 백엔드가 주지 않으므로 지금은 항상 undefined — 만들어 내지 않는다
  question: string | null // 실제로 보낸 input(null = 백엔드 Home 요청)
}

const formatKrw = (n: number) => `KRW ${Math.round(n).toLocaleString('en-US')}`

/** 질문 없는 Home 요청에 사용자가 직접 고른 선호만 문장으로 담는다. 선호가 없으면 undefined(백엔드 Home 요청 사용). */
export function homeQuestion(profile: ProfilePayload): string | undefined {
  const pref = profile.preferences
  const parts: string[] = []
  if (pref?.interests?.length) parts.push(`I'm interested in ${pref.interests.join(', ')}.`)
  if (typeof pref?.budget_krw === 'number' && pref.budget_krw > 0) parts.push(`My budget is about ${formatKrw(pref.budget_krw)}.`)
  if (pref?.current_product?.trim()) parts.push(`I currently use ${pref.current_product.trim()}.`)
  if (!parts.length) return undefined
  return `[Home] ${parts.join(' ')} What K-beauty products or clinics should I look at first on my trip to Korea?`
}

/** 답 본문에 title 또는 subtitle 의 앞부분(· 앞 이름)이 그대로 들어 있는 카탈로그 id. 대소문자만 무시한다. */
export function matchCatalogItems(text: string, catalog: CatalogItem[] = []): string[] {
  const hay = text.toLowerCase()
  return catalog
    .filter((it) => {
      const names = [it.title, it.subtitle?.split('·')[0]].map((n) => n?.trim().toLowerCase()).filter((n): n is string => !!n && n.length >= 4)
      return names.some((n) => hay.includes(n))
    })
    .map((it) => it.id)
}

export async function askAssistant({ profile, input, signal, catalog, threadId }: AskAssistantInput): Promise<AssistantResult> {
  const question = validateQuestion(input) ?? (profile ? homeQuestion(profile) : undefined) ?? null
  const answer = await requestAssistant(profile, { question: question ?? undefined, signal, threadId })
  return { ...answer, question, itemIds: matchCatalogItems(answer.text, catalog), followUps: undefined }
}

// ── 질문-응답 상태(화면은 이 상태만 그린다) ──
export interface AssistantTurn {
  id: string
  question: string | null // null = 질문 없는 Home 추천 요청
  answer?: AssistantAnswer & { itemIds?: string[]; question?: string | null }
  error?: { message: string; kind: AssistantErrorKind }
}

export interface AssistantState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  turns: AssistantTurn[]
}

export type AssistantAction =
  | { type: 'ask'; id: string; question: string | null }
  | { type: 'answer'; id: string; answer: AssistantAnswer & { itemIds?: string[]; question?: string | null } }
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

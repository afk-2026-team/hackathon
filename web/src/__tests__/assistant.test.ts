// /v1/responses 연결 계약 테스트. fetch 는 테스트 전용 합성 응답(provenance=test_fixture)으로 격리한다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api'
import {
  AssistantError, MAX_QUESTION_CHARS, askAssistant, assistantReducer, initialAssistantState,
  parseAnswer, parseCandidates, requestAssistant, toAssistantProfile,
} from '../lib/assistant'
import type { ProfilePayload } from '../lib/types'

const profile: ProfilePayload = {
  country: 'us', language: 'en-US', currency: 'USD', gender: 'female', age_range: '25-34',
  preferences: { interests: ['skincare'], current_product: 'CeraVe Moisturizing Cream', budget_krw: 50000 },
}
const responseObject = (text = 'Try a ceramide cream.', status = 'completed') => ({
  id: 'resp_1', object: 'response', created_at: 1, status, model: 'kbeauty-sonnet',
  output: [{ type: 'message', id: 'msg_1', status, role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] }],
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('toAssistantProfile', () => {
  it('maps onboarding payload including preferences to the /v1/responses profile contract', () => {
    expect(toAssistantProfile(profile)).toEqual({ language: 'en', country: 'US', gender: 'female', age_band: '25-34', currency: 'USD', interests: ['skincare'], budget_krw: 50000, current_product: 'CeraVe Moisturizing Cream' })
  })
  it('clips values to the server limits instead of sending a 422-bound request', () => {
    const long = toAssistantProfile({ country: 'KR', language: 'ko', currency: 'krw', preferences: { interests: Array.from({ length: 12 }, (_, i) => `i${i}`).concat(['x'.repeat(41)]), budget_krw: 2e8, current_product: 'p'.repeat(250) } })
    expect(long.interests).toHaveLength(10)
    expect(long.budget_krw).toBeUndefined()
    expect(long.current_product).toHaveLength(200)
    expect(long.currency).toBe('KRW')
  })
  it('omits optional fields that were not shared', () => {
    expect(toAssistantProfile({ country: 'JP', language: 'ja', currency: 'JPY' })).toEqual({ language: 'ja', country: 'JP', currency: 'JPY' })
  })
})

describe('requestAssistant', () => {
  it('posts question with profile metadata to the same-origin proxy and returns the text', async () => {
    const fetchMock = vi.fn(async () => json(responseObject()))
    vi.stubGlobal('fetch', fetchMock)
    const ans = await requestAssistant(profile, { question: '  What should I buy?  ', threadId: 's-1' })
    expect(ans).toEqual({ responseId: 'resp_1', status: 'completed', text: 'Try a ceramide cream.', candidates: [], candidatesStatus: 'none', recommendedIds: [] })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/v1/responses')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['X-Thread-Id']).toBe('s-1')
    expect(JSON.parse(init.body as string)).toEqual({
      input: 'What should I buy?', stream: false,
      metadata: { profile: { language: 'en', country: 'US', gender: 'female', age_band: '25-34', currency: 'USD', interests: ['skincare'], budget_krw: 50000, current_product: 'CeraVe Moisturizing Cream' } },
    })
  })

  it('sends a Home request (input null) when there is no question', async () => {
    const fetchMock = vi.fn(async () => json(responseObject()))
    vi.stubGlobal('fetch', fetchMock)
    await requestAssistant(profile)
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(JSON.parse(init.body as string).input).toBeNull()
  })

  it('rejects missing profile and over-long questions before any request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(requestAssistant({ country: '', language: 'en', currency: 'USD' })).rejects.toMatchObject({ kind: 'invalid_input' })
    await expect(requestAssistant(profile, { question: 'x'.repeat(MAX_QUESTION_CHARS + 1) })).rejects.toMatchObject({ kind: 'invalid_input' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [503, 'unavailable'], [504, 'timeout'], [422, 'invalid_input'], [500, 'http'],
  ] as const)('maps HTTP %s to %s with a user message and keeps the server text in detail', async (status, kind) => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { message: `server says ${status}` } }, status)))
    const err = await requestAssistant(profile, { question: 'hi' }).catch((e) => e)
    expect(err).toBeInstanceOf(AssistantError)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ kind, status, detail: `server says ${status}` })
    expect(err.message).not.toMatch(/server says|\d{3}/)
  })

  it('reports network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(requestAssistant(profile, { question: 'hi' })).rejects.toMatchObject({ kind: 'network' })
  })

  it('times out with a timeout error', async () => {
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    await expect(requestAssistant(profile, { question: 'hi', timeoutMs: 10 })).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('reports caller cancellation as aborted', async () => {
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const ctrl = new AbortController()
    const p = requestAssistant(profile, { question: 'hi', signal: ctrl.signal })
    ctrl.abort()
    await expect(p).rejects.toMatchObject({ kind: 'aborted' })
  })
})

describe('parseAnswer', () => {
  it('keeps incomplete status', () => {
    expect(parseAnswer(responseObject('partial', 'incomplete')).status).toBe('incomplete')
  })
  it.each([
    [{ object: 'chat.completion' }],
    [{ ...responseObject(), status: 'in_progress' }],
    [responseObject('   ')],
  ])('does not pass off malformed or empty output as an answer', (bad) => {
    expect(() => parseAnswer(bad)).toThrow(AssistantError)
  })
})

describe('assistantReducer', () => {
  it('tracks ask → answer and ask → fail', () => {
    let s = assistantReducer(initialAssistantState, { type: 'ask', id: 'a', question: 'q1' })
    expect(s.status).toBe('loading')
    s = assistantReducer(s, { type: 'answer', id: 'a', answer: { responseId: 'r', status: 'completed', text: 't', candidates: [], candidatesStatus: 'none', recommendedIds: [] } })
    expect(s).toMatchObject({ status: 'ready', turns: [{ id: 'a', question: 'q1', answer: { text: 't' } }] })
    s = assistantReducer(s, { type: 'ask', id: 'b', question: null })
    s = assistantReducer(s, { type: 'fail', id: 'b', error: { message: 'down', kind: 'unavailable' } })
    expect(s.status).toBe('error')
    expect(s.turns[1].error?.kind).toBe('unavailable')
  })
  it('drops a cancelled turn without showing an error', () => {
    let s = assistantReducer(initialAssistantState, { type: 'ask', id: 'a', question: 'q' })
    s = assistantReducer(s, { type: 'fail', id: 'a', error: { message: 'x', kind: 'aborted' } })
    expect(s).toEqual({ status: 'idle', turns: [] })
  })
})

const cand = (id: string, title: string) => ({ id, kind: 'product', category: 'beauty', title, subtitle: '', image_url: null, price_krw: null, list_price: null, reasons: ['r'], sources: [{ label: 's', url: 'https://example.com', checked_at: '2026-10-24' }] })

describe('askAssistant (screen contract)', () => {
  it('Home request sends input null and every preference in metadata.profile', async () => {
    const fetchMock = vi.fn(async () => json(responseObject()))
    vi.stubGlobal('fetch', fetchMock)
    const res = await askAssistant({ profile })
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(sent.input).toBeNull()
    expect(sent.metadata.profile).toEqual({ language: 'en', country: 'US', gender: 'female', age_band: '25-34', currency: 'USD', interests: ['skincare'], budget_krw: 50000, current_product: 'CeraVe Moisturizing Cream' })
    expect(res.question).toBeNull()
  })

  it('a typed question is sent as-is with the same profile', async () => {
    const fetchMock = vi.fn(async () => json(responseObject()))
    vi.stubGlobal('fetch', fetchMock)
    await askAssistant({ profile, input: 'Is this good for dry skin?' })
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(sent.input).toBe('Is this good for dry skin?')
    expect(sent.metadata.profile.current_product).toBe('CeraVe Moisturizing Cream')
  })

  it('reads structured candidates and keeps only cited ids that are real candidates', async () => {
    const body = { ...responseObject('Try ILLIYOON.'), metadata: { candidates_basis: 'server_recommendation', candidates_status: 'ok', candidates: [cand('a', 'A'), cand('b', 'B'), { id: 'bad' }], recommended_ids: ['b', 'ghost', 'b'] } }
    vi.stubGlobal('fetch', vi.fn(async () => json(body)))
    const res = await askAssistant({ profile })
    expect(res.candidates.map((c) => c.id)).toEqual(['a', 'b'])
    expect(res.recommendedIds).toEqual(['b'])
    expect(res.candidatesStatus).toBe('ok')
  })
})

describe('parseCandidates', () => {
  it('reports unavailable honestly and none when the server sent nothing', () => {
    expect(parseCandidates({ candidates_basis: 'server_recommendation', candidates_status: 'unavailable', candidates: [] })).toEqual({ candidates: [], candidatesStatus: 'unavailable', recommendedIds: [] })
    expect(parseCandidates(undefined).candidatesStatus).toBe('none')
    expect(parseCandidates({ candidates: [cand('a', 'A')] }).candidates).toEqual([]) // basis 없는 목록은 믿지 않는다
  })
})

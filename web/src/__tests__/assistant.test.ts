// /v1/responses 연결 계약 테스트. fetch 는 테스트 전용 합성 응답(provenance=test_fixture)으로 격리한다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api'
import {
  AssistantError, MAX_QUESTION_CHARS, askAssistant, assistantReducer, homeQuestion, initialAssistantState, matchCatalogItems,
  parseAnswer, requestAssistant, toAssistantProfile,
} from '../lib/assistant'
import type { CatalogItem, ProfilePayload } from '../lib/types'

const profile: ProfilePayload = {
  country: 'us', language: 'en-US', currency: 'USD', gender: 'female', age_range: '25-34',
  preferences: { interests: ['skincare'], current_product: 'CeraVe Moisturizing Cream', budget_krw: 50000 },
}
const responseObject = (text = 'Try a ceramide cream.', status = 'completed') => ({
  id: 'resp_1', object: 'response', created_at: 1, status, model: 'kbeauty-haiku',
  output: [{ type: 'message', id: 'msg_1', status, role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] }],
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('toAssistantProfile', () => {
  it('maps onboarding payload to the /v1/responses profile contract only', () => {
    expect(toAssistantProfile(profile)).toEqual({ language: 'en', country: 'US', gender: 'female', age_band: '25-34' })
  })
  it('omits optional fields that were not shared', () => {
    expect(toAssistantProfile({ country: 'JP', language: 'ja', currency: 'JPY' })).toEqual({ language: 'ja', country: 'JP' })
  })
})

describe('requestAssistant', () => {
  it('posts question with profile metadata to the same-origin proxy and returns the text', async () => {
    const fetchMock = vi.fn(async () => json(responseObject()))
    vi.stubGlobal('fetch', fetchMock)
    const ans = await requestAssistant(profile, { question: '  What should I buy?  ', threadId: 's-1' })
    expect(ans).toEqual({ responseId: 'resp_1', status: 'completed', text: 'Try a ceramide cream.' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/v1/responses')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['X-Thread-Id']).toBe('s-1')
    expect(JSON.parse(init.body as string)).toEqual({
      input: 'What should I buy?', stream: false,
      metadata: { profile: { language: 'en', country: 'US', gender: 'female', age_band: '25-34' } },
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
    s = assistantReducer(s, { type: 'answer', id: 'a', answer: { responseId: 'r', status: 'completed', text: 't' } })
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

const item = (id: string, title: string, subtitle: string) => ({ id, title, subtitle } as CatalogItem)

describe('askAssistant (screen contract)', () => {
  it('Home request carries only the user-chosen interests, budget and current product as input text', async () => {
    const fetchMock = vi.fn(async () => json(responseObject('Look at ILLIYOON Ceramide Ato Concentrate Cream 75ml.')))
    vi.stubGlobal('fetch', fetchMock)
    const catalog = [item('illiyoon', 'ILLIYOON Ceramide Ato Concentrate Cream 75ml', '일리윤 세라마이드 아토 집중 크림 · 75ml'), item('tor', 'Torriden Dive-In Cream', '토리든')]
    const res = await askAssistant({ profile, catalog })
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(sent.input).toBe('[Home] I\'m interested in skincare. My budget is about KRW 50,000. I currently use CeraVe Moisturizing Cream. What K-beauty products or clinics should I look at first on my trip to Korea?')
    expect(sent.input).not.toMatch(/female|25-34/)
    expect(sent.metadata.profile).toEqual({ language: 'en', country: 'US', gender: 'female', age_band: '25-34' })
    expect(res).toMatchObject({ itemIds: ['illiyoon'], followUps: undefined, question: sent.input })
  })

  it('uses the backend Home request (input null) when no preferences were chosen', async () => {
    const fetchMock = vi.fn(async () => json(responseObject()))
    vi.stubGlobal('fetch', fetchMock)
    const res = await askAssistant({ profile: { country: 'JP', language: 'ja', currency: 'JPY' } })
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).input).toBeNull()
    expect(res.question).toBeNull()
  })

  it('a typed question is sent as-is, not replaced by the Home sentence', async () => {
    const fetchMock = vi.fn(async () => json(responseObject()))
    vi.stubGlobal('fetch', fetchMock)
    await askAssistant({ profile, input: 'Is this good for dry skin?' })
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).input).toBe('Is this good for dry skin?')
  })
})

describe('homeQuestion / matchCatalogItems', () => {
  it('returns undefined without preferences', () => {
    expect(homeQuestion({ country: 'US', language: 'en', currency: 'USD', preferences: { interests: [] } })).toBeUndefined()
  })
  it('matches only names that literally appear in the answer', () => {
    const catalog = [item('a', 'ROUND LAB Birch Juice Moisturizing Cream 80ml', '라운드랩 자작나무 수분크림 · 80ml'), item('b', 'Medical Korea official portal', 'Medical Korea 공식 포털')]
    expect(matchCatalogItems('라운드랩 자작나무 수분크림 is popular', catalog)).toEqual(['a'])
    expect(matchCatalogItems('Try a birch cream', catalog)).toEqual([])
  })
})

import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useCompare, resetReferenceCache } from '../lib/useCompare'

// 테스트 평면 격리용 응답
const base = {
  current: null, current_status: 'unknown',
  candidate: { id: 'c', title: 'C', form: null, volume_ml: null, key_ingredients: null, ingredients_complete: false, ingredients_basis: '', price: null, sources: [] },
  common: [], differences: [], unverified: [], price: { current: null, candidate: null, comparable: false, note: '' },
  country_context: { country: 'US', status: 'insufficient', explanation: '' }, notice: '', generated_at: 'x',
}

describe('useCompare request ordering', () => {
  it('applies only the latest input when an earlier request answers later', async () => {
    resetReferenceCache()
    const resolvers: Record<string, () => void> = {}
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/v1/discovery/reference-products') return new Response(JSON.stringify({ items: [] }))
      if (url === '/v1/discovery/explain') return new Response('', { status: 503 })
      const name = JSON.parse(init!.body as string).current_product_name as string
      await new Promise<void>((r) => { resolvers[name] = r })
      return new Response(JSON.stringify({ ...base, candidate: { ...base.candidate, title: `for ${name}` } }))
    }))
    const profile = { country: 'US', language: 'en', currency: 'USD' }
    const { result, rerender } = renderHook(({ n }) => useCompare(profile, 'c', n), { initialProps: { n: 'first' } })
    await waitFor(() => expect(resolvers.first).toBeDefined())
    rerender({ n: 'second' })
    await waitFor(() => expect(resolvers.second).toBeDefined())
    await act(async () => { resolvers.second() })
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    await act(async () => { resolvers.first() })
    await new Promise((r) => setTimeout(r, 10))
    expect(result.current.state.status === 'ready' && result.current.state.data.candidateTitle).toBe('for second')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCatalog } from '../lib/api'
import { tagLabel } from '../lib/tagLabels'
import { subtitleBesideTitle } from '../components/detail/parts'

describe('Korean content mode', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('asks the catalog API for the screen language', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await fetchCatalog('ko')
    await fetchCatalog()
    expect(fetchMock.mock.calls.map((c) => (c as unknown[])[0])).toEqual(['/v1/discovery/catalog?lang=ko', '/v1/discovery/catalog?lang=en'])
  })

  it('does not repeat the Korean name under a Korean title, but keeps size details', () => {
    const subtitle = '일리윤 세라마이드 아토 집중 크림 · 75ml'
    expect(subtitleBesideTitle({ title: '일리윤 세라마이드 아토 집중 크림', subtitle })).toBe('75ml')
    expect(subtitleBesideTitle({ title: 'ILLIYOON Ceramide Ato Concentrate Cream 75ml', subtitle })).toBe(subtitle)
    expect(subtitleBesideTitle({ title: '올리브영 명동 타운', subtitle: '올리브영 명동 타운' })).toBe('')
    expect(subtitleBesideTitle({ title: 'Item', subtitle: '' })).toBe('')
  })

  it('shows Korean tag labels only in Korean mode and keeps unknown tags as-is', () => {
    expect(tagLabel('skincare', 'ko')).toBe('스킨케어')
    expect(tagLabel('skincare', 'en')).toBe('skincare')
    expect(tagLabel('brand_new_tag', 'ko')).toBe('brand_new_tag')
  })
})

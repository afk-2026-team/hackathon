import { describe, expect, it } from 'vitest'
import { clearAll, keyFor, loadCart, loadEntry, loadProfile, migrateLegacy, migrateProfile, saveCart, saveProfile, toPayload } from '../lib/storage'

const base = { version: 1 as const, country: 'US', language: 'en', currency: 'USD', gender: null, age_range: null, preferences: null, onboarded_at: 'x', tutorial_done: true }

describe('profile storage', () => {
  it('moves legacy data ({country, lang} and pre-account keys) into the guest space', () => {
    localStorage.setItem('kl.profile', JSON.stringify({ country: 'JP', lang: 'ja' }))
    localStorage.setItem('korea-locally/cart', JSON.stringify([{ item_id: 'a', title: 'A', qty: 1, price_krw: null }]))
    migrateLegacy()
    expect(loadProfile('guest')).toMatchObject({ country: 'JP', language: 'ja', tutorial_done: false })
    expect(loadCart('guest')).toHaveLength(1)
    expect(localStorage.getItem('kl.profile')).toBeNull()
    expect(localStorage.getItem('korea-locally/cart')).toBeNull()
  })

  it('treats corrupt JSON, missing basics and unknown versions as no profile', () => {
    localStorage.setItem(keyFor('guest', 'profile'), '{not json')
    expect(loadProfile('guest')).toBeNull()
    expect(migrateProfile({ language: 'en' })).toBeNull()
    expect(migrateProfile({ country: 'US', language: 'en', version: 99 })).toBeNull()
    localStorage.setItem('korea-locally/entry', 'admin')
    expect(loadEntry()).toBeNull()
  })

  it('keeps guest and account spaces apart, and clearing one leaves the other', () => {
    saveProfile('guest', base)
    saveProfile('user:abc', { ...base, country: 'KR' })
    saveCart('user:abc', [{ item_id: 'x', title: 'X', category: 'beauty', price_krw: 1000, qty: 2 }])
    expect(loadProfile('guest')!.country).toBe('US')
    expect(loadCart('guest')).toEqual([])
    clearAll('user:abc')
    expect(loadProfile('user:abc')).toBeNull()
    expect(loadProfile('guest')).not.toBeNull()
  })

  it('drops empty optional fields from the API payload and survives a throwing storage', () => {
    const p = migrateProfile({ country: 'TH', language: 'en', currency: 'THB', gender: '', preferences: { interests: [] } })!
    expect(toPayload(p)).toEqual({ country: 'TH', language: 'en', currency: 'THB' })
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => { throw new Error('denied') } } as unknown as Storage
    expect(loadProfile('guest', broken)).toBeNull()
    expect(() => saveProfile('guest', base, broken)).not.toThrow()
  })
})

import { useEffect, useState } from 'react'
import { fetchFx } from './api'
import type { FxResponse } from './types'

// 환율은 서버 /v1/fx(ECB 기준율)만 쓴다. 숫자 환율을 코드에 적지 않고, 출처가 없는 통화는 원화만 보여준다.
type FxState = { status: 'loading' } | { status: 'ready'; fx: FxResponse } | { status: 'error'; message: string }

let shared: Promise<FxResponse> | null = null
function loadShared(): Promise<FxResponse> {
  if (!shared) {
    shared = fetchFx().catch((e: unknown) => {
      shared = null // 다음 화면 진입 때 다시 시도
      throw e
    })
  }
  return shared
}

/** 테스트에서 공유 캐시를 비운다. */
export function resetFxCache() {
  shared = null
}

export function useFx(): FxState {
  const [state, setState] = useState<FxState>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    loadShared()
      .then((fx) => alive && setState({ status: 'ready', fx }))
      .catch((e: unknown) => alive && setState({ status: 'error', message: e instanceof Error ? e.message : 'Exchange rates unavailable.' }))
    return () => {
      alive = false
    }
  }, [])
  return state
}

/** 원화 금액을 선택 통화로 환산. 환율이 없거나 원화를 고른 경우 null. */
export function convertKrw(krw: number, currency: string, fx: FxResponse | null): number | null {
  if (!fx || currency === 'KRW') return null
  const rate = fx.rates?.[currency]
  return typeof rate === 'number' && rate > 0 ? krw * rate : null
}

export function formatKrw(krw: number): string {
  return `₩${Math.round(krw).toLocaleString('en-US')}`
}

export function formatMoney(value: number, currency: string, lang: 'en' | 'ko' = 'en'): string {
  try {
    return new Intl.NumberFormat(lang === 'ko' ? 'ko-KR' : 'en-US', { style: 'currency', currency, maximumFractionDigits: value < 100 ? 2 : 0 }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

/** 출처 한 줄. 예: "ECB reference rate · 2026-10-23" */
export function fxSourceLine(fx: FxResponse): string {
  return `${fx.source.label} · ${fx.date}`
}

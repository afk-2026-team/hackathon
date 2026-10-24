// 온보딩 선택지. 국가→통화는 사용자가 바꿀 수 있는 기본값일 뿐이다.
export const COUNTRIES: { code: string; name: string; currency: string }[] = [
  { code: 'US', name: 'United States', currency: 'USD' },
  { code: 'CA', name: 'Canada', currency: 'CAD' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
  { code: 'FR', name: 'France', currency: 'EUR' },
  { code: 'DE', name: 'Germany', currency: 'EUR' },
  { code: 'AU', name: 'Australia', currency: 'AUD' },
  { code: 'JP', name: 'Japan', currency: 'JPY' },
  { code: 'CN', name: 'China', currency: 'CNY' },
  { code: 'TW', name: 'Taiwan', currency: 'TWD' },
  { code: 'HK', name: 'Hong Kong', currency: 'HKD' },
  { code: 'SG', name: 'Singapore', currency: 'SGD' },
  { code: 'TH', name: 'Thailand', currency: 'THB' },
  { code: 'VN', name: 'Vietnam', currency: 'VND' },
  { code: 'ID', name: 'Indonesia', currency: 'IDR' },
  { code: 'MY', name: 'Malaysia', currency: 'MYR' },
  { code: 'PH', name: 'Philippines', currency: 'PHP' },
  { code: 'XX', name: 'Other', currency: 'USD' },
]

// UI 가 실제로 지원하는 언어만 노출한다(i18n.ts).
export { UI_LANGS as LANGUAGES } from './i18n'

export const CURRENCIES = ['KRW', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'TWD', 'HKD', 'SGD', 'THB', 'VND', 'IDR', 'MYR', 'PHP', 'AUD', 'CAD']

export const GENDERS: { code: string; label: string }[] = [
  { code: 'female', label: 'Female' },
  { code: 'male', label: 'Male' },
  { code: 'nonbinary', label: 'Non-binary' },
]

// 연령 구간은 정본에서 미정 — 구현 기본값이며 바꿀 수 있다.
export const AGE_RANGES = ['18-24', '25-34', '35-44', '45-54', '55+']

export const INTERESTS: { code: string; label: string }[] = [
  { code: 'skincare', label: 'Skincare' },
  { code: 'makeup', label: 'Makeup' },
  { code: 'hair', label: 'Hair' },
  { code: 'dermatology', label: 'Dermatology visit' },
  { code: 'checkup', label: 'Health checkup' },
  { code: 'dental', label: 'Dental' },
  { code: 'neighborhoods', label: 'Local neighborhoods' },
]

export function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code
}

export function defaultCurrency(country: string): string {
  return COUNTRIES.find((c) => c.code === country)?.currency ?? 'USD'
}

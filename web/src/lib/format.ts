export function formatKrw(v: number): string {
  return `₩${v.toLocaleString('en-US')}`
}

export function mapLinks(loc: { name: string; lat?: number; lng?: number; address?: string }) {
  const q = loc.lat != null && loc.lng != null ? `${loc.lat},${loc.lng}` : [loc.name, loc.address].filter(Boolean).join(' ')
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
    naver: `https://map.naver.com/p/search/${encodeURIComponent([loc.name, loc.address].filter(Boolean).join(' '))}`,
  }
}

export const SPONSOR_LABEL = {
  sponsored: 'Sponsored',
  not_sponsored: 'No sponsorship found',
  unknown: 'Sponsorship unknown',
} as const

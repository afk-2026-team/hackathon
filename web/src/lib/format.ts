// 지도 앱으로 넘기는 검색 링크. 좌표가 없으면 이름·주소로 검색한다.
export function mapLinks(loc: { name: string; lat?: number; lng?: number; address?: string }) {
  const q = loc.lat != null && loc.lng != null ? `${loc.lat},${loc.lng}` : [loc.name, loc.address].filter(Boolean).join(' ')
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
    naver: `https://map.naver.com/p/search/${encodeURIComponent([loc.name, loc.address].filter(Boolean).join(' '))}`,
  }
}

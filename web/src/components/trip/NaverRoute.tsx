import type { MouseEvent } from 'react'
import { fill, useT } from '../../lib/i18n'
import {
  TRAVEL_MODES, detectPlatform, naverWebDirectionsUrl, openNaverDirections, type GeoPoint, type TravelMode,
} from '../../lib/naverMaps'
import '../../styles/trip.css' // 상세 화면에서도 버튼 모양을 쓰도록

// 네이버 지도 길안내 버튼 묶음(담당 N). href 는 항상 웹 길찾기라서 데스크톱·JS 없이도 열리고,
// 휴대폰에서는 클릭을 가로채 앱 URL Scheme(nmap://, Android intent)으로 연 뒤 앱이 없으면 웹으로 넘긴다.
// 이동 시간·경로는 우리가 계산하지 않는다 — 네이버 지도가 계산한다.

export interface NaverRouteProps {
  from: GeoPoint | null
  to: GeoPoint
  waypoints?: GeoPoint[]
  modes?: TravelMode[]
  className?: string
}

export function NaverRoute({ from, to, waypoints = [], modes = TRAVEL_MODES, className }: NaverRouteProps) {
  const t = useT()
  const onClick = (mode: TravelMode) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (detectPlatform() === 'desktop') return // 기본 동작: 새 탭에 웹 길찾기
    e.preventDefault()
    openNaverDirections({ from, to, mode, waypoints })
  }
  return (
    <span className={`trip-nav${className ? ` ${className}` : ''}`} role="group" aria-label={t('trip.navTitle')}>
      {modes.map((mode) => (
        <a
          key={mode}
          className={`trip-nav__btn trip-nav__btn--${mode}`}
          href={naverWebDirectionsUrl(from, to, mode, waypoints)}
          target="_blank"
          rel="noreferrer noopener"
          data-mode={mode}
          aria-label={fill(t('trip.navAria'), { mode: t(`trip.mode.${mode}`), to: to.name })}
          onClick={onClick(mode)}
        >
          {t(`trip.mode.${mode}`)}
        </a>
      ))}
    </span>
  )
}

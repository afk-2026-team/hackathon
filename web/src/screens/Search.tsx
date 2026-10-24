import type { SearchProps } from './contracts'
import { SubBar } from '../components/Common'

// 담당: 탐색·검색·카트(D). 임시 골격.
export function Search({ onBack }: SearchProps) {
  return <SubBar title="Search" onBack={onBack} />
}

import type { CatalogItem } from '../lib/types'

// 이미지가 없을 때 쓰는 카테고리 그래픽. 실제 제품 사진처럼 보이지 않게 추상 도형만 쓴다.
export function Glyph({ category, kind, size = 56 }: { category: CatalogItem['category']; kind?: CatalogItem['kind']; size?: number }) {
  const medical = category === 'medical'
  return (
    <span className={`glyph ${medical ? 'glyph--medical' : 'glyph--beauty'}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 48 48" width={size * 0.5} height={size * 0.5}>
        {kind === 'place' ? (
          <path d="M24 6c-7 0-12 5.4-12 12.2C12 27 24 42 24 42s12-15 12-23.8C36 11.4 31 6 24 6zm0 16.5a4.5 4.5 0 110-9 4.5 4.5 0 010 9z" fill="currentColor" />
        ) : kind === 'guide' ? (
          <path d="M13 6h15l9 9v25a2 2 0 01-2 2H13a2 2 0 01-2-2V8a2 2 0 012-2zm14 2.5V16h7.5zM17 24v3h14v-3zm0 7v3h14v-3z" fill="currentColor" fillRule="evenodd" />
        ) : medical ? (
          <path d="M20 8h8v12h12v8H28v12h-8V28H8v-8h12z" fill="currentColor" />
        ) : (
          <path d="M24 6s-12 13.5-12 22a12 12 0 0024 0C36 19.5 24 6 24 6z" fill="currentColor" />
        )}
      </svg>
    </span>
  )
}

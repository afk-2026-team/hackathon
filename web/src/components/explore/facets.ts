import type { CatalogItem } from '../../lib/types'
import type { Key } from '../../lib/i18n'

// Explore·Search·ItemRow 가 함께 쓰는 목록 필터 기준(분야·세부 유형·지역).
// 라벨 사전에 있는 태그만 칩으로 보여 준다(없는 분류를 지어내지 않는다).

/** 의료 분야 태그 → 라벨 키. 순서가 칩 순서다. */
export const MEDICAL_FIELDS = ['dermatology', 'dental', 'checkup', 'international_clinic', 'plastic_surgery', 'ophthalmology', 'korean_medicine'] as const
export const fieldKey = (tag: string) => `explore.f.${tag}` as Key

/** 뷰티 세부 유형 태그 → 라벨 키. 순서가 칩 순서다. */
export const BEAUTY_TYPES = [
  'cleanser', 'toner', 'essence', 'serum', 'ampoule', 'lotion', 'moisturizer', 'cream', 'eye_cream', 'sunscreen', 'suncare',
  'sheet_mask', 'mask', 'cushion', 'foundation', 'base', 'primer', 'concealer', 'lip', 'tint', 'blush', 'eyeshadow',
  'eyeliner', 'mascara', 'shampoo', 'conditioner', 'hair_serum', 'hair_treatment',
] as const
export const typeKey = (tag: string) => `explore.t.${tag}` as Key

/** 병원·의원 등 의료기관으로 볼 수 있는 place 인지. Home 의료 섹션 분류에 쓴다. */
export function isClinic(item: CatalogItem): boolean {
  if (item.category !== 'medical' || item.kind !== 'place') return false
  return item.tags.some((t) => t === 'hospital' || t === 'clinic' || (MEDICAL_FIELDS as readonly string[]).includes(t))
}

export function itemFields(item: CatalogItem): string[] {
  return MEDICAL_FIELDS.filter((f) => item.tags.includes(f))
}

const GU_EN: Record<string, string> = {
  강남구: 'Gangnam-gu', 강동구: 'Gangdong-gu', 강북구: 'Gangbuk-gu', 강서구: 'Gangseo-gu', 관악구: 'Gwanak-gu', 광진구: 'Gwangjin-gu',
  구로구: 'Guro-gu', 금천구: 'Geumcheon-gu', 노원구: 'Nowon-gu', 도봉구: 'Dobong-gu', 동대문구: 'Dongdaemun-gu', 동작구: 'Dongjak-gu',
  마포구: 'Mapo-gu', 서대문구: 'Seodaemun-gu', 서초구: 'Seocho-gu', 성동구: 'Seongdong-gu', 성북구: 'Seongbuk-gu', 송파구: 'Songpa-gu',
  양천구: 'Yangcheon-gu', 영등포구: 'Yeongdeungpo-gu', 용산구: 'Yongsan-gu', 은평구: 'Eunpyeong-gu', 종로구: 'Jongno-gu', 중구: 'Jung-gu',
  중랑구: 'Jungnang-gu', 수원시: 'Suwon-si', 성남시: 'Seongnam-si', 고양시: 'Goyang-si', 용인시: 'Yongin-si', 부천시: 'Bucheon-si',
  인천광역시: 'Incheon', 부산광역시: 'Busan', 제주시: 'Jeju-si', 서귀포시: 'Seogwipo-si',
}
const CITY = /(특별시|광역시|특별자치시|특별자치도|도)$/

/**
 * 주소에서 구(없으면 시·군) 단위 지역을 뽑는다. 예: '서울특별시 강남구 논현로 1' → '강남구'.
 * 영문 주소('…, Gangnam-gu, Seoul')는 'Gangnam-gu' 형태를 찾는다. 못 찾으면 null.
 */
export function regionOf(item: Pick<CatalogItem, 'location'>): string | null {
  const addr = item.location?.address?.trim()
  if (!addr) return null
  const words = addr.split(/[\s,]+/).filter(Boolean)
  const gu = words.find((w) => /^[가-힣]+(구|군)$/.test(w))
  if (gu) return gu
  const si = words.find((w, i) => /^[가-힣]+시$/.test(w) && !CITY.test(w) && i <= 2)
  if (si) return si
  const city = words.find((w) => /^[가-힣]+광역시$/.test(w))
  if (city) return city
  const en = words.find((w) => /^[A-Z][a-z]+-(gu|gun|si)$/.test(w))
  if (en) {
    const ko = Object.keys(GU_EN).find((k) => GU_EN[k] === en)
    return ko ?? en
  }
  return null
}

export function regionLabel(region: string, lang: string): string {
  return lang === 'ko' ? region : GU_EN[region] ?? region
}

/** 한 번 계산해 두는 항목별 필터 키(수백 개여도 렌더마다 주소를 다시 파싱하지 않게). */
export interface Facet {
  region: string | null
  fields: string[]
  types: string[]
}
export function facetOf(item: CatalogItem): Facet {
  return {
    region: item.category === 'medical' ? regionOf(item) : null,
    fields: itemFields(item),
    types: BEAUTY_TYPES.filter((t) => item.tags.includes(t)),
  }
}

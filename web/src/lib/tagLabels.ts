import type { Lang } from './i18n'

// 카탈로그 태그(필터용 코드)의 화면 표시 라벨. 코드 자체는 바꾸지 않는다(필터·검색이 코드를 쓴다).
// 표에 없는 태그는 코드를 그대로 보여준다. 새 태그가 생기면 여기에 한 줄 추가한다.
const KO: Record<string, string> = {
  base: '베이스',
  bundle_sku: '묶음 상품',
  ceramide: '세라마이드',
  checkup: '건강검진',
  cream: '크림',
  cushion: '쿠션',
  dental: '치과',
  dermatology: '피부과',
  dispute_mediation: '분쟁 조정',
  essence: '에센스',
  gangnam: '강남',
  hair: '헤어',
  hair_serum: '헤어 세럼',
  heartleaf: '어성초',
  help_desk: '안내데스크',
  hospital_list: '병원 목록',
  interpretation: '통역',
  lip: '립',
  makeup: '메이크업',
  moisturizer: '보습',
  myeongdong: '명동',
  neighborhoods: '동네',
  official_guide: '공식 안내',
  patient_rights: '환자 권리',
  registration_check: '등록 확인',
  seoul: '서울',
  sheet_mask: '시트 마스크',
  shopping: '쇼핑',
  skincare: '스킨케어',
  snail_mucin: '달팽이 뮤신',
  suncare: '선케어',
  sunscreen: '선크림',
  tax_refund: '세금 환급',
  tint: '틴트',
  toner: '토너',
  tourist_info: '관광 안내',
}

export function tagLabel(tag: string, lang: Lang): string {
  return lang === 'ko' ? (KO[tag] ?? tag) : tag
}

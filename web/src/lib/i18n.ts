import { createContext, useContext, useEffect } from 'react'

// 실제 지원하는 UI 언어는 영어·한국어 두 가지다. 진입·온보딩·메뉴의 핵심 라벨부터 번역한다.
export type Lang = 'en' | 'ko'
export const UI_LANGS: { code: Lang; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'ko', name: '한국어' },
]

const en = {
  brand: 'Jinseonmi',
  'entry.title': 'Beauty, clinics and neighborhoods in one plan',
  'entry.lead': 'Start with your Google account, or look around right away without signing in.',
  'entry.google': 'Continue with Google',
  'entry.guest': 'Continue as guest',
  'entry.checking': 'Checking sign-in options…',
  'entry.disabled': 'Google sign-in isn’t switched on yet. You can use everything as a guest.',
  'entry.unavailable': 'We couldn’t reach the sign-in service. You can continue as a guest.',
  'entry.guestNote': 'Guest data stays in this browser only.',
  'callback.working': 'Finishing sign-in…',
  'callback.failed': 'Sign-in didn’t complete.',
  'callback.cancelled': 'Sign-in was cancelled.',
  'callback.retry': 'Try Google again',
  'ob.basics': 'Plan Korea your way',
  'ob.basicsEdit': 'Your basics',
  'ob.basicsLead': 'Beauty, clinics and neighborhoods in one place. Start with three basics.',
  'ob.language': 'Language',
  'ob.country': 'Where are you visiting from?',
  'ob.currency': 'Currency',
  'ob.chooseLanguage': 'Choose a language',
  'ob.chooseCountry': 'Choose a country',
  'ob.chooseCurrency': 'Choose a currency',
  'ob.about': 'A little about you',
  'ob.aboutLead': 'Optional. Skip anything you’d rather not share.',
  'ob.gender': 'Gender',
  'ob.age': 'Age range',
  'ob.noSay': 'Prefer not to say',
  'ob.looking': 'What are you looking for?',
  'ob.lookingLead': 'Helps us tailor picks. You can skip this and add it later in Settings.',
  'ob.interests': 'Interests',
  'ob.budget': 'Shopping budget (KRW)',
  'ob.current': 'A product you use now',
  'ob.skip': 'Skip for now',
  'ob.done': 'Done',
  'ob.save': 'Save',
  'common.continue': 'Continue',
  'common.back': 'Back',
  'common.cancel': 'Cancel',
  'nav.home': 'Home',
  'nav.explore': 'Explore',
  'nav.trip': 'My Trip',
  'settings.title': 'Settings',
  'settings.account': 'Account',
  'settings.guest': 'Guest (this browser only)',
  'settings.signIn': 'Sign in with Google',
  'settings.signOut': 'Sign out',
  'settings.edit': 'Edit profile',
}
type Key = keyof typeof en

const ko: Record<Key, string> = {
  brand: '진선미',
  'entry.title': '뷰티, 병원, 동네 경험을 한 번에 계획하세요',
  'entry.lead': 'Google 계정으로 시작하거나, 로그인 없이 바로 둘러보세요.',
  'entry.google': 'Google로 계속하기',
  'entry.guest': '게스트로 시작하기',
  'entry.checking': '로그인 방법을 확인하는 중…',
  'entry.disabled': 'Google 로그인이 아직 켜져 있지 않아요. 게스트로 모든 기능을 쓸 수 있어요.',
  'entry.unavailable': '로그인 서비스에 연결하지 못했어요. 게스트로 계속할 수 있어요.',
  'entry.guestNote': '게스트 데이터는 이 브라우저에만 저장돼요.',
  'callback.working': '로그인을 마무리하는 중…',
  'callback.failed': '로그인이 완료되지 않았어요.',
  'callback.cancelled': '로그인을 취소했어요.',
  'callback.retry': 'Google로 다시 시도',
  'ob.basics': '나에게 맞는 한국 여행',
  'ob.basicsEdit': '기본 정보',
  'ob.basicsLead': '뷰티, 병원, 동네 경험을 한곳에서. 기본 정보 세 가지로 시작해요.',
  'ob.language': '언어',
  'ob.country': '어느 나라에서 오시나요?',
  'ob.currency': '통화',
  'ob.chooseLanguage': '언어 선택',
  'ob.chooseCountry': '국가 선택',
  'ob.chooseCurrency': '통화 선택',
  'ob.about': '조금만 알려주세요',
  'ob.aboutLead': '선택 사항이에요. 원하지 않으면 건너뛰세요.',
  'ob.gender': '성별',
  'ob.age': '연령대',
  'ob.noSay': '응답하지 않음',
  'ob.looking': '무엇을 찾고 있나요?',
  'ob.lookingLead': '추천을 맞추는 데 써요. 지금 건너뛰고 설정에서 나중에 추가할 수 있어요.',
  'ob.interests': '관심사',
  'ob.budget': '쇼핑 예산 (원)',
  'ob.current': '지금 쓰는 제품',
  'ob.skip': '지금은 건너뛰기',
  'ob.done': '완료',
  'ob.save': '저장',
  'common.continue': '계속',
  'common.back': '이전',
  'common.cancel': '취소',
  'nav.home': '홈',
  'nav.explore': '탐색',
  'nav.trip': '내 여행',
  'settings.title': '설정',
  'settings.account': '계정',
  'settings.guest': '게스트 (이 브라우저에만 저장)',
  'settings.signIn': 'Google로 로그인',
  'settings.signOut': '로그아웃',
  'settings.edit': '프로필 수정',
}

const dict: Record<Lang, Record<Key, string>> = { en, ko }

export const toLang = (v: string | null | undefined): Lang => (v === 'ko' ? 'ko' : 'en')
export function browserLang(): Lang {
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}
export function translate(lang: Lang, key: Key): string {
  return dict[lang][key]
}

export const LangContext = createContext<Lang>('en')
// 현재 UI 언어의 제품명을 브라우저 제목에 반영한다(EN: Jinseonmi, KO: 진선미).
export function DocTitle() {
  const lang = useContext(LangContext)
  useEffect(() => {
    document.title = translate(lang, 'brand')
  }, [lang])
  return null
}

export function useT() {
  const lang = useContext(LangContext)
  return (key: Key) => translate(lang, key)
}

// 'detail' 영역 문구. 키는 'detail.' 로 시작한다. en 에 추가하면 ko 에도 같은 키를 넣어야 타입 검사를 통과한다.
export const en = {
  'detail._': '',
}

export const ko: Record<keyof typeof en, string> = {
  'detail._': '',
}

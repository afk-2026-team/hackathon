// 토크나이저(§8.9): NFKC + 소문자 · 한글 음절 bigram · 그 외 단어는 _-./ 분할 + 원형
const TOKEN_RE = /([가-힣]+)|([[\p{L}\p{N}]--[가-힣]]+(?:[_\-.\/][[\p{L}\p{N}]--[가-힣]]+)*)/gv;

export function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const m of normalize(text).matchAll(TOKEN_RE)) {
    if (m[1] !== undefined) {
      const chars = [...m[1]];
      if (chars.length === 1) out.push(chars[0]);
      else for (let i = 0; i + 1 < chars.length; i++) out.push(chars[i] + chars[i + 1]);
      continue;
    }
    const word = m[2];
    const parts = word.split(/[_\-.\/]/);
    for (const p of parts) if ([...p].length >= 2) out.push(p);
    if (parts.length >= 2) out.push(word);
  }
  return out;
}

/** --terms 그룹들의 토큰 합집합(첫 등장 순, 중복 제거) — 그룹 간 OR */
export function queryTokens(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of terms) {
    for (const tok of tokenize(t)) {
      if (!seen.has(tok)) {
        seen.add(tok);
        out.push(tok);
      }
    }
  }
  return out;
}

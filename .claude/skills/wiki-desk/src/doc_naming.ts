// 문서 명명 SSOT(§8.15, 3.2.0 추가) — 순수 모듈: 시계·파일시스템을 읽지 않는다

export class NamingCollisionExhausted extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NamingCollisionExhausted";
  }
}

const UTC_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;
const NA: [string, string, string] = ["NA", "00", "00"];

const p2 = (n: number) => String(n).padStart(2, "0");

/** utcIso('YYYY-MM-DDTHH:MM:SSZ')를 offset(±HH:MM) 현지시로 옮긴 [YYMMDDHH, MM, SS]. 형식·달력 위반은 NA. */
export function localTokens(utcIso: string, offset: string): [string, string, string] {
  const m = UTC_RE.exec(utcIso);
  const o = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!m || !o) return NA;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  if (h > 23 || mi > 59 || s > 59) return NA;
  const ms = Date.UTC(y, mo - 1, d, h, mi, s);
  const chk = new Date(ms);
  if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return NA;
  const shift = (o[1] === "-" ? -1 : 1) * (Number(o[2]) * 60 + Number(o[3]));
  const t = new Date(ms + shift * 60_000);
  const yy = p2(t.getUTCFullYear() % 100);
  return [`${yy}${p2(t.getUTCMonth() + 1)}${p2(t.getUTCDate())}${p2(t.getUTCHours())}`, p2(t.getUTCMinutes()), p2(t.getUTCSeconds())];
}

export function validateTopic(topic: string): void {
  if (typeof topic !== "string" || !/^[A-Za-z0-9_.가-힣]+$/u.test(topic) || topic === "." || topic === "..") {
    throw new Error(
      `doc_naming: topic must be a non-empty run of [A-Za-z0-9_. 한글] with no path separators/whitespace, got ${JSON.stringify(topic)}`,
    );
  }
}

/** 충돌 키는 (type, hour) 뿐 — topic 무관. 두 형태가 모두 점유되면 NamingCollisionExhausted. */
export function datedDocBasename(
  type: string,
  utcIso: string,
  topic: string,
  existing: readonly string[],
  offset: string,
  docTypes: readonly string[],
): string {
  if (!docTypes.includes(type)) throw new Error(`doc_naming: type must be one of ${JSON.stringify(docTypes)}, got ${JSON.stringify(type)}`);
  validateTopic(topic);
  const [hour, mm, ss] = localTokens(utcIso, offset);
  const base = `${type}_${hour}_${topic}.md`;
  const suffixed = `${type}_${hour}_${mm}_${ss}_${topic}.md`;
  if (!existing.some((n) => n.startsWith(`${type}_${hour}_`))) return base;
  if (existing.includes(suffixed)) {
    throw new NamingCollisionExhausted(`doc_naming: both ${base} form and ${suffixed} are taken for (${type}, ${hour})`);
  }
  return suffixed;
}

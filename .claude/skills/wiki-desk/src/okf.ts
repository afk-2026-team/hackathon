// OKF 0.2 카드 렌더·파싱(§8.5)과 OKF 형식 검사(§8.13)
import { emitYaml, locate, parseYaml } from "./frontmatter.ts";
import { classify, splitLines } from "./tree.ts";
import type { Card, Json, JsonObject } from "./types.ts";

export const CARD_SUFFIX = ".card.md";
export const CARD_KEYS = [
  "type", "title", "description", "resource", "tags", "generated", "authority",
  "source_meta", "source_meta_unknown", "needs_review", "review_reasons", "source_sha256",
] as const;

function setKey(obj: JsonObject, key: string, value: Json): void {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

export function cardObject(card: Card, extra: JsonObject = {}): JsonObject {
  const o: JsonObject = {};
  setKey(o, "type", card.type);
  setKey(o, "title", card.title);
  setKey(o, "description", card.description);
  setKey(o, "resource", card.resource);
  setKey(o, "tags", [...card.tags]);
  setKey(o, "generated", { by: card.generated.by, at: card.generated.at });
  setKey(o, "authority", {
    document_type: card.authority.document_type,
    authority_rank: card.authority.authority_rank,
    role: card.authority.role,
  });
  setKey(o, "source_meta", card.source_meta);
  setKey(o, "source_meta_unknown", card.source_meta_unknown);
  setKey(o, "needs_review", card.needs_review);
  setKey(o, "review_reasons", [...card.review_reasons]);
  setKey(o, "source_sha256", card.source_sha256);
  for (const k of Object.keys(extra)) setKey(o, k, extra[k]);
  return o;
}

export function renderBody(card: Card): string {
  const heading = (card.title ?? card.resource).replace(/\r\n|\r|\n/g, " ");
  return `\n# ${heading}\n\n- 원문: \`${card.resource}\`\n`;
}

export function renderCard(card: Card, extra: JsonObject = {}): string {
  return `---\n${emitYaml(cardObject(card, extra))}---\n${renderBody(card)}`;
}

export interface ParsedCard {
  card: Card;
  extra: JsonObject;
  /** frontmatter 닫는 줄 다음부터의 본문 */
  body: string;
  /** frontmatter 줄들(구분선 제외) */
  fmLines: string[];
}

export type CardParse = { ok: true; value: ParsedCard } | { ok: false; error: string };

const AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isObj(v: unknown): v is JsonObject {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isStrOrNull(v: unknown): boolean {
  return v === null || typeof v === "string";
}

function isStrList(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function tryParseCard(rel: string, text: string): CardParse {
  const err = (reason: string): CardParse => ({ ok: false, error: `${rel}: ${reason}` });
  const loc = locate(text);
  if (loc.kind === "none") return err("frontmatter 없음");
  if (loc.kind === "error") return err(loc.error);
  const p = parseYaml(loc.raw);
  if (!p.ok) return err(`frontmatter 파싱 불가: ${p.error}`);
  const d = p.value;
  for (const k of CARD_KEYS) if (!Object.hasOwn(d, k)) return err(`카드 키 누락: ${k}`);
  if (typeof d.type !== "string" || d.type.trim() === "") return err("type 형식 위반");
  if (!isStrOrNull(d.title)) return err("title 형식 위반");
  if (!isStrOrNull(d.description)) return err("description 형식 위반");
  if (typeof d.resource !== "string" || d.resource === "") return err("resource 형식 위반");
  if (!isStrList(d.tags)) return err("tags 형식 위반");
  const g = d.generated;
  if (!isObj(g) || typeof g.by !== "string" || typeof g.at !== "string" || !AT_RE.test(g.at)) return err("generated 형식 위반");
  const a = d.authority;
  if (!isObj(a) || typeof a.document_type !== "string" || typeof a.role !== "string" || !Number.isSafeInteger(a.authority_rank)) {
    return err("authority 형식 위반");
  }
  if (!isObj(d.source_meta)) return err("source_meta 형식 위반");
  if (!isObj(d.source_meta_unknown)) return err("source_meta_unknown 형식 위반");
  if (typeof d.needs_review !== "boolean") return err("needs_review 형식 위반");
  if (!isStrList(d.review_reasons)) return err("review_reasons 형식 위반");
  if (typeof d.source_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(d.source_sha256)) return err("source_sha256 형식 위반");
  if (d.needs_review !== d.review_reasons.length > 0) return err("불변식 위반: needs_review 와 review_reasons 불일치");
  if (!d.tags.includes(d.type)) return err("불변식 위반: type 이 tags 에 없음");
  const extra: JsonObject = {};
  for (const k of Object.keys(d)) if (!(CARD_KEYS as readonly string[]).includes(k)) setKey(extra, k, d[k]);
  const card: Card = {
    type: d.type,
    title: d.title as string | null,
    description: d.description as string | null,
    resource: d.resource,
    tags: d.tags,
    generated: { by: g.by, at: g.at },
    authority: { document_type: a.document_type, authority_rank: a.authority_rank as number, role: a.role },
    source_meta: d.source_meta,
    source_meta_unknown: d.source_meta_unknown,
    needs_review: d.needs_review,
    review_reasons: d.review_reasons,
    source_sha256: d.source_sha256,
  };
  const t = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const lines = t.split("\n");
  const fmLines = lines.slice(1, loc.bodyStartLine - 2);
  const body = lines.slice(loc.bodyStartLine - 1).join("\n");
  return { ok: true, value: { card, extra, body, fmLines } };
}

// ---------------------------------------------------------------- OKF 형식 검사

export interface Issue {
  code: string;
  path: string;
  detail: string;
}

function validDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** rel = 루트 상대 경로, wikiRel = wiki_dir 상대 경로 */
export function okfCheck(rel: string, wikiRel: string, text: string): Issue[] {
  const issues: Issue[] = [];
  const add = (code: string, detail: string) => issues.push({ code, path: rel, detail });
  const base = wikiRel.split("/").pop()!;
  const loc = locate(text);
  let data: JsonObject | null = null;
  if (loc.kind === "error") add("okf.frontmatter_parse", loc.error);
  if (loc.kind === "ok") {
    const p = parseYaml(loc.raw);
    if (p.ok) data = p.value;
    else add("okf.frontmatter_parse", p.error);
  }
  if (base === "index.md") {
    if (data) {
      const isRoot = wikiRel === "index.md";
      const badKeys = Object.keys(data).filter((k) => !isRoot || k !== "okf_version");
      if (badKeys.length > 0) add("okf.index_frontmatter", `허용되지 않는 키: ${badKeys.join(", ")}`);
    }
    return issues;
  }
  if (base === "log.md") {
    const lines = splitLines(text);
    for (const l of classify(lines, loc.bodyStartLine)) {
      if (l.fenceRole !== "none") continue;
      const m = /^## (.*)$/.exec(l.text);
      if (m && !validDate(m[1].trim())) add("okf.log_date", `${l.line}행: ${m[1]}`);
    }
    return issues;
  }
  if (loc.kind === "none") {
    add("okf.missing_frontmatter", "concept 에 frontmatter 없음");
    return issues;
  }
  if (!data) return issues;
  if (typeof data.type !== "string" || data.type.trim() === "") add("okf.missing_type", "type 없음");
  if (Object.hasOwn(data, "generated")) {
    const g = data.generated;
    if (!isObj(g) || typeof g.by !== "string" || g.by.trim() === "") add("okf.generated_by", "generated.by 가 비공백 문자열이 아님");
  }
  if (Object.hasOwn(data, "verified")) {
    const v = data.verified;
    const list = isObj(v) ? [v] : v;
    if (!Array.isArray(list) || list.some((x) => !isObj(x) || typeof x.by !== "string" || x.by.trim() === "")) {
      add("okf.verified_by", "verified 항목마다 비공백 by 필요");
    }
  }
  if (Object.hasOwn(data, "sources")) {
    const s = data.sources;
    if (!Array.isArray(s) || s.some((x) => !isObj(x))) add("okf.sources_shape", "sources 는 매핑 목록이어야 한다");
    else if (s.some((x) => typeof (x as JsonObject).resource !== "string" || ((x as JsonObject).resource as string).trim() === "")) {
      add("okf.source_resource", "sources 항목마다 비공백 resource 필요");
    }
  }
  if (data.type === "Attested Computation" && !Object.hasOwn(data, "runtime")) add("okf.runtime_missing", "Attested Computation 에 runtime 없음");
  return issues;
}

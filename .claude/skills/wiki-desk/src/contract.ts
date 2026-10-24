// 계약 스키마 검증·탐색과 glob(§8.2)
import * as fs from "node:fs";
import * as path from "node:path";
import { inspectInside, isSafeRel, isBelow } from "./fs-safety.ts";
import type { Authority, Contract } from "./types.ts";

export const WIKI_DIRS = ["__llm-wiki", "__llm_wiki"] as const;

/** 원문 순회 차단 segment(대소문자 무시) — tripwire 목록 */
export const BLOCKED_SEGMENTS = new Set([
  ".git", ".wiki-desk", ".agents", ".claude", ".hermes", ".codex", ".ssh", ".aws", "__pycache__", ".pytest_cache",
  ".cache", ".venv", "venv", "node_modules", "secret", "secrets", "generated", "build", "dist",
]);

const RESERVED_WIKI_FILES = ["contract.json", "index.md", "log.md", ".gitignore", "receipt.json"];
const SLOT_KEYS = ["title", "description", "document_type"];

function bad(field: string, reason: string): never {
  throw new Error(`계약 ${field}: ${reason}`);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function nonBlank(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function uniqueList(field: string, v: unknown, allowEmpty: boolean): string[] {
  if (!Array.isArray(v)) bad(field, "목록이어야 한다");
  if (!allowEmpty && v.length === 0) bad(field, "비어 있지 않아야 한다");
  const seen = new Set<string>();
  for (const x of v) {
    if (typeof x !== "string") bad(field, `문자열이 아닌 항목 ${JSON.stringify(x)}`);
    if (seen.has(x)) bad(field, `중복 항목 ${JSON.stringify(x)}`);
    seen.add(x);
  }
  return v as string[];
}

function checkAuthority(field: string, v: unknown, needPattern: boolean): void {
  if (!isObj(v)) bad(field, "객체여야 한다");
  if (needPattern && !isSafeRel(v.pattern)) bad(`${field}.pattern`, "안전 상대경로가 아님");
  if (!nonBlank(v.document_type)) bad(`${field}.document_type`, "비공백 문자열이어야 한다");
  if (!nonBlank(v.role)) bad(`${field}.role`, "비공백 문자열이어야 한다");
  if (!Number.isSafeInteger(v.authority_rank)) bad(`${field}.authority_rank`, "정수여야 한다");
}

function positive(field: string, v: unknown): void {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) bad(field, "0 보다 큰 수여야 한다");
}

function positiveInt(field: string, v: unknown): void {
  if (!Number.isSafeInteger(v) || (v as number) <= 0) bad(field, "양의 정수여야 한다");
}

export function validateNaming(v: unknown): void {
  if (!isObj(v)) bad("naming", "객체여야 한다");
  if (!isSafeRel(v.docs_root)) bad("naming.docs_root", "안전 상대경로가 아님");
  const types = uniqueList("naming.doc_types", v.doc_types, false);
  for (const t of types) if (!/^[a-z]+$/.test(t)) bad("naming.doc_types", `형식 위반 ${JSON.stringify(t)}`);
  if (typeof v.utc_offset !== "string" || !/^[+-]\d{2}:\d{2}$/.test(v.utc_offset)) bad("naming.utc_offset", "±HH:MM 형식이어야 한다");
}

/** 계약 검증. 기본값을 채우지 않는다. 통과하면 원본과 분리된 깊은 복사본을 돌려준다. */
export function validateContract(input: unknown): Contract {
  if (!isObj(input)) bad("(최상위)", "객체여야 한다");
  const c = input;
  if (c.schema_version !== 1) bad("schema_version", "정수 1 만 허용");
  if (!nonBlank(c.project_name)) bad("project_name", "비어 있지 않은 문자열이어야 한다");
  if (c.wiki_dir !== "__llm-wiki" && c.wiki_dir !== "__llm_wiki") bad("wiki_dir", '"__llm-wiki" 또는 "__llm_wiki" 만 허용');
  const wikiDir = c.wiki_dir;

  const roots = uniqueList("source_roots", c.source_roots, false);
  for (const r of roots) {
    if (r !== r.trim()) bad("source_roots", `양끝 공백 금지 ${JSON.stringify(r)}`);
    if (r.includes(":")) bad("source_roots", `':' 금지 ${JSON.stringify(r)}`);
    if (r !== "." && !isSafeRel(r)) bad("source_roots", `안전 상대경로가 아님 ${JSON.stringify(r)}`);
    if (r !== "." && isBelow(r, wikiDir)) bad("source_roots", `wiki_dir 아래 경로 ${JSON.stringify(r)}`);
    if (r !== "." && r.split("/").some((s) => BLOCKED_SEGMENTS.has(s.toLowerCase()))) bad("source_roots", `차단 디렉터리 포함 ${JSON.stringify(r)}`);
  }
  for (const r of uniqueList("excluded_roots", c.excluded_roots, true)) {
    if (!isSafeRel(r)) bad("excluded_roots", `안전 상대경로가 아님 ${JSON.stringify(r)}`);
  }
  const suffixes = uniqueList("source_suffixes", c.source_suffixes, false);
  const lowered = new Set<string>();
  for (const s of suffixes) {
    if (!/^\.[A-Za-z0-9]+$/.test(s)) bad("source_suffixes", `형식 위반 ${JSON.stringify(s)}`);
    if (lowered.has(s.toLowerCase())) bad("source_suffixes", `대소문자만 다른 중복 ${JSON.stringify(s)}`);
    lowered.add(s.toLowerCase());
  }
  if (!Array.isArray(c.authority_rules)) bad("authority_rules", "목록이어야 한다");
  c.authority_rules.forEach((r, i) => checkAuthority(`authority_rules[${i}]`, r, true));
  checkAuthority("fallback", c.fallback, false);
  if (c.copy_policy !== "path_reference") bad("copy_policy", '"path_reference" 만 허용');

  if (!isObj(c.frontmatter_aliases)) bad("frontmatter_aliases", "객체여야 한다");
  const owner = new Map<string, string>(SLOT_KEYS.map((k) => [k, k]));
  for (const canon of Object.keys(c.frontmatter_aliases)) {
    if (owner.has(canon) && owner.get(canon) !== canon) bad("frontmatter_aliases", `이름 ${JSON.stringify(canon)} 이 두 정본에 걸림`);
    owner.set(canon, canon);
  }
  for (const [canon, names] of Object.entries(c.frontmatter_aliases)) {
    if (!Array.isArray(names)) bad(`frontmatter_aliases.${canon}`, "목록이어야 한다");
    for (const n of names) {
      if (!nonBlank(n)) bad(`frontmatter_aliases.${canon}`, "비공백 문자열 목록이어야 한다");
      const prev = owner.get(n);
      if (prev !== undefined && prev !== canon) bad("frontmatter_aliases", `이름 ${JSON.stringify(n)} 이 두 정본에 걸림`);
      if (prev === canon && n !== canon) bad("frontmatter_aliases", `이름 ${JSON.stringify(n)} 중복`);
      owner.set(n, canon);
    }
  }

  if (typeof c.filename_pattern !== "string") bad("filename_pattern", "문자열이어야 한다");
  let groups: Record<string, unknown> | undefined;
  try {
    groups = new RegExp(c.filename_pattern + "|", "u").exec("")?.groups;
  } catch (e) {
    bad("filename_pattern", `컴파일 불가 ${(e as Error).message}`);
  }
  for (const g of ["prefix", "yymmddhh", "title"]) {
    if (!groups || !Object.hasOwn(groups, g)) bad("filename_pattern", `named group ${g} 필수`);
  }

  if (!isObj(c.layout)) bad("layout", "객체여야 한다");
  const dirs: string[] = [];
  for (const k of ["cards_dir", "cache_dir", "archive_dir"]) {
    const v = c.layout[k];
    if (!isSafeRel(v)) bad(`layout.${k}`, "안전 상대경로가 아님");
    if (RESERVED_WIKI_FILES.includes(v.split("/")[0].toLowerCase())) bad(`layout.${k}`, `예약 파일명과 충돌 ${JSON.stringify(v)}`);
    dirs.push(v.toLowerCase());
  }
  for (let i = 0; i < dirs.length; i++) {
    for (let j = 0; j < dirs.length; j++) {
      if (i !== j && isBelow(dirs[i], dirs[j])) bad("layout", "디렉터리가 서로 같거나 포함 관계");
    }
  }

  if (!isObj(c.search)) bad("search", "객체여야 한다");
  const s = c.search;
  positive("search.bm25_k1", s.bm25_k1);
  if (typeof s.bm25_b !== "number" || !(s.bm25_b > 0 && s.bm25_b <= 1)) bad("search.bm25_b", "0 < b ≤ 1 이어야 한다");
  positive("search.authority_weight", s.authority_weight);
  positiveInt("search.span_max_lines", s.span_max_lines);
  positiveInt("search.result_limit", s.result_limit);
  positiveInt("search.spans_per_result", s.spans_per_result);
  if (!isObj(s.field_boost)) bad("search.field_boost", "객체여야 한다");
  for (const f of ["title", "heading", "meta", "body"]) positive(`search.field_boost.${f}`, s.field_boost[f]);

  if (c.naming !== undefined) validateNaming(c.naming);
  if (c.upstream_rules !== undefined) {
    if (!Array.isArray(c.upstream_rules)) bad("upstream_rules", "목록이어야 한다");
    c.upstream_rules.forEach((r, i) => {
      if (!isObj(r)) bad(`upstream_rules[${i}]`, "객체여야 한다");
      if (!isSafeRel(r.pattern)) bad(`upstream_rules[${i}].pattern`, "안전 상대경로가 아님");
      if (!nonBlank(r.key)) bad(`upstream_rules[${i}].key`, "비공백 문자열이어야 한다");
    });
  }
  return structuredClone(c) as Contract;
}

export function parseContractBytes(bytes: Buffer): Contract {
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (e) {
    bad("JSON", `해석 불가 ${(e as Error).message}`);
  }
  return validateContract(data);
}

export interface LoadedContract {
  contract: Contract;
  wikiDir: string;
}

/** <root>/__llm-wiki/contract.json 과 <root>/__llm_wiki/contract.json 중 정확히 하나 */
export function loadContract(root: string): LoadedContract {
  const found = WIKI_DIRS.filter((d) => inspectInside(root, `${d}/contract.json`) === "file");
  if (found.length !== 1) {
    throw new Error(`계약 탐색: ${WIKI_DIRS.map((d) => d + "/contract.json").join(" · ")} 중 정확히 하나가 있어야 한다(발견 ${found.length}개)`);
  }
  const dir = found[0];
  const contract = parseContractBytes(fs.readFileSync(path.join(root, dir, "contract.json")));
  if (contract.wiki_dir !== dir) bad("wiki_dir", `폴더명(${dir})과 다름(${contract.wiki_dir})`);
  return { contract, wikiDir: dir };
}

// ---------------------------------------------------------------- glob

const globCache = new Map<string, RegExp>();

// "**/" = 0개 이상 디렉터리 · "**" = '/' 포함 임의 · "*" = '/' 제외 임의 · 나머지 리터럴 · 전체 일치
export function globToRegExp(pattern: string): RegExp {
  const hit = globCache.get(pattern);
  if (hit) return hit;
  let re = "";
  for (let i = 0; i < pattern.length; ) {
    if (pattern.startsWith("**/", i)) {
      re += "(?:.*/)?";
      i += 3;
    } else if (pattern.startsWith("**", i)) {
      re += ".*";
      i += 2;
    } else if (pattern[i] === "*") {
      re += "[^/]*";
      i += 1;
    } else {
      re += pattern[i].replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
      i += 1;
    }
  }
  const out = new RegExp(`^${re}$`, "su");
  globCache.set(pattern, out);
  return out;
}

export function globMatch(pattern: string, rel: string): boolean {
  return globToRegExp(pattern).test(rel);
}

export function authorityFor(contract: Contract, rel: string): Authority {
  const rule = contract.authority_rules.find((r) => globMatch(r.pattern, rel)) ?? contract.fallback;
  return { document_type: rule.document_type, authority_rank: rule.authority_rank, role: rule.role };
}

export function filenameRegExp(contract: Contract): RegExp {
  return new RegExp(contract.filename_pattern, "u");
}

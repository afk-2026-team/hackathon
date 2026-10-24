// 원문 → 카드 필드 도출(§8.5): frontmatter 매핑 · review_reasons · 결정론
import { authorityFor, filenameRegExp } from "./contract.ts";
import { locate, parseYaml } from "./frontmatter.ts";
import type { SourceRead } from "./fs-safety.ts";
import { upstreamReason } from "./upstream.ts";
import type { Card, Contract, Json, JsonObject } from "./types.ts";

const SLOTS = ["title", "description", "document_type"] as const;
type Slot = (typeof SLOTS)[number];

function setKey(obj: JsonObject, key: string, value: Json): void {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

export function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as Json[];
    return a.length === bb.length && a.every((x, i) => deepEqual(x, bb[i]));
  }
  const ak = Object.keys(a);
  const bo = b as JsonObject;
  const bk = Object.keys(bo);
  return ak.length === bk.length && ak.every((k) => Object.hasOwn(bo, k) && deepEqual(a[k], bo[k]));
}

/** 이름 → 정본 키. title·description·document_type 은 자기 자신에 예약 */
function aliasMap(contract: Contract): Map<string, string> {
  const m = new Map<string, string>(SLOTS.map((s) => [s, s]));
  for (const [canon, names] of Object.entries(contract.frontmatter_aliases)) {
    m.set(canon, canon);
    for (const n of names) m.set(n, canon);
  }
  return m;
}

export interface Built {
  card: Card;
  fmKind: "none" | "error" | "ok";
  bodyStartLine: number;
}

export function buildCard(root: string, contract: Contract, rel: string, src: SourceRead, now: string): Built {
  const reasons: string[] = [];
  if (src.lossy) reasons.push("원문 UTF-8 디코딩 불가: 원문이 UTF-8이 아님(손실 디코딩으로 색인)");
  const base = rel.split("/").pop()!;
  const fm = filenameRegExp(contract).exec(base);
  if (!fm) reasons.push(`파일명 규칙 위반: ${rel}`);

  const loc = locate(src.text);
  let data: JsonObject = {};
  let fmKind: Built["fmKind"] = loc.kind;
  if (loc.kind === "error") reasons.push(`frontmatter 파싱 불가: ${loc.error}`);
  if (loc.kind === "ok") {
    const p = parseYaml(loc.raw);
    if (p.ok) data = p.value;
    else {
      reasons.push(`frontmatter 파싱 불가: ${p.error}`);
      fmKind = "error";
    }
  }

  const names = aliasMap(contract);
  const slots: Partial<Record<Slot, string>> = {};
  const sourceMeta: JsonObject = {};
  const unknown: JsonObject = {};
  const conflicts: string[] = [];
  const blanks: string[] = [];
  for (const key of Object.keys(data)) {
    const v = data[key];
    const canon = names.get(key);
    if (canon === undefined) {
      setKey(unknown, key, v);
      continue;
    }
    if ((SLOTS as readonly string[]).includes(canon)) {
      const slot = canon as Slot;
      if (v === null) continue;
      if (typeof v === "string") {
        if (v.trim() === "") blanks.push(key);
        else if (slots[slot] === undefined) slots[slot] = v;
        else if (slots[slot] !== v) {
          conflicts.push(key);
          setKey(unknown, key, v);
        }
        continue;
      }
      conflicts.push(key);
      setKey(unknown, key, v);
      continue;
    }
    if (!Object.hasOwn(sourceMeta, canon)) setKey(sourceMeta, canon, v);
    else if (!deepEqual(sourceMeta[canon], v)) {
      conflicts.push(key);
      setKey(unknown, key, v);
    }
  }
  for (const k of conflicts) reasons.push(`frontmatter 키 충돌(원형은 source_meta_unknown): ${k}`);
  for (const k of blanks) reasons.push(`frontmatter 값이 비어 있음: ${k}`);

  const tagsRegistered = names.get("tags") === "tags" && Object.hasOwn(contract.frontmatter_aliases, "tags");
  const rawTags: Json | undefined = tagsRegistered
    ? (Object.hasOwn(sourceMeta, "tags") ? sourceMeta.tags : undefined)
    : (Object.hasOwn(data, "tags") ? data.tags : undefined);
  const strTags: string[] = [];
  if (rawTags !== undefined) {
    if (!Array.isArray(rawTags)) reasons.push(`tags가 리스트가 아님: ${JSON.stringify(rawTags)}`);
    else {
      const badEls = rawTags.filter((t) => typeof t !== "string");
      if (badEls.length > 0) reasons.push(`tags 원소가 문자열이 아님: ${badEls.map((x) => JSON.stringify(x)).join(", ")}`);
      for (const t of rawTags) if (typeof t === "string") strTags.push(t);
    }
  }

  const up = upstreamReason(root, contract, rel, fmKind, fmKind === "ok" ? data : null);
  if (up) reasons.push(up);

  const authority = authorityFor(contract, rel);
  const groups = fm?.groups ?? {};
  const type = [slots.document_type, groups.prefix, authority.document_type].find((x) => typeof x === "string" && x.trim() !== "")!;
  const title = slots.title ?? (fm && typeof groups.title === "string" ? groups.title.replaceAll("_", " ") : null);
  const tags: string[] = [];
  for (const t of [type, ...strTags]) if (!tags.includes(t)) tags.push(t);

  const card: Card = {
    type,
    title,
    description: slots.description ?? null,
    resource: rel,
    tags,
    generated: { by: "process:wiki-desk-ts", at: now },
    authority,
    source_meta: sourceMeta,
    source_meta_unknown: unknown,
    needs_review: reasons.length > 0,
    review_reasons: reasons,
    source_sha256: src.sha,
  };
  return { card, fmKind, bodyStartLine: loc.bodyStartLine };
}

/** 검색용 파일명 title(_→공백), 없으면 null */
export function filenameTitle(contract: Contract, rel: string): string | null {
  const base = rel.split("/").pop()!;
  const t = filenameRegExp(contract).exec(base)?.groups?.title;
  return typeof t === "string" ? t.replaceAll("_", " ") : null;
}

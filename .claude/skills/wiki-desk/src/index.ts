// 색인과 파생 캐시(§8.10): 필드 title·heading·meta·body · 캐시 <wiki_dir>/<cache_dir>/index.json
import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { locate } from "./frontmatter.ts";
import { inspectInside, type SourceRead } from "./fs-safety.ts";
import { classify, splitLines } from "./tree.ts";
import { tokenize } from "./tokenize.ts";
import type { Json } from "./types.ts";

export type TF = Record<string, number>;

export interface CachedDoc {
  p: string;
  h: string;
  l: [number, number];
  t: [TF, TF];
}

export function countTokens(tokens: string[]): TF {
  const tf: TF = Object.create(null);
  for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
  return tf;
}

/** 본문(bodyStartLine 부터) 헤딩 줄의 제목 / 그 외 줄 전부(펜스·코드·빈 줄 포함) */
export function bodyFields(text: string): { heading: string[]; body: string[] } {
  const lines = splitLines(text);
  const heading: string[] = [];
  const body: string[] = [];
  for (const l of classify(lines, locate(text).bodyStartLine)) {
    if (l.heading) heading.push(...tokenize(l.heading.title));
    else body.push(...tokenize(l.text));
  }
  return { heading, body };
}

export function indexDoc(rel: string, src: SourceRead): CachedDoc {
  const { heading, body } = bodyFields(src.text);
  return { p: rel, h: src.sha, l: [heading.length, body.length], t: [countTokens(heading), countTokens(body)] };
}

/** meta = 스칼라(중첩 펼침, null 제외)를 공백으로 이은 것 */
export function flattenScalars(v: Json | undefined, out: string[] = []): string[] {
  if (v === null || v === undefined) return out;
  if (Array.isArray(v)) for (const x of v) flattenScalars(x, out);
  else if (typeof v === "object") for (const k of Object.keys(v)) flattenScalars(v[k], out);
  else out.push(String(v));
  return out;
}

function isTF(v: unknown): v is TF {
  return v !== null && typeof v === "object" && !Array.isArray(v) && Object.values(v as object).every((n) => Number.isSafeInteger(n) && (n as number) > 0);
}

function isCachedDoc(v: unknown): v is CachedDoc {
  if (v === null || typeof v !== "object") return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.p === "string" && typeof d.h === "string" && /^[0-9a-f]{64}$/.test(d.h) &&
    Array.isArray(d.l) && d.l.length === 2 && d.l.every((n) => Number.isSafeInteger(n) && (n as number) >= 0) &&
    Array.isArray(d.t) && d.t.length === 2 && d.t.every(isTF)
  );
}

export interface CacheLoad {
  docs: Map<string, CachedDoc>;
  reset: string | null;
  existed: boolean;
}

export function loadCache(root: string, cacheRel: string): CacheLoad {
  const kind = inspectInside(root, cacheRel);
  if (kind === "absent") return { docs: new Map(), reset: null, existed: false };
  if (kind !== "file") return { docs: new Map(), reset: "캐시 경로가 파일이 아님", existed: true };
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(path.join(root, cacheRel), "utf8"));
  } catch (e) {
    return { docs: new Map(), reset: `캐시 JSON 해석 불가: ${(e as Error).message}`, existed: true };
  }
  const d = data as Record<string, unknown>;
  if (d === null || typeof d !== "object" || d.v !== 1 || !Array.isArray(d.docs) || !d.docs.every(isCachedDoc)) {
    return { docs: new Map(), reset: "캐시 형태가 틀림(v·docs)", existed: true };
  }
  const docs = new Map<string, CachedDoc>();
  for (const doc of d.docs as CachedDoc[]) docs.set(doc.p, doc);
  return { docs, reset: null, existed: true };
}

/** 캐시는 --apply 대상이 아닌 파생물 — 질의가 같은 디렉터리 임시파일 → rename 으로 쓴다 */
export function writeCache(root: string, cacheRel: string, docs: CachedDoc[]): void {
  const segs = cacheRel.split("/");
  let cur = root;
  for (const seg of segs.slice(0, -1)) {
    cur = path.join(cur, seg);
    if (!fs.existsSync(cur)) fs.mkdirSync(cur, { mode: 0o755 });
  }
  inspectInside(root, cacheRel.split("/").slice(0, -1).join("/"));
  const abs = path.join(root, cacheRel);
  const tmp = path.join(path.dirname(abs), ".wiki-desk-txn-" + randomBytes(8).toString("hex"));
  fs.writeFileSync(tmp, JSON.stringify({ v: 1, docs }), { mode: 0o644 });
  fs.renameSync(tmp, abs);
}

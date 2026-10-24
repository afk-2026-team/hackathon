// 명령 구현(§8.7·§8.8·§8.13·§8.14·§8.15)
import * as fs from "node:fs";
import * as path from "node:path";
import { authorityFor, loadContract, parseContractBytes, WIKI_DIRS } from "./contract.ts";
import { datedDocBasename, localTokens } from "./doc_naming.ts";
import {
  applyTxn, inspectInside, isBelow, isSafeRel, planTxn, readFileInside, readIfExists, sha256, type ApplyOptions, type WriteOp,
} from "./fs-safety.ts";
import { flattenScalars, indexDoc, loadCache, writeCache, type CachedDoc } from "./index.ts";
import { buildCard, filenameTitle } from "./mapping.ts";
import { CARD_SUFFIX, okfCheck, renderBody, renderCard, tryParseCard, type Issue, type ParsedCard } from "./okf.ts";
import { idfTable, scoreDocs, spansFor, type DocFields } from "./query.ts";
import { listSources, readSpan, treeOf } from "./read.ts";
import { countTokens } from "./index.ts";
import { queryTokens, tokenize } from "./tokenize.ts";
import type { Card, Contract, HeadingNode, JsonObject } from "./types.ts";

// ---------------------------------------------------------------- 경로

interface Paths {
  wiki: string;
  cards: string;
  archive: string;
  cacheDir: string;
  cache: string;
  contract: string;
  receipt: string;
  index: string;
  log: string;
  gitignore: string;
}

function pathsOf(c: Contract): Paths {
  const w = c.wiki_dir;
  return {
    wiki: w,
    cards: `${w}/${c.layout.cards_dir}`,
    archive: `${w}/${c.layout.archive_dir}`,
    cacheDir: `${w}/${c.layout.cache_dir}`,
    cache: `${w}/${c.layout.cache_dir}/index.json`,
    contract: `${w}/contract.json`,
    receipt: `${w}/receipt.json`,
    index: `${w}/index.md`,
    log: `${w}/log.md`,
    gitignore: `${w}/.gitignore`,
  };
}

const cardPathOf = (p: Paths, src: string) => `${p.cards}/${src}${CARD_SUFFIX}`;
const archivePathOf = (p: Paths, src: string) => `${p.archive}/${src}${CARD_SUFFIX}`;

/** dirRel 아래 모든 파일(루트 상대). 심링크·특수 파일은 throw. skip 아래는 내려가지 않는다. */
function listFiles(root: string, dirRel: string, skip: string[] = []): string[] {
  if (inspectInside(root, dirRel) !== "dir") return [];
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const ent of fs.readdirSync(path.join(root, rel)).sort()) {
      const child = `${rel}/${ent}`;
      if (skip.some((s) => isBelow(child, s))) continue;
      const st = fs.lstatSync(path.join(root, child));
      if (st.isSymbolicLink()) throw new Error(`위키 안 심볼릭링크 거부: ${child}`);
      if (st.isDirectory()) walk(child);
      else if (st.isFile()) out.push(child);
      else throw new Error(`위키 안 특수 파일 거부: ${child}`);
    }
  };
  walk(dirRel);
  return out.sort();
}

function cardSources(root: string, p: Paths, dir: string): string[] {
  return listFiles(root, dir)
    .filter((f) => f.endsWith(CARD_SUFFIX))
    .map((f) => f.slice(dir.length + 1, -CARD_SUFFIX.length));
}

// ---------------------------------------------------------------- 운영 파일

type Receipt = Record<string, string>;

function loadReceipt(root: string, p: Paths): Receipt {
  const bytes = readIfExists(root, p.receipt);
  if (bytes === null) throw new Error(`receipt 없음(${p.receipt}) — 생성물 소유 근거가 없어 적용 거부. init으로 만든 위키인지 확인`);
  let data: unknown;
  try {
    data = JSON.parse(bytes.toString("utf8"));
  } catch (e) {
    throw new Error(`receipt 해석 불가(${p.receipt}): ${(e as Error).message}`);
  }
  const files = (data as { files?: unknown } | null)?.files;
  if (files === null || typeof files !== "object" || Array.isArray(files)) throw new Error(`receipt 형식 위반(${p.receipt}): files 객체 필요`);
  const out: Receipt = {};
  for (const [k, v] of Object.entries(files as Record<string, unknown>)) {
    if (!isSafeRel(k) || k === p.wiki || !isBelow(k, p.wiki)) throw new Error(`receipt 경로 위반: ${JSON.stringify(k)}`);
    if (typeof v !== "string" || !/^[0-9a-f]{64}$/.test(v)) throw new Error(`receipt 해시 위반: ${JSON.stringify(k)}`);
    out[k] = v;
  }
  return out;
}

export function renderReceipt(files: Receipt): string {
  const sorted: Receipt = {};
  for (const k of Object.keys(files).sort()) sorted[k] = files[k];
  return JSON.stringify({ files: sorted }, null, 1) + "\n";
}

export const LOG_HEADER = "# 위키 변경 이력\n";

export function appendLog(text: string, items: string[], today: string): string {
  const lines = text.replace(/\n+$/, "").split("\n");
  const entries = items.map((i) => `- ${i}`);
  const first = lines.findIndex((l) => l.startsWith("## "));
  if (first >= 0 && lines[first] === `## ${today}`) {
    let end = lines.findIndex((l, i) => i > first && l.startsWith("## "));
    if (end < 0) end = lines.length;
    let at = end;
    while (at > first + 1 && lines[at - 1].trim() === "") at--;
    lines.splice(at, 0, ...entries);
  } else {
    const at = first >= 0 ? first : lines.length;
    const block = [`## ${today}`, ...entries];
    if (at > 0 && lines[at - 1].trim() !== "") block.unshift("");
    if (first >= 0) block.push("");
    lines.splice(at, 0, ...block);
  }
  return lines.join("\n") + "\n";
}

const INDEX_HEADER = '---\nokf_version: "0.2"\n---\n\n';

export function renderIndex(contract: Contract, cards: Card[]): string {
  if (cards.length === 0) return `${INDEX_HEADER}# ${contract.project_name}\n\n카드 없음\n`;
  const groups = new Map<string, string[]>();
  for (const c of cards) {
    const label = (c.title ?? c.resource).replace(/[\[\]\n]/g, " ");
    const desc = c.description === null ? "" : ` - ${c.description.replace(/\r\n|\r|\n/g, " ")}`;
    const item = `* [${label}](${contract.layout.cards_dir}/${c.resource}${CARD_SUFFIX})${desc}`;
    if (!groups.has(c.type)) groups.set(c.type, []);
    groups.get(c.type)!.push(item);
  }
  const types = [...groups.keys()].sort();
  return INDEX_HEADER + types.map((t) => `# ${t}\n\n${groups.get(t)!.join("\n")}\n`).join("\n");
}

const today = (now: string) => now.slice(0, 10);

function commit(root: string, p: Paths, ops: WriteOp[], txn?: ApplyOptions): void {
  applyTxn(planTxn(root, p.wiki, ops), txn);
}

// ---------------------------------------------------------------- init

export function cmdInit(root: string, contractFile: string, apply: boolean, now: string, txn?: ApplyOptions) {
  const bytes = fs.readFileSync(path.resolve(contractFile));
  const contract = parseContractBytes(bytes);
  for (const d of WIKI_DIRS) {
    if (inspectInside(root, d) !== "absent") throw new Error(`위키가 이미 존재한다(덮어쓰기 없음): ${d}`);
  }
  const p = pathsOf(contract);
  const files: [string, Buffer][] = [
    [p.contract, bytes],
    [p.gitignore, Buffer.from(`${contract.layout.cache_dir}/\n`)],
    [p.index, Buffer.from(renderIndex(contract, []))],
    [p.log, Buffer.from(appendLog(LOG_HEADER, ["init: 위키 생성"], today(now)))],
  ];
  const receipt: Receipt = {};
  for (const [k, v] of files) receipt[k] = sha256(v);
  const ops: WriteOp[] = [...files.map(([k, v]) => ({ path: k, data: v })), { path: p.receipt, data: Buffer.from(renderReceipt(receipt)) }];
  if (apply) commit(root, p, ops, txn);
  return { applied: apply, wiki_dir: contract.wiki_dir, writes: ops.map((o) => o.path) };
}

// ---------------------------------------------------------------- sync

type Ownership = "absent" | "owned" | "owned-with-human-keys" | "edited";

function ownership(bytes: Buffer | null, record: string | undefined, parsed: ParsedCard | null): Ownership {
  if (bytes === null) return "absent";
  if (record !== undefined && sha256(bytes) === record) return "owned";
  if (!parsed || Object.keys(parsed.extra).length === 0 || record === undefined) return "edited";
  if (parsed.body !== renderBody(parsed.card)) return "edited";
  const rendered = renderCard(parsed.card, parsed.extra);
  const toolLines = new Set(rendered.split("\n").slice(1, rendered.split("\n").indexOf("---", 1)));
  if (!parsed.fmLines.every((l) => toolLines.has(l))) return "edited";
  return sha256(renderCard(parsed.card)) === record ? "owned-with-human-keys" : "edited";
}

export interface SyncOptions {
  apply: boolean;
  acceptRemoved: string[];
  relocate: [string, string][];
}

export function cmdSync(root: string, opts: SyncOptions, now: string, txn?: ApplyOptions) {
  const { contract } = loadContract(root);
  const p = pathsOf(contract);
  const receipt = loadReceipt(root, p);
  const sources = listSources(root, contract);
  const srcSet = new Set(sources);
  const orphans = cardSources(root, p, p.cards).filter((s) => !srcSet.has(s));

  const named = new Set<string>();
  const moves: { old: string; log: string }[] = [];
  const claim = (old: string, flag: string) => {
    if (named.has(old)) throw new Error(`${flag} 중복 지정: ${old}`);
    if (!orphans.includes(old)) throw new Error(`${flag} 는 고아 카드만 지정할 수 있다: ${old}`);
    named.add(old);
  };
  for (const old of opts.acceptRemoved) {
    claim(old, "--accept-removed");
    moves.push({ old, log: `보존이동: ${old} (원문 삭제 수용)` });
  }
  for (const [old, neu] of opts.relocate) {
    claim(old, "--relocate");
    if (!srcSet.has(neu)) throw new Error(`--relocate NEW 가 원문 범위에 없음: ${neu}`);
    moves.push({ old, log: `보존이동: ${old} → ${neu} (이동)` });
  }
  const orphansBlocked = orphans.filter((o) => !named.has(o));

  const ops: WriteOp[] = [];
  const next: Receipt = { ...receipt };
  const created: string[] = [];
  const updated: string[] = [];
  const reverify: string[] = [];
  const protectedPaths: string[] = [];
  const invalid: string[] = [];
  const needsReview: string[] = [];
  const indexCards: Card[] = [];
  let protectedCards = 0;

  for (const src of sources) {
    const built = buildCard(root, contract, src, readFileInside(root, src), now).card;
    if (built.needs_review) needsReview.push(src);
    const cp = cardPathOf(p, src);
    const bytes = readIfExists(root, cp);
    const pr = bytes === null ? null : tryParseCard(cp, bytes.toString("utf8"));
    const parsed = pr && pr.ok ? pr.value : null;
    const state = ownership(bytes, receipt[cp], parsed);
    if (state === "edited") {
      protectedPaths.push(cp);
      protectedCards++;
      if (!parsed) invalid.push(cp);
      indexCards.push(parsed ? parsed.card : built);
      continue;
    }
    const extra: JsonObject = parsed ? parsed.extra : {};
    if (parsed) {
      const same = renderCard({ ...built, generated: { ...built.generated, at: parsed.card.generated.at } }) === renderCard(parsed.card);
      if (same) {
        indexCards.push(parsed.card);
        continue;
      }
      if (Object.hasOwn(extra, "verified")) {
        reverify.push(src);
        indexCards.push(parsed.card);
        continue;
      }
    }
    const out = renderCard(built, extra);
    ops.push({ path: cp, data: Buffer.from(out) });
    next[cp] = Object.keys(extra).length > 0 ? sha256(renderCard(built)) : sha256(out);
    (bytes === null ? created : updated).push(src);
    indexCards.push(built);
  }

  const archived: string[] = [];
  for (const m of moves) {
    const cp = cardPathOf(p, m.old);
    const ap = archivePathOf(p, m.old);
    if (inspectInside(root, ap) !== "absent") throw new Error(`보존 이동 목적지가 이미 있음: ${ap}`);
    ops.push({ path: ap, data: readFileInside(root, cp).bytes });
    ops.push({ path: cp, data: null });
    if (receipt[cp] !== undefined) next[ap] = receipt[cp];
    delete next[cp];
    archived.push(m.old);
  }

  const humanEdited = (rel: string, bytes: Buffer | null) => bytes !== null && sha256(bytes) !== receipt[rel];
  if (created.length + updated.length + archived.length > 0) {
    const cur = readIfExists(root, p.log);
    if (humanEdited(p.log, cur)) protectedPaths.push(p.log);
    else {
      const items = [`sync: 생성 ${created.length} · 갱신 ${updated.length} · 보존이동 ${archived.length}`, ...moves.map((m) => m.log)];
      const text = appendLog(cur === null ? LOG_HEADER : cur.toString("utf8"), items, today(now));
      ops.push({ path: p.log, data: Buffer.from(text) });
      next[p.log] = sha256(text);
    }
  }
  if (inspectInside(root, p.gitignore) === "absent") {
    const g = `${contract.layout.cache_dir}/\n`;
    ops.push({ path: p.gitignore, data: Buffer.from(g) });
    next[p.gitignore] = sha256(g);
  }
  const index = renderIndex(contract, indexCards);
  const curIndex = readIfExists(root, p.index);
  if (curIndex === null || curIndex.toString("utf8") !== index) {
    if (humanEdited(p.index, curIndex)) protectedPaths.push(p.index);
    else {
      ops.push({ path: p.index, data: Buffer.from(index) });
      next[p.index] = sha256(index);
    }
  }

  const writes = ops.map((o) => o.path);
  const receiptText = renderReceipt(next);
  const allOps = receiptText === renderReceipt(receipt) ? ops : [...ops, { path: p.receipt, data: Buffer.from(receiptText) }];
  const plan = planTxn(root, p.wiki, allOps);
  if (opts.apply) {
    if (orphansBlocked.length > 0) {
      throw new Error(`원문 없는 고아 카드가 있어 적용 거부(--accept-removed 또는 --relocate로 명시 조정): ${orphansBlocked.join(", ")}`);
    }
    applyTxn(plan, txn);
  }
  return {
    applied: opts.apply,
    sources: sources.length,
    created,
    updated,
    archived,
    unchanged: sources.length - created.length - updated.length - reverify.length - protectedCards,
    protected: protectedPaths,
    invalid,
    reverify,
    orphans_blocked: orphansBlocked,
    needs_review: needsReview,
    writes,
  };
}

// ---------------------------------------------------------------- check · status

export function cmdCheck(root: string) {
  const { contract } = loadContract(root);
  const p = pathsOf(contract);
  const issues: Issue[] = [];
  for (const f of listFiles(root, p.wiki, [p.cacheDir])) {
    if (!f.endsWith(".md")) continue;
    issues.push(...okfCheck(f, f.slice(p.wiki.length + 1), readFileInside(root, f).text));
  }
  const sources = listSources(root, contract);
  const srcSet = new Set(sources);
  const cardFiles = listFiles(root, p.cards);
  let cards = 0;
  let needsReview = 0;
  const hasCard = new Set<string>();
  for (const f of cardFiles) {
    if (!f.endsWith(CARD_SUFFIX)) {
      issues.push({ code: "card.unrecognized", path: f, detail: "카드 디렉터리의 *.card.md 밖 파일" });
      continue;
    }
    cards++;
    const src = f.slice(p.cards.length + 1, -CARD_SUFFIX.length);
    hasCard.add(src);
    const pr = tryParseCard(f, readFileInside(root, f).text);
    if (!pr.ok) issues.push({ code: "card.invalid", path: f, detail: pr.error });
    else if (pr.value.card.needs_review) needsReview++;
    if (!srcSet.has(src)) {
      issues.push({ code: "card.orphan", path: f, detail: "카드는 있으나 원문 없음" });
      continue;
    }
    if (pr.ok && pr.value.card.source_sha256 !== readFileInside(root, src).sha) {
      issues.push({ code: "card.stale", path: src, detail: "원문 해시가 카드와 다름" });
    }
  }
  for (const s of sources) if (!hasCard.has(s)) issues.push({ code: "card.missing", path: s, detail: "원문은 있으나 카드 없음" });
  const archivedCount = listFiles(root, p.archive).filter((f) => f.endsWith(CARD_SUFFIX)).length;
  return {
    ok: issues.length === 0,
    issues,
    counts: { sources: sources.length, cards, archived: archivedCount, needs_review: needsReview },
  };
}

export function cmdStatus(root: string) {
  const { contract } = loadContract(root);
  const p = pathsOf(contract);
  return {
    wiki_dir: contract.wiki_dir,
    project_name: contract.project_name,
    sources: listSources(root, contract).length,
    cards: cardSources(root, p, p.cards).length,
    archived: cardSources(root, p, p.archive).length,
    index_cache: inspectInside(root, p.cache) === "file",
  };
}

// ---------------------------------------------------------------- remove

export function cmdRemove(root: string, apply: boolean, txn?: ApplyOptions) {
  const { contract } = loadContract(root);
  const p = pathsOf(contract);
  const receipt = loadReceipt(root, p);
  const deletes: string[] = [];
  const preserved: string[] = [];
  const remaining: Receipt = {};
  for (const k of Object.keys(receipt).sort()) {
    if (k === p.contract) {
      remaining[k] = receipt[k];
      continue;
    }
    const bytes = readIfExists(root, k);
    if (bytes === null) continue;
    if (sha256(bytes) === receipt[k]) deletes.push(k);
    else {
      preserved.push(k);
      remaining[k] = receipt[k];
    }
  }
  if (inspectInside(root, p.cache) === "file") deletes.push(p.cache);
  if (apply) {
    commit(root, p, [...deletes.map((d) => ({ path: d, data: null })), { path: p.receipt, data: Buffer.from(renderReceipt(remaining)) }], txn);
    pruneEmptyDirs(root, p.wiki);
  }
  return { applied: apply, deletes, preserved, kept: [p.contract, p.receipt] };
}

/** wiki_dir 안에서 비게 된 하위 디렉터리만 지운다(wiki_dir 자신은 남긴다) */
function pruneEmptyDirs(root: string, wiki: string): void {
  const walk = (rel: string): boolean => {
    const abs = path.join(root, rel);
    let empty = true;
    for (const ent of fs.readdirSync(abs)) {
      const child = `${rel}/${ent}`;
      const st = fs.lstatSync(path.join(root, child));
      if (st.isDirectory() && !st.isSymbolicLink() && walk(child)) fs.rmdirSync(path.join(root, child));
      else empty = false;
    }
    return empty;
  };
  walk(wiki);
}

// ---------------------------------------------------------------- query · read · tree

export function cmdQuery(root: string, terms: string[], limit: number | undefined) {
  const t0 = performance.now();
  const { contract } = loadContract(root);
  const p = pathsOf(contract);
  const tokens = queryTokens(terms);
  if (tokens.length === 0) throw new Error(`질의어가 색인 가능한 토큰을 만들지 못함(1글자 영숫자·기호만): ${JSON.stringify(terms)}`);
  const sources = listSources(root, contract);
  const cache = loadCache(root, p.cache);
  const stale: string[] = [];
  const missing: string[] = [];
  const invalidCards: string[] = [];
  const docs: DocFields[] = [];
  const cached: CachedDoc[] = [];
  const texts = new Map<string, string>();
  let rebuilt = 0;
  for (const src of sources) {
    const read = readFileInside(root, src);
    texts.set(src, read.text);
    const cp = cardPathOf(p, src);
    const cardBytes = readIfExists(root, cp);
    let card: Card | null = null;
    if (cardBytes === null) missing.push(src);
    else {
      const pr = tryParseCard(cp, cardBytes.toString("utf8"));
      if (!pr.ok) invalidCards.push(cp);
      else {
        card = pr.value.card;
        if (card.source_sha256 !== read.sha) stale.push(src);
      }
    }
    let doc = cache.docs.get(src);
    if (!doc || doc.h !== read.sha) {
      doc = indexDoc(src, read);
      rebuilt++;
    }
    cached.push(doc);
    const title = card?.title ?? filenameTitle(contract, src) ?? src.split("/").pop()!;
    const metaTokens = card ? tokenize(flattenScalars([card.type, card.tags, card.source_meta, card.source_meta_unknown]).join(" ")) : [];
    const titleTokens = tokenize(title);
    docs.push({
      path: src,
      title,
      authorityRank: authorityFor(contract, src).authority_rank,
      tf: { title: countTokens(titleTokens), heading: doc.t[0], meta: countTokens(metaTokens), body: doc.t[1] },
      len: { title: titleTokens.length, heading: doc.l[0], meta: metaTokens.length, body: doc.l[1] },
    });
  }
  const removed = [...cache.docs.keys()].filter((k) => !texts.has(k)).length;
  if (rebuilt > 0 || removed > 0 || (cache.reset !== null && cache.existed)) writeCache(root, p.cache, cached);
  const idf = idfTable(docs, tokens);
  const unmatched = tokens.filter((t) => docs.every((d) => (["title", "heading", "meta", "body"] as const).every((f) => !Object.hasOwn(d.tf[f], t))));
  const scored = scoreDocs(contract, docs, tokens, idf).slice(0, limit ?? contract.search.result_limit);
  const results = scored.map((s) => ({
    path: s.doc.path,
    score: s.score,
    authority_rank: s.doc.authorityRank,
    title: s.doc.title,
    spans: spansFor(contract, s.doc.path, texts.get(s.doc.path)!, tokens, idf),
  }));
  return {
    terms,
    query_tokens: tokens,
    unmatched_tokens: unmatched,
    results,
    stale,
    missing_cards: missing,
    invalid_cards: invalidCards,
    corpus: docs.length,
    index_rebuilt: rebuilt,
    index_cache_reset: cache.reset,
    elapsed_ms: Math.round(performance.now() - t0),
  };
}

export function cmdRead(root: string, ref: string) {
  return readSpan(root, loadContract(root).contract, ref);
}

export function cmdTree(root: string, rel: string): HeadingNode[] {
  return treeOf(root, loadContract(root).contract, rel);
}

// ---------------------------------------------------------------- name

export function cmdName(root: string, type: string, topic: string, at: string | undefined, now: string) {
  const { contract } = loadContract(root);
  const naming = contract.naming;
  if (naming === undefined) throw new Error("계약 naming: name 명령에는 naming 이 필수다");
  const utc = at ?? now.replace(/\.\d{3}Z$/, "Z");
  if (localTokens(utc, naming.utc_offset)[0] === "NA") throw new Error(`--at 형식 위반(UTC 'YYYY-MM-DDTHH:MM:SSZ'): ${utc}`);
  const dirRel = `${naming.docs_root}/${type}`;
  const existing = naming.doc_types.includes(type) && inspectInside(root, dirRel) === "dir" ? fs.readdirSync(path.join(root, dirRel)) : [];
  const basename = datedDocBasename(type, utc, topic, existing, naming.utc_offset, naming.doc_types);
  const hour = localTokens(utc, naming.utc_offset)[0];
  return { type, basename, path: `${dirRel}/${basename}`, suffixed: basename !== `${type}_${hour}_${topic}.md` };
}

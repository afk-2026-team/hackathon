// BM25F 변형 점수(§8.10)와 근거 구간 span(§8.11)
import { locate } from "./frontmatter.ts";
import type { TF } from "./index.ts";
import { buildTree, classify, headingPath, splitLines } from "./tree.ts";
import { tokenize } from "./tokenize.ts";
import type { Contract, HeadingNode } from "./types.ts";

export const FIELDS = ["title", "heading", "meta", "body"] as const;
export type Field = (typeof FIELDS)[number];

export interface DocFields {
  path: string;
  title: string;
  authorityRank: number;
  tf: Record<Field, TF>;
  len: Record<Field, number>;
}

export function tfOf(tf: TF, t: string): number {
  return Object.hasOwn(tf, t) ? tf[t] : 0;
}

export function idfTable(docs: DocFields[], tokens: string[]): Map<string, number> {
  const N = docs.length;
  const idf = new Map<string, number>();
  for (const t of tokens) {
    const df = docs.filter((d) => FIELDS.some((f) => tfOf(d.tf[f], t) > 0)).length;
    idf.set(t, Math.log(1 + (N - df + 0.5) / (df + 0.5)));
  }
  return idf;
}

export interface Scored {
  doc: DocFields;
  score: number;
}

export function scoreDocs(contract: Contract, docs: DocFields[], tokens: string[], idf: Map<string, number>): Scored[] {
  const { bm25_k1: k1, bm25_b: b, field_boost: boost, authority_weight: w } = contract.search;
  const avg = {} as Record<Field, number>;
  for (const f of FIELDS) avg[f] = docs.length === 0 ? 0 : docs.reduce((s, d) => s + d.len[f], 0) / docs.length;
  const out: Scored[] = [];
  for (const d of docs) {
    let score = 0;
    let matched = false;
    for (const t of tokens) {
      let fieldSum = 0;
      for (const f of FIELDS) {
        const tf = tfOf(d.tf[f], t);
        if (tf === 0) continue;
        matched = true;
        fieldSum += (boost[f] * (tf * (k1 + 1))) / (tf + k1 * (1 - b + (b * d.len[f]) / avg[f]));
      }
      score += idf.get(t)! * fieldSum;
    }
    if (!matched) continue;
    score += d.authorityRank * w;
    out.push({ doc: d, score });
  }
  out.sort((x, y) => (y.score - x.score) || (x.doc.path < y.doc.path ? -1 : x.doc.path > y.doc.path ? 1 : 0));
  return out;
}

// ---------------------------------------------------------------- span

interface Block {
  start: number;
  end: number;
}

/** 빈 줄로 구분된 문단 · 펜스 코드는 통째 한 블록 · 헤딩 줄은 블록을 끊고 바로 뒤 첫 블록에 붙는다 */
export function splitBlocks(lines: string[], bodyStartLine: number): Block[] {
  const info = classify(lines, bodyStartLine);
  const blocks: Block[] = [];
  let cur: Block | null = null;
  let pendingHeading: number | null = null;
  const flush = () => {
    if (cur) blocks.push(cur);
    cur = null;
  };
  const begin = (line: number) => {
    cur = { start: pendingHeading ?? line, end: line };
    pendingHeading = null;
  };
  for (const l of info) {
    if (l.heading) {
      flush();
      if (pendingHeading !== null) blocks.push({ start: pendingHeading, end: pendingHeading });
      pendingHeading = l.line;
      continue;
    }
    if (l.fenceRole === "open") {
      flush();
      begin(l.line);
      continue;
    }
    if (l.fenceRole === "inside" || l.fenceRole === "close") {
      if (!cur) begin(l.line);
      cur!.end = l.line;
      if (l.fenceRole === "close") flush();
      continue;
    }
    if (l.text.trim() === "") {
      flush();
      continue;
    }
    if (!cur) begin(l.line);
    else cur.end = l.line;
  }
  flush();
  if (pendingHeading !== null) blocks.push({ start: pendingHeading, end: pendingHeading });
  return blocks.sort((a, b) => a.start - b.start);
}

export interface Span {
  ref: string;
  heading_path: string[];
  start: number;
  end: number;
}

export function spansFor(contract: Contract, rel: string, text: string, tokens: string[], idf: Map<string, number>): Span[] {
  const { bm25_k1: k1, span_max_lines: maxLines, spans_per_result: limit } = contract.search;
  const lines = splitLines(text);
  const bodyStart = locate(text).bodyStartLine;
  const tree: HeadingNode[] = buildTree(lines, bodyStart);
  const lineTokens = lines.map((l) => tokenize(l));
  const wanted = new Set(tokens);
  const windowScore = (s: number, e: number): number => {
    const tf = new Map<string, number>();
    for (let i = s; i <= e; i++) for (const t of lineTokens[i - 1]) if (wanted.has(t)) tf.set(t, (tf.get(t) ?? 0) + 1);
    let sc = 0;
    for (const [t, n] of tf) sc += idf.get(t)! * ((n * (k1 + 1)) / (n + k1));
    return sc;
  };
  const cands: { start: number; end: number; score: number }[] = [];
  for (const blk of splitBlocks(lines, bodyStart)) {
    const len = blk.end - blk.start + 1;
    const width = Math.min(len, maxLines);
    let best: { start: number; end: number; score: number } | null = null;
    for (let s = blk.start; s + width - 1 <= blk.end; s++) {
      const sc = windowScore(s, s + width - 1);
      if (!best || sc > best.score) best = { start: s, end: s + width - 1, score: sc };
    }
    if (best && best.score > 0) cands.push(best);
  }
  cands.sort((a, b) => (b.score - a.score) || ((a.end - a.start) - (b.end - b.start)) || (a.start - b.start));
  return cands.slice(0, limit).map((c) => ({
    ref: `${rel}:${c.start}-${c.end}`,
    heading_path: headingPath(tree, c.start),
    start: c.start,
    end: c.end,
  }));
}

// 원문 목록(§8.3)과 read·tree(§8.12)
import * as fs from "node:fs";
import * as path from "node:path";
import { BLOCKED_SEGMENTS } from "./contract.ts";
import { locate } from "./frontmatter.ts";
import { inspectInside, isBelow, readFileInside } from "./fs-safety.ts";
import { buildTree, splitLines } from "./tree.ts";
import type { Contract, HeadingNode } from "./types.ts";

const BLOCKED_FILES = new Set(["credentials", "credentials.json", "secrets.json", "secrets.yaml", "secrets.yml"]);
const BLOCKED_EXTS = [".pem", ".key", ".p12", ".pfx", ".keystore"];

function excluded(rel: string, contract: Contract): boolean {
  if (isBelow(rel, contract.wiki_dir)) return true;
  if (contract.excluded_roots.some((e) => isBelow(rel, e))) return true;
  const segs = rel.split("/");
  if (segs.some((s) => BLOCKED_SEGMENTS.has(s.toLowerCase()))) return true;
  return false;
}

function blockedFile(name: string): boolean {
  const n = name.toLowerCase();
  if (n === ".env" || n.startsWith(".env.")) return true;
  if (BLOCKED_FILES.has(n)) return true;
  return BLOCKED_EXTS.some((e) => n.endsWith(e));
}

function suffixOk(name: string, contract: Contract): boolean {
  const n = name.toLowerCase();
  return contract.source_suffixes.some((s) => n.endsWith(s.toLowerCase()));
}

export function listSources(root: string, contract: Contract): string[] {
  const out = new Set<string>();
  const visit = (rel: string): void => {
    const abs = rel === "." ? root : path.join(root, rel);
    const st = fs.lstatSync(abs);
    const name = rel === "." ? "" : rel.split("/").pop()!;
    if (st.isSymbolicLink()) throw new Error(`원문 심볼릭링크 거부: ${rel}`);
    if (st.isDirectory()) {
      for (const ent of fs.readdirSync(abs)) {
        const child = rel === "." ? ent : `${rel}/${ent}`;
        if (excluded(child, contract)) continue;
        visit(child);
      }
      return;
    }
    if (!st.isFile()) throw new Error(`원문 특수 파일 거부: ${rel}`);
    if (blockedFile(name) || !suffixOk(name, contract)) return;
    out.add(rel);
  };
  for (const r of contract.source_roots) {
    if (r !== "." && excluded(r, contract)) continue;
    if (r !== ".") inspectInside(root, r); // 조상 심링크·루트 밖 경로 거부(없으면 아래 lstat 이 드러낸다)
    visit(r);
  }
  return [...out].sort();
}

function requireSource(root: string, contract: Contract, rel: string): void {
  if (!listSources(root, contract).includes(rel)) throw new Error(`원문 범위 밖 경로: ${rel}`);
}

export function readSpan(root: string, contract: Contract, ref: string): { ref: string; text: string } {
  const m = /^(.+):(\d+)-(\d+)$/.exec(ref);
  if (!m) throw new Error(`read 인자 형식 위반(<경로>:<시작>-<끝>): ${ref}`);
  const rel = m[1];
  const start = Number(m[2]);
  const end = Number(m[3]);
  requireSource(root, contract, rel);
  const lines = splitLines(readFileInside(root, rel).text);
  if (start < 1 || end < start || end > lines.length) throw new Error(`read 범위 오류: ${start}-${end} (줄 수 ${lines.length})`);
  return { ref: `${rel}:${start}-${end}`, text: lines.slice(start - 1, end).join("\n") };
}

export function treeOf(root: string, contract: Contract, rel: string): HeadingNode[] {
  requireSource(root, contract, rel);
  const text = readFileInside(root, rel).text;
  return buildTree(splitLines(text), locate(text).bodyStartLine);
}

// 헤딩 트리(§8.12): CommonMark ATX 헤딩 · 펜스 안 '#' 무시 · 서문 노드
import type { HeadingNode } from "./types.ts";

export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

export interface Heading {
  line: number; // 1-based
  level: number;
  title: string;
}

interface Fence {
  ch: string;
  len: number;
}

function openFence(line: string): Fence | null {
  const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!m) return null;
  if (m[1][0] === "`" && m[2].includes("`")) return null;
  return { ch: m[1][0], len: m[1].length };
}

function closesFence(line: string, f: Fence): boolean {
  const m = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  return !!m && m[1][0] === f.ch && m[1].length >= f.len;
}

export function parseHeading(line: string): { level: number; title: string } | null {
  const m = /^ {0,3}(#{1,6})(?=[ \t]|$)(.*)$/.exec(line);
  if (!m) return null;
  let t = m[2].trim();
  if (/^#+$/.test(t)) t = "";
  else t = t.replace(/[ \t]+#+$/, "").trim();
  return { level: m[1].length, title: t };
}

/** 줄 분류: 각 줄(bodyStartLine 부터)이 헤딩인지, 펜스 안인지 */
export interface LineInfo {
  line: number;
  text: string;
  heading: { level: number; title: string } | null;
  fenceRole: "none" | "open" | "inside" | "close";
}

export function classify(lines: string[], bodyStartLine: number): LineInfo[] {
  const out: LineInfo[] = [];
  let fence: Fence | null = null;
  for (let i = bodyStartLine - 1; i < lines.length; i++) {
    const text = lines[i];
    if (fence) {
      const role = closesFence(text, fence) ? "close" : "inside";
      if (role === "close") fence = null;
      out.push({ line: i + 1, text, heading: null, fenceRole: role });
      continue;
    }
    const f = openFence(text);
    if (f) {
      fence = f;
      out.push({ line: i + 1, text, heading: null, fenceRole: "open" });
      continue;
    }
    out.push({ line: i + 1, text, heading: parseHeading(text), fenceRole: "none" });
  }
  return out;
}

export function buildTree(lines: string[], bodyStartLine: number): HeadingNode[] {
  const info = classify(lines, bodyStartLine);
  const total = lines.length;
  const heads = info.filter((l) => l.heading).map((l) => ({ line: l.line, ...l.heading! }));
  const roots: HeadingNode[] = [];
  const firstLine = heads.length > 0 ? heads[0].line : total + 1;
  const preamble = info.filter((l) => l.line < firstLine).some((l) => l.text.trim() !== "");
  if (preamble) roots.push({ level: 0, title: "", start: bodyStartLine, end: firstLine - 1, children: [] });
  const stack: HeadingNode[] = [];
  heads.forEach((h, idx) => {
    let end = total;
    for (let j = idx + 1; j < heads.length; j++) {
      if (heads[j].level <= h.level) {
        end = heads[j].line - 1;
        break;
      }
    }
    const node: HeadingNode = { level: h.level, title: h.title, start: h.line, end, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) stack.pop();
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1].children.push(node);
    stack.push(node);
  });
  return roots;
}

/** line 을 포함하는 헤딩 경로(루트→가장 깊은 헤딩, level 0 제외) */
export function headingPath(tree: HeadingNode[], line: number): string[] {
  const out: string[] = [];
  let level: HeadingNode[] = tree;
  for (;;) {
    const hit = level.find((n) => n.start <= line && line <= n.end);
    if (!hit) break;
    if (hit.level > 0) out.push(hit.title);
    level = hit.children;
  }
  return out;
}

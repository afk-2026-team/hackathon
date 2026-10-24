// frontmatter 분리와 YAML 1.2 core 의 결정론 서브셋 파서·에미터(§8.4)
import type { Json, JsonObject } from "./types.ts";

export type Located =
  | { kind: "none"; bodyStartLine: 1 }
  | { kind: "error"; error: string; bodyStartLine: 1 }
  | { kind: "ok"; raw: string; bodyStartLine: number };

function isFence(line: string): boolean {
  return line.replace(/[ \r]+$/, "") === "---";
}

export function locate(text: string): Located {
  const t = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const lines = t.split("\n");
  if (!isFence(lines[0])) return { kind: "none", bodyStartLine: 1 };
  for (let i = 1; i < lines.length; i++) {
    if (isFence(lines[i])) {
      const raw = lines.slice(1, i).map((l) => l + "\n").join("");
      return { kind: "ok", raw, bodyStartLine: i + 2 };
    }
  }
  return { kind: "error", error: "frontmatter 닫힘 구분선(---) 없음", bodyStartLine: 1 };
}

// ---------------------------------------------------------------- 스칼라 해석

const INT_RE = /^[-+]?[0-9]+$/;
const FLOAT_RE = /^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/;

export function resolvePlain(s: string): Json {
  if (s === "" || s === "~" || s === "null" || s === "Null" || s === "NULL") return null;
  if (s === "true" || s === "True" || s === "TRUE") return true;
  if (s === "false" || s === "False" || s === "FALSE") return false;
  if (INT_RE.test(s)) {
    const n = Number(s);
    return Number.isSafeInteger(n) ? n : s;
  }
  if (FLOAT_RE.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n : s;
  }
  return s;
}

// ---------------------------------------------------------------- 파서

class YamlError extends Error {}

function fail(line: number, reason: string): never {
  throw new YamlError(`${line}행: ${reason}`);
}

const DQ_ESCAPES: Record<string, string> = {
  "0": "\0", a: "\x07", b: "\b", t: "\t", "\t": "\t", n: "\n", v: "\v", f: "\f", r: "\r", e: "\x1b",
  " ": " ", '"': '"', "/": "/", "\\": "\\", N: "\x85", _: "\xa0", L: "\u2028", P: "\u2029",
};

/** 따옴표 스칼라를 s[pos] 부터 읽는다. 같은 줄에서 닫히지 않으면 오류(여러 줄 따옴표 ✗). */
function readQuoted(s: string, pos: number, lineNo: number): { value: string; end: number } {
  const q = s[pos];
  let out = "";
  let i = pos + 1;
  while (i < s.length) {
    const c = s[i];
    if (q === "'") {
      if (c === "'") {
        if (s[i + 1] === "'") {
          out += "'";
          i += 2;
          continue;
        }
        return { value: out, end: i + 1 };
      }
      out += c;
      i++;
      continue;
    }
    if (c === '"') return { value: out, end: i + 1 };
    if (c === "\\") {
      const e = s[i + 1];
      if (e === undefined) fail(lineNo, "여러 줄 따옴표 스칼라는 지원하지 않음");
      if (e in DQ_ESCAPES) {
        out += DQ_ESCAPES[e];
        i += 2;
        continue;
      }
      const width = e === "x" ? 2 : e === "u" ? 4 : e === "U" ? 8 : 0;
      if (width === 0) fail(lineNo, `알 수 없는 이스케이프 \\${e}`);
      const hex = s.slice(i + 2, i + 2 + width);
      if (!new RegExp(`^[0-9A-Fa-f]{${width}}$`).test(hex)) fail(lineNo, `잘못된 이스케이프 \\${e}${hex}`);
      const cp = parseInt(hex, 16);
      if (cp > 0x10ffff) fail(lineNo, `잘못된 코드포인트 \\${e}${hex}`);
      out += width === 4 ? String.fromCharCode(cp) : String.fromCodePoint(cp);
      i += 2 + width;
      continue;
    }
    out += c;
    i++;
  }
  fail(lineNo, "여러 줄 따옴표 스칼라는 지원하지 않음");
}

/** 따옴표 뒤 잔여 내용은 공백 + 선택적 주석만 허용 */
function checkTrailing(rest: string, lineNo: number): void {
  if (rest.trim() === "") return;
  if (/^\s+#/.test(rest)) return;
  fail(lineNo, "따옴표 뒤 잔여 내용");
}

/** plain 텍스트에서 줄 끝 주석(공백 뒤 #)을 뗀다 */
function stripComment(s: string): string {
  const m = /(^|\s)#/.exec(s);
  return (m ? s.slice(0, m.index) : s).replace(/\s+$/, "");
}

function checkScalarStart(s: string, lineNo: number): void {
  const c = s[0];
  if (c === "&" || c === "*" || c === "!") fail(lineNo, "앵커·별칭·태그는 지원하지 않음");
  if (c === "@" || c === "`") fail(lineNo, `예약 문자로 시작하는 값: ${c}`);
  if (c === "%") fail(lineNo, "디렉티브는 지원하지 않음");
  if (c === "," || c === "]" || c === "}") fail(lineNo, `흐름 지시자로 시작하는 plain 값: ${c}`);
  if ((c === "-" || c === "?" || c === ":") && (s.length === 1 || s[1] === " ")) fail(lineNo, `지시자로 시작하는 plain 값: ${c}`);
}

function checkPlainBody(s: string, lineNo: number): void {
  if (/:( |$)/.test(s)) fail(lineNo, "plain 값 안의 ': '");
}

interface Line {
  no: number; // raw 기준 1-based
  text: string;
}

class Parser {
  lines: Line[];
  pos = 0;

  constructor(raw: string) {
    const parts = raw.split("\n");
    if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
    this.lines = parts.map((text, i) => ({ no: i + 1, text: text.replace(/\r$/, "") }));
    for (const l of this.lines) {
      const lead = /^[ \t]*/.exec(l.text)![0];
      if (lead.includes("\t") && l.text.trim() !== "") fail(l.no, "탭 들여쓰기");
      if (l.text === "---" || l.text.startsWith("--- ") || l.text === "..." || l.text.startsWith("... ")) fail(l.no, "멀티문서(--- · ...)는 지원하지 않음");
      if (l.text.startsWith("%")) fail(l.no, "디렉티브는 지원하지 않음");
    }
  }

  static indentOf(text: string): number {
    return /^ */.exec(text)![0].length;
  }

  static isSkippable(text: string): boolean {
    const t = text.trim();
    return t === "" || t.startsWith("#");
  }

  /** 다음 내용 줄(빈 줄·주석 제외)의 인덱스 */
  peekContent(): number {
    let i = this.pos;
    while (i < this.lines.length && Parser.isSkippable(this.lines[i].text)) i++;
    return i;
  }

  parseDocument(): JsonObject {
    const i = this.peekContent();
    if (i >= this.lines.length) return {};
    const l = this.lines[i];
    if (Parser.indentOf(l.text) !== 0) fail(l.no, "최상위는 들여쓰기 0 의 블록 매핑이어야 한다");
    if (/^-( |$)/.test(l.text)) fail(l.no, "최상위는 블록 매핑이어야 한다(시퀀스 ✗)");
    const t = l.text.trim();
    if (t.startsWith("[") || t.startsWith("{") || !this.looksLikeKey(t)) fail(l.no, "최상위는 블록 매핑이어야 한다");
    const v = this.parseMapping(0);
    const j = this.peekContent();
    if (j < this.lines.length) fail(this.lines[j].no, "들여쓰기 오류");
    return v;
  }

  looksLikeKey(t: string): boolean {
    if (t.startsWith("'") || t.startsWith('"')) {
      try {
        const q = readQuoted(t, 0, 0);
        return /^ *:( |$)/.test(t.slice(q.end));
      } catch {
        return false; // 닫히지 않은 따옴표: 키가 아니다(값 파서가 오류를 낸다)
      }
    }
    return /:( |$)/.test(t);
  }

  /** 들여쓰기 indent 의 노드(매핑·시퀀스)를 읽는다 */
  parseBlockNode(indent: number): Json {
    const i = this.peekContent();
    const l = this.lines[i];
    const t = l.text.slice(indent);
    if (/^-( |$)/.test(t)) return this.parseSequence(indent);
    if (t.startsWith("? ") || t === "?") fail(l.no, "복합 키(? )는 지원하지 않음");
    if (this.looksLikeKey(t)) return this.parseMapping(indent);
    // 들여쓴 단독 스칼라(값이 다음 줄에 온 경우)
    this.pos = i + 1;
    return this.parseInlineValue(t, l, indent - 1);
  }

  parseKey(t: string, l: Line): { key: string; rest: string } {
    if (t.startsWith("? ") || t === "?") fail(l.no, "복합 키(? )는 지원하지 않음");
    if (t.startsWith("'") || t.startsWith('"')) {
      const q = readQuoted(t, 0, l.no);
      const after = t.slice(q.end);
      const m = /^ *:( |$)/.exec(after);
      if (!m) fail(l.no, "따옴표 키 뒤에 ':' 없음");
      return { key: q.value, rest: after.slice(m[0].length) };
    }
    const m = /:( |$)/.exec(t);
    if (!m) fail(l.no, "매핑 키가 아님");
    const key = t.slice(0, m.index).replace(/\s+$/, "");
    if (key === "") fail(l.no, "빈 키");
    checkScalarStart(key, l.no);
    if (key.startsWith("[") || key.startsWith("{")) fail(l.no, "흐름 컬렉션 키는 지원하지 않음");
    return { key, rest: t.slice(m.index + m[0].length) };
  }

  parseMapping(indent: number): JsonObject {
    const out: JsonObject = {};
    const seen = new Set<string>();
    for (;;) {
      const i = this.peekContent();
      if (i >= this.lines.length) break;
      const l = this.lines[i];
      const ind = Parser.indentOf(l.text);
      if (ind < indent) break;
      if (ind > indent) fail(l.no, "들여쓰기 오류");
      const t = l.text.slice(indent);
      if (/^-( |$)/.test(t)) break; // 같은 들여쓰기의 시퀀스는 상위가 처리
      const { key, rest } = this.parseKey(t, l);
      if (seen.has(key)) fail(l.no, `중복 키: ${key}`);
      seen.add(key);
      this.pos = i + 1;
      const value = this.parseValueAfterIndicator(rest, l, indent, true);
      Object.defineProperty(out, key, { value, enumerable: true, writable: true, configurable: true });
    }
    return out;
  }

  parseSequence(indent: number): Json[] {
    const out: Json[] = [];
    for (;;) {
      const i = this.peekContent();
      if (i >= this.lines.length) break;
      const l = this.lines[i];
      const ind = Parser.indentOf(l.text);
      if (ind < indent) break;
      if (ind > indent) fail(l.no, "들여쓰기 오류");
      const t = l.text.slice(indent);
      if (!/^-( |$)/.test(t)) break;
      const after = t.slice(1);
      const sp = /^ */.exec(after)![0].length;
      const content = after.slice(sp);
      if (content === "" || content.startsWith("#")) {
        this.pos = i + 1;
        out.push(this.parseChildOrNull(indent, false));
        continue;
      }
      const col = indent + 1 + sp;
      if (/^-( |$)/.test(content) || (!content.startsWith("[") && !content.startsWith("{") && this.looksLikeKey(content) && !content.startsWith("|") && !content.startsWith(">"))) {
        // 콤팩트 매핑(- 키: 값) 또는 시퀀스 안 시퀀스: 내용을 그 열의 가상 줄로 다시 읽는다
        this.lines[i] = { no: l.no, text: " ".repeat(col) + content };
        this.pos = i;
        out.push(this.parseBlockNode(col));
        continue;
      }
      this.pos = i + 1;
      out.push(this.parseInlineValue(content, l, indent));
    }
    return out;
  }

  /** 값 자리가 비었을 때: 더 깊은 들여쓰기 자식(또는 매핑 값이면 같은 들여쓰기 시퀀스), 없으면 null */
  parseChildOrNull(indent: number, allowSameIndentSeq: boolean): Json {
    const i = this.peekContent();
    if (i >= this.lines.length) return null;
    const l = this.lines[i];
    const ind = Parser.indentOf(l.text);
    if (ind > indent) return this.parseBlockNode(ind);
    if (allowSameIndentSeq && ind === indent && /^-( |$)/.test(l.text.slice(indent))) return this.parseSequence(indent);
    return null;
  }

  parseValueAfterIndicator(rest: string, l: Line, indent: number, isMapValue: boolean): Json {
    const content = rest.replace(/^ +/, "");
    if (content === "" || content.startsWith("#")) return this.parseChildOrNull(indent, isMapValue);
    return this.parseInlineValue(content, l, indent);
  }

  /** 줄 안에서 시작하는 값. parentIndent = 이 값을 소유한 키/대시의 들여쓰기 */
  parseInlineValue(content: string, l: Line, parentIndent: number): Json {
    const c = content[0];
    if (c === "|" || c === ">") return this.parseBlockScalar(content, l, parentIndent);
    if (c === "[" || c === "{") return this.parseFlow(content, l);
    if (c === "'" || c === '"') {
      const q = readQuoted(content, 0, l.no);
      checkTrailing(content.slice(q.end), l.no);
      return q.value;
    }
    checkScalarStart(content, l.no);
    const first = stripComment(content);
    checkPlainBody(first, l.no);
    // 다중 줄 plain: 부모보다 깊게 들여쓴 이어지는 줄을 접는다
    const parts = [first];
    let blanks = 0;
    let multi = false;
    let j = this.pos;
    while (j < this.lines.length) {
      const nt = this.lines[j].text;
      if (nt.trim() === "") {
        blanks++;
        j++;
        continue;
      }
      if (Parser.indentOf(nt) <= parentIndent) break;
      const tt = nt.trim();
      if (tt.startsWith("#")) break;
      if (/:( |$)/.test(tt) || /^-( |$)/.test(tt)) fail(this.lines[j].no, "plain 값 안의 ': ' 또는 들여쓰기 오류");
      const piece = stripComment(tt);
      parts.push(blanks > 0 ? "\n".repeat(blanks) : " ");
      parts.push(piece);
      blanks = 0;
      multi = true;
      j++;
      this.pos = j;
      if (piece !== tt) break; // 주석이 plain 을 끝낸다
    }
    if (!multi) return resolvePlain(first);
    return parts.join("");
  }

  parseBlockScalar(content: string, l: Line, parentIndent: number): string {
    const head = stripComment(content);
    const m = /^([|>])([-+1-9]{0,2})$/.exec(head);
    if (!m) fail(l.no, "블록 스칼라 헤더 형식 오류");
    const literal = m[1] === "|";
    let chomp: "clip" | "strip" | "keep" = "clip";
    let explicit = 0;
    for (const ch of m[2]) {
      if (ch === "-" || ch === "+") {
        if (chomp !== "clip") fail(l.no, "블록 스칼라 chomping 중복");
        chomp = ch === "-" ? "strip" : "keep";
      } else {
        if (explicit) fail(l.no, "블록 스칼라 들여쓰기 지시자 중복");
        explicit = Number(ch);
      }
    }
    const base = Math.max(parentIndent, 0);
    let contentIndent = explicit ? base + explicit : 0;
    const body: string[] = [];
    let j = this.pos;
    while (j < this.lines.length) {
      const t = this.lines[j].text;
      if (t.trim() === "") {
        body.push(t);
        j++;
        continue;
      }
      const ind = Parser.indentOf(t);
      if (contentIndent === 0) {
        if (ind <= parentIndent) break;
        contentIndent = ind;
      }
      if (ind < contentIndent) break;
      body.push(t);
      j++;
    }
    this.pos = j;
    // 끝의 빈 줄은 chomping 판단용으로만 남긴다
    let trailing = 0;
    while (body.length > 0 && body[body.length - 1].trim() === "") {
      body.pop();
      trailing++;
    }
    let result = "";
    let empty = 0;
    let didRead = false;
    let moreIndented = false;
    for (const raw of body) {
      if (raw.trim() === "" && raw.length <= contentIndent) {
        empty++;
        continue;
      }
      const line = raw.slice(contentIndent);
      if (literal) {
        result += "\n".repeat(didRead ? 1 + empty : empty);
      } else if (line.startsWith(" ") || line.startsWith("\t")) {
        moreIndented = true;
        result += "\n".repeat(didRead ? 1 + empty : empty);
      } else if (moreIndented) {
        moreIndented = false;
        result += "\n".repeat(empty + 1);
      } else if (empty === 0) {
        if (didRead) result += " ";
      } else {
        result += "\n".repeat(empty);
      }
      result += line;
      didRead = true;
      empty = 0;
    }
    empty += trailing;
    if (chomp === "keep") result += "\n".repeat(didRead ? 1 + empty : empty);
    else if (chomp === "clip" && didRead) result += "\n";
    return result;
  }

  /** 흐름 컬렉션: 괄호가 닫힐 때까지 여러 줄을 모은다 */
  parseFlow(content: string, l: Line): Json {
    let text = content;
    let j = this.pos;
    for (;;) {
      const r = flowBalance(text);
      if (r.closed >= 0) {
        checkTrailing(text.slice(r.closed), l.no);
        text = text.slice(0, r.closed);
        break;
      }
      if (j >= this.lines.length) fail(l.no, "흐름 컬렉션이 닫히지 않음");
      text += " " + stripComment(this.lines[j].text.trim());
      j++;
    }
    this.pos = j;
    const fp = new FlowParser(text, l.no);
    const v = fp.parseNode();
    fp.skipWs();
    if (fp.i !== text.length) fail(l.no, "흐름 컬렉션 뒤 잔여 내용");
    return v;
  }
}

/** 따옴표를 존중하며 첫 괄호의 짝이 닫히는 위치(닫는 괄호 다음 인덱스)를 찾는다. 줄 끝 주석은 잘라낸다. */
function flowBalance(s: string): { closed: number } {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" || c === '"') {
      const q = c;
      i++;
      while (i < s.length) {
        if (q === "'" && s[i] === "'" && s[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (q === '"' && s[i] === "\\") {
          i += 2;
          continue;
        }
        if (s[i] === q) break;
        i++;
      }
      continue;
    }
    if (c === "#" && (i === 0 || /\s/.test(s[i - 1]))) return { closed: -1 };
    if (c === "[" || c === "{") depth++;
    if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) return { closed: i + 1 };
    }
  }
  return { closed: -1 };
}

class FlowParser {
  s: string;
  i = 0;
  lineNo: number;
  constructor(s: string, lineNo: number) {
    this.s = s;
    this.lineNo = lineNo;
  }
  skipWs(): void {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  }
  parseNode(): Json {
    this.skipWs();
    const c = this.s[this.i];
    if (c === "[") return this.parseSeq();
    if (c === "{") return this.parseMap();
    return this.parseScalar();
  }
  parseScalar(): Json {
    this.skipWs();
    const c = this.s[this.i];
    if (c === "'" || c === '"') {
      const q = readQuoted(this.s, this.i, this.lineNo);
      this.i = q.end;
      return q.value;
    }
    const start = this.i;
    while (this.i < this.s.length) {
      const ch = this.s[this.i];
      if (ch === "," || ch === "]" || ch === "}" || ch === "[" || ch === "{") break;
      if (ch === ":" && (this.i + 1 >= this.s.length || /[\s,\]}]/.test(this.s[this.i + 1]))) break;
      this.i++;
    }
    const raw = this.s.slice(start, this.i).trim();
    if (raw !== "") checkScalarStart(raw, this.lineNo);
    return resolvePlain(raw);
  }
  expect(ch: string): void {
    this.skipWs();
    if (this.s[this.i] !== ch) fail(this.lineNo, `흐름 컬렉션에 '${ch}' 필요`);
    this.i++;
  }
  parseSeq(): Json[] {
    this.expect("[");
    const out: Json[] = [];
    for (;;) {
      this.skipWs();
      if (this.s[this.i] === "]") {
        this.i++;
        return out;
      }
      out.push(this.parseNode());
      this.skipWs();
      if (this.s[this.i] === ",") {
        this.i++;
        continue;
      }
      this.expect("]");
      return out;
    }
  }
  parseMap(): JsonObject {
    this.expect("{");
    const out: JsonObject = {};
    const seen = new Set<string>();
    for (;;) {
      this.skipWs();
      if (this.s[this.i] === "}") {
        this.i++;
        return out;
      }
      const k = this.parseScalar();
      const key = k === null ? "" : String(k);
      if (key === "") fail(this.lineNo, "흐름 매핑의 빈 키");
      if (seen.has(key)) fail(this.lineNo, `중복 키: ${key}`);
      seen.add(key);
      this.skipWs();
      let value: Json = null;
      if (this.s[this.i] === ":") {
        this.i++;
        this.skipWs();
        value = this.s[this.i] === "," || this.s[this.i] === "}" ? null : this.parseNode();
      }
      Object.defineProperty(out, key, { value, enumerable: true, writable: true, configurable: true });
      this.skipWs();
      if (this.s[this.i] === ",") {
        this.i++;
        continue;
      }
      this.expect("}");
      return out;
    }
  }
}

export type ParseResult = { ok: true; value: JsonObject } | { ok: false; error: string };

export function parseYaml(raw: string): ParseResult {
  try {
    return { ok: true, value: new Parser(raw).parseDocument() };
  } catch (e) {
    if (e instanceof YamlError) return { ok: false, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------- 에미터

function plainOk(s: string): boolean {
  if (s === "") return false;
  if (/^\s|\s$/.test(s)) return false;
  if (/[\x00-\x1f\x7f-\x9f\u2028\u2029\uFEFF]/.test(s)) return false;
  if ("-?:,[]{}#&*!|>'\"%@`".includes(s[0])) return false;
  if (/:(\s|$)/.test(s)) return false;
  if (/\s#/.test(s)) return false;
  if (/^[-+]?\.?[0-9]/.test(s)) return false;
  if (/^[-+]?\.(inf|nan)$/i.test(s)) return false;
  if (/^(y|n|yes|no|on|off|true|false|null|~)$/i.test(s)) return false;
  if (s === "=" || s === "<<") return false;
  return resolvePlain(s) === s;
}

export function emitString(s: string): string {
  if (plainOk(s)) return s;
  return JSON.stringify(s).replace(/[\u0085\u2028\u2029]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

function emitScalar(v: Json): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`YAML 에밋: 비유한 수 ${v}`);
    return String(v);
  }
  if (typeof v === "string") return emitString(v);
  throw new Error("YAML 에밋: 스칼라가 아님");
}

function isCollection(v: Json): v is Json[] | JsonObject {
  return v !== null && typeof v === "object";
}

function isEmptyCollection(v: Json): boolean {
  if (Array.isArray(v)) return v.length === 0;
  return isCollection(v) && Object.keys(v).length === 0;
}

function inlineOf(v: Json): string {
  if (Array.isArray(v)) return "[]";
  if (isCollection(v)) return "{}";
  return emitScalar(v);
}

function emitMapping(obj: JsonObject, indent: number, out: string[], firstPrefix?: string): void {
  const pad = " ".repeat(indent);
  let first = true;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    const lead = first && firstPrefix !== undefined ? firstPrefix : pad;
    first = false;
    const k = emitString(key);
    if (isCollection(v) && !isEmptyCollection(v)) {
      out.push(`${lead}${k}:`);
      if (Array.isArray(v)) emitSequence(v, indent + 2, out);
      else emitMapping(v, indent + 2, out);
    } else {
      out.push(`${lead}${k}: ${inlineOf(v)}`);
    }
  }
}

function emitSequence(arr: Json[], indent: number, out: string[]): void {
  const pad = " ".repeat(indent);
  for (const v of arr) {
    if (Array.isArray(v) && v.length > 0) {
      out.push(`${pad}-`);
      emitSequence(v, indent + 2, out);
    } else if (isCollection(v) && !Array.isArray(v) && Object.keys(v).length > 0) {
      emitMapping(v, indent + 2, out, `${pad}- `);
    } else {
      out.push(`${pad}- ${inlineOf(v)}`);
    }
  }
}

export function emitYaml(obj: JsonObject): string {
  const out: string[] = [];
  emitMapping(obj, 0, out);
  return out.map((l) => l + "\n").join("");
}

// 파일시스템 안전(§8.16): 안전 상대경로 · 루트 검증 · 원문 읽기 · wiki_dir 범위 트랜잭션
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomBytes } from "node:crypto";

export function sha256(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** 안전 상대경로: 비어 있지 않음 · 절대경로 아님 · 백슬래시/제어문자 없음 · 빈/./.. segment 없음 · 첫 segment 에 ':' 없음 */
export function isSafeRel(s: unknown): s is string {
  if (typeof s !== "string" || s.length === 0) return false;
  if (s.startsWith("/")) return false;
  if (/[\\\x00-\x1f\x7f]/.test(s)) return false;
  const segs = s.split("/");
  for (const seg of segs) {
    if (seg === "" || seg === "." || seg === "..") return false;
  }
  if (segs[0].includes(":")) return false;
  return true;
}

/** rel === scope 이거나 rel 이 scope + "/" 로 시작 */
export function isBelow(rel: string, scope: string): boolean {
  if (scope === ".") return true;
  return rel === scope || rel.startsWith(scope + "/");
}

/** 프로젝트 루트 검증: '..' 금지 · 파일시스템 루트 금지 · 루트와 모든 조상이 실제 디렉터리(심링크 ✗) */
export function resolveRoot(input: string): string {
  if (input.split(/[\\/]/).includes("..")) throw new Error(`루트 경로에 '..' 금지: ${input}`);
  const abs = path.resolve(input);
  if (abs === path.parse(abs).root) throw new Error(`파일시스템 루트는 프로젝트 루트가 될 수 없다: ${abs}`);
  let cur = abs;
  for (;;) {
    const st = fs.lstatSync(cur);
    if (st.isSymbolicLink()) throw new Error(`루트 경로에 심볼릭링크 거부: ${cur}`);
    if (!st.isDirectory()) throw new Error(`루트 경로가 디렉터리가 아님: ${cur}`);
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return abs;
}

export type Kind = "absent" | "file" | "dir";

/** 루트 안 경로를 segment 마다 검사해 종류를 돌려준다. 심링크·특수 파일·파일 아래 경로는 throw. */
export function inspectInside(root: string, rel: string): Kind {
  if (!isSafeRel(rel)) throw new Error(`안전하지 않은 상대경로: ${JSON.stringify(rel)}`);
  const segs = rel.split("/");
  let cur = root;
  for (let i = 0; i < segs.length; i++) {
    cur = path.join(cur, segs[i]);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(cur);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return "absent";
      throw e;
    }
    const sub = segs.slice(0, i + 1).join("/");
    if (st.isSymbolicLink()) throw new Error(`심볼릭링크 거부: ${sub}`);
    const last = i === segs.length - 1;
    if (st.isDirectory()) {
      if (last) break;
      continue;
    }
    if (!st.isFile()) throw new Error(`특수 파일 거부: ${sub}`);
    if (!last) throw new Error(`파일 아래 경로 거부: ${rel}`);
    break;
  }
  const real = fs.realpathSync(cur);
  if (real !== root && !real.startsWith(root + path.sep)) throw new Error(`루트 밖 경로 거부: ${rel}`);
  return fs.lstatSync(cur).isDirectory() ? "dir" : "file";
}

/** 예외 없이 '일반 파일로 존재'만 판정한다(upstream 판정용). */
export function isRegularFileInside(root: string, rel: string): boolean {
  if (!isSafeRel(rel)) return false;
  try {
    return inspectInside(root, rel) === "file";
  } catch {
    return false;
  }
}

export interface SourceRead {
  bytes: Buffer;
  text: string;
  sha: string;
  lossy: boolean;
}

/** 원문 읽기: 일반 파일만(열린 fd 확인) · 해시는 원 바이트 · 비UTF-8 이면 손실 디코딩 + 표시 */
export function readFileInside(root: string, rel: string): SourceRead {
  const kind = inspectInside(root, rel);
  if (kind !== "file") throw new Error(`일반 파일이 아님: ${rel}`);
  const fd = fs.openSync(path.join(root, rel), fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    if (!fs.fstatSync(fd).isFile()) throw new Error(`일반 파일이 아님: ${rel}`);
    const bytes = fs.readFileSync(fd);
    let text: string;
    let lossy = false;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder("utf-8").decode(bytes);
      lossy = true;
    }
    return { bytes, text, sha: sha256(bytes), lossy };
  } finally {
    fs.closeSync(fd);
  }
}

export function readIfExists(root: string, rel: string): Buffer | null {
  return inspectInside(root, rel) === "file" ? readFileInside(root, rel).bytes : null;
}

// ---------------------------------------------------------------- 트랜잭션

export interface WriteOp {
  path: string; // 루트 상대
  data: Buffer | null; // null = 삭제
}

export interface TxnPlan {
  root: string;
  ops: WriteOp[];
  pre: (string | null)[]; // 사전 상태 sha256 (없으면 null)
}

/**
 * 쓰기 계획: 중복 경로 · 범위 밖 · 파일/조상 충돌 · 없는 삭제 대상을 거부하고 사전 상태를 봉인한다.
 * 범위 = scope(wiki_dir) · 단일 협조 writer 전제. OS 크래시 원자성은 보장하지 않는다.
 */
export function planTxn(root: string, scope: string, ops: WriteOp[]): TxnPlan {
  const seen = new Set<string>();
  for (const op of ops) {
    if (!isSafeRel(op.path)) throw new Error(`트랜잭션: 안전하지 않은 경로 ${JSON.stringify(op.path)}`);
    if (op.path === scope || !isBelow(op.path, scope)) throw new Error(`트랜잭션: 범위 밖 경로 ${op.path}`);
    if (seen.has(op.path)) throw new Error(`트랜잭션: 중복 경로 ${op.path}`);
    seen.add(op.path);
  }
  for (const a of seen) {
    for (const b of seen) {
      if (a !== b && b.startsWith(a + "/")) throw new Error(`트랜잭션: 파일/조상 충돌 ${a} · ${b}`);
    }
  }
  const pre: (string | null)[] = [];
  for (const op of ops) {
    const kind = inspectInside(root, op.path);
    if (kind === "dir") throw new Error(`트랜잭션: 대상이 디렉터리 ${op.path}`);
    if (kind === "absent" && op.data === null) throw new Error(`트랜잭션: 없는 삭제 대상 ${op.path}`);
    pre.push(kind === "file" ? sha256(readFileInside(root, op.path).bytes) : null);
  }
  return { root, ops, pre };
}

function fsyncDir(dir: string): void {
  const fd = fs.openSync(dir, "r");
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function atomicWrite(abs: string, data: Buffer): void {
  const dir = path.dirname(abs);
  const tmp = path.join(dir, ".wiki-desk-txn-" + randomBytes(8).toString("hex"));
  const fd = fs.openSync(tmp, "wx", 0o644);
  try {
    fs.writeSync(fd, data);
    fs.fchmodSync(fd, 0o644);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tmp, abs);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  fsyncDir(dir);
}

export interface ApplyOptions {
  /** 테스트용 결함 주입: i 번째 op 직전에 호출된다 */
  beforeOp?: (i: number) => void;
}

/** 사전 상태 재확인 → 파일마다 임시파일·fsync·rename·상위 fsync 원자 교체 → 실패 시 전부 되돌림 */
export function applyTxn(plan: TxnPlan, opts: ApplyOptions = {}): void {
  const { root, ops, pre } = plan;
  ops.forEach((op, i) => {
    const kind = inspectInside(root, op.path);
    const now = kind === "file" ? sha256(readFileInside(root, op.path).bytes) : null;
    if (kind === "dir" || now !== pre[i]) throw new Error(`트랜잭션: 사전 상태가 바뀜 ${op.path}`);
  });
  const undo: (() => void)[] = [];
  try {
    ops.forEach((op, i) => {
      opts.beforeOp?.(i);
      const abs = path.join(root, op.path);
      const before = pre[i] === null ? null : fs.readFileSync(abs);
      if (op.data === null) {
        fs.unlinkSync(abs);
        fsyncDir(path.dirname(abs));
        undo.push(() => atomicWrite(abs, before as Buffer));
        return;
      }
      const segs = op.path.split("/");
      let cur = root;
      for (const seg of segs.slice(0, -1)) {
        cur = path.join(cur, seg);
        if (!fs.existsSync(cur)) {
          fs.mkdirSync(cur, { mode: 0o755 });
          fs.chmodSync(cur, 0o755);
          const made = cur;
          undo.push(() => fs.rmdirSync(made));
        }
      }
      atomicWrite(abs, op.data);
      undo.push(() => (before === null ? fs.unlinkSync(abs) : atomicWrite(abs, before)));
    });
  } catch (e) {
    const rollbackErrors: string[] = [];
    for (const u of undo.reverse()) {
      try {
        u();
      } catch (re) {
        rollbackErrors.push((re as Error).message);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new Error(`${(e as Error).message} (되돌림 실패: ${rollbackErrors.join(" · ")})`);
    }
    throw e;
  }
}

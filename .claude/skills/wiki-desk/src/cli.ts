// wiki-desk 3.2.0 CLI(§8.17): 성공 → stdout JSON · check 문제 → JSON + exit 1 · 오류 → stdout 비움 + stderr + exit 1
import { cmdCheck, cmdInit, cmdName, cmdQuery, cmdRead, cmdRemove, cmdStatus, cmdSync, cmdTree } from "./commands.ts";
import { resolveRoot } from "./fs-safety.ts";

interface Args {
  positional: string[];
  flags: Map<string, string[]>;
  bools: Set<string>;
}

const VALUE_FLAGS = new Set(["--root", "--contract", "--terms", "--limit", "--accept-removed", "--relocate", "--type", "--topic", "--at"]);
const BOOL_FLAGS = new Set(["--apply"]);

function parseArgs(argv: string[]): Args {
  const a: Args = { positional: [], flags: new Map(), bools: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (BOOL_FLAGS.has(s)) {
      a.bools.add(s);
    } else if (VALUE_FLAGS.has(s)) {
      if (i + 1 >= argv.length) throw new Error(`${s} 에 값이 필요하다`);
      const list = a.flags.get(s) ?? [];
      list.push(argv[++i]);
      a.flags.set(s, list);
    } else if (s.startsWith("--")) {
      throw new Error(`알 수 없는 옵션: ${s}`);
    } else {
      a.positional.push(s);
    }
  }
  return a;
}

type Handler = (a: Args, root: string, now: string) => { result: unknown; exit: number };

const ALLOWED: Record<string, string[]> = {
  init: ["--root", "--contract", "--apply"],
  sync: ["--root", "--apply", "--accept-removed", "--relocate"],
  query: ["--root", "--terms", "--limit"],
  read: ["--root"],
  tree: ["--root"],
  check: ["--root"],
  status: ["--root"],
  remove: ["--root", "--apply"],
  name: ["--root", "--type", "--topic", "--at"],
};

function one(a: Args, flag: string, required: true): string;
function one(a: Args, flag: string, required: false): string | undefined;
function one(a: Args, flag: string, required: boolean): string | undefined {
  const v = a.flags.get(flag);
  if (!v || v.length === 0) {
    if (required) throw new Error(`필수 인자 누락: ${flag}`);
    return undefined;
  }
  if (v.length > 1) throw new Error(`${flag} 는 한 번만 줄 수 있다`);
  return v[0];
}

function onePositional(a: Args, what: string): string {
  if (a.positional.length !== 1) throw new Error(`필수 인자 누락: ${what}`);
  return a.positional[0];
}

function noPositional(a: Args): void {
  if (a.positional.length > 0) throw new Error(`알 수 없는 인자: ${a.positional.join(" ")}`);
}

const ok = (result: unknown) => ({ result, exit: 0 });

const COMMANDS: Record<string, Handler> = {
  init: (a, root, now) => {
    noPositional(a);
    return ok(cmdInit(root, one(a, "--contract", true), a.bools.has("--apply"), now));
  },
  sync: (a, root, now) => {
    noPositional(a);
    const relocate = (a.flags.get("--relocate") ?? []).map((r): [string, string] => {
      const m = /^([^=]+)=([^=]+)$/.exec(r);
      if (!m) throw new Error(`--relocate 형식 위반(OLD=NEW): ${r}`);
      return [m[1], m[2]];
    });
    return ok(cmdSync(root, { apply: a.bools.has("--apply"), acceptRemoved: a.flags.get("--accept-removed") ?? [], relocate }, now));
  },
  query: (a, root) => {
    noPositional(a);
    const terms = a.flags.get("--terms") ?? [];
    if (terms.length === 0) throw new Error("필수 인자 누락: --terms");
    const lim = one(a, "--limit", false);
    if (lim !== undefined && (!/^[0-9]+$/.test(lim) || !Number.isSafeInteger(Number(lim)) || Number(lim) <= 0)) {
      throw new Error(`--limit 은 양의 정수여야 한다: ${lim}`);
    }
    return ok(cmdQuery(root, terms, lim === undefined ? undefined : Number(lim)));
  },
  read: (a, root) => ok(cmdRead(root, onePositional(a, "<경로:시작-끝>"))),
  tree: (a, root) => ok(cmdTree(root, onePositional(a, "<경로>"))),
  check: (a, root) => {
    noPositional(a);
    const r = cmdCheck(root);
    return { result: r, exit: r.ok ? 0 : 1 };
  },
  status: (a, root) => {
    noPositional(a);
    return ok(cmdStatus(root));
  },
  remove: (a, root) => {
    noPositional(a);
    return ok(cmdRemove(root, a.bools.has("--apply")));
  },
  name: (a, root, now) => {
    noPositional(a);
    return ok(cmdName(root, one(a, "--type", true), one(a, "--topic", true), one(a, "--at", false), now));
  },
};

function main(argv: string[]): number {
  const now = new Date().toISOString();
  let out: { result: unknown; exit: number };
  try {
    const [cmd, ...rest] = argv;
    if (cmd === undefined || !Object.hasOwn(COMMANDS, cmd)) throw new Error(`알 수 없는 명령: ${cmd ?? "(없음)"}`);
    const a = parseArgs(rest);
    for (const f of [...a.flags.keys(), ...a.bools]) {
      if (!ALLOWED[cmd].includes(f)) throw new Error(`${cmd} 에서 쓸 수 없는 옵션: ${f}`);
    }
    const root = resolveRoot(one(a, "--root", false) ?? process.cwd());
    out = COMMANDS[cmd](a, root, now);
  } catch (e) {
    process.stderr.write(`wiki-desk: ${(e as Error).message}\n`);
    return 1;
  }
  process.stdout.write(JSON.stringify(out.result, null, 2) + "\n");
  return out.exit;
}

process.exitCode = main(process.argv.slice(2));

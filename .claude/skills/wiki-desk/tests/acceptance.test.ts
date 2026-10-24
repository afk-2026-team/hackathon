// 인수테스트 AT-01 ~ AT-40 (spec.md §10)
import { after, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, "..");
const REPO = path.resolve(HERE, "../../../..");
const CLI = path.join(SKILL, "src/cli.ts");

const PLAN = "docs/plan/plan_26102411_검색_기능.md";
const INTERVIEW = "docs/interview/interview_26102410_검색_기능.md";
const BAD = "docs/devlog/bad-name.md";
const W = "__llm-wiki";
const cardOf = (src: string) => `${W}/cards/${src}.card.md`;

const FIXTURE: Record<string, string> = {
  [INTERVIEW]:
    '---\ntitle: 검색 기능 의도\nstatus: approved\napproved_quote: "이대로 진행해"\napproved_at: "2026-10-24T10:05:00+09:00"\n---\n\n# 검색 기능 의도\n\n## 문제\n임베딩을 쓰지 않는 결정론 검색이 필요하다.\n',
  [PLAN]:
    "---\ntitle: 검색 기능 계획\nupstream: docs/interview/interview_26102410_검색_기능.md\ntags: [search, bm25]\n---\n\n# 검색 기능 계획\n\n## 단계\n1. agent_config.yaml 을 읽는다.\n2. BM25 점수를 계산한다.\n",
  [BAD]: "# 이름 규칙 위반\n본문\n",
};

function contractJson(overrides: (c: any) => void = () => {}): string {
  const c = JSON.parse(fs.readFileSync(path.join(SKILL, "assets/project-contract.json"), "utf8"));
  c.project_name = "fixture";
  c.naming.utc_offset = "+09:00";
  overrides(c);
  return JSON.stringify(c, null, 2) + "\n";
}

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
  json: any;
}

function cli(root: string, ...args: string[]): Run {
  const r = spawnSync(process.execPath, [CLI, ...args, "--root", root], { encoding: "utf8" });
  let json: any = undefined;
  try {
    json = r.stdout ? JSON.parse(r.stdout) : undefined;
  } catch {
    json = undefined;
  }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

function ok(r: Run): any {
  assert.equal(r.code, 0, `exit ${r.code}: ${r.stderr}`);
  return r.json;
}

/** 임시 프로젝트: fixture + 계약(c.json, 원문 범위 밖) */
const made: string[] = [];
after(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function project(stage: "none" | "init" | "sync" = "none"): string {
  const root = fs.mkdtempSync(os.tmpdir() + "/wd-at-");
  made.push(root);
  for (const [rel, text] of Object.entries(FIXTURE)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  fs.mkdirSync(path.join(root, "docs/checklist"), { recursive: true });
  fs.writeFileSync(path.join(root, "c.json"), contractJson());
  if (stage !== "none") ok(cli(root, "init", "--contract", path.join(root, "c.json"), "--apply"));
  if (stage === "sync") ok(cli(root, "sync", "--apply"));
  return root;
}

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const readText = (root: string, rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(dir)) return out;
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = sha(fs.readFileSync(p));
    }
  };
  walk(dir);
  return out;
}

const todayUtc = () => new Date().toISOString().slice(0, 10);
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);

// ---------------------------------------------------------------- 구조 검사형 (저장소 루트)

test("AT-01 런타임: Node major ≥ 24", () => {
  assert.ok(Number(process.versions.node.split(".")[0]) >= 24);
});

test("AT-02 트리: §2 ✱ 파일·cli.ts·doc_naming.ts·SKILL.md·package.json·references 4종 존재", () => {
  const files = [
    "CLAUDE.md", ".gitignore", ".claude/rules/workflow.md", ".claude/rules/docs.md",
    ".claude/skills/wiki-desk/SKILL.md", ".claude/skills/wiki-desk/package.json",
    ".claude/skills/wiki-desk/src/cli.ts", ".claude/skills/wiki-desk/src/doc_naming.ts",
    ...["okf", "authority", "installation", "maintenance"].map((r) => `.claude/skills/wiki-desk/references/${r}.md`),
    ...["interview", "plan", "devlog", "checklist"].map((t) => `docs/${t}/example.md`),
    "__llm-wiki/contract.json", "__llm-wiki/receipt.json",
  ];
  for (const f of files) assert.ok(fs.statSync(path.join(REPO, f)).isFile(), f);
});

test("AT-03 example.md: 역할·파일명 규칙·명명 표기", () => {
  for (const t of ["interview", "plan", "devlog", "checklist"]) {
    const s = readText(REPO, `docs/${t}/example.md`);
    assert.ok(s.includes("## 역할"), t);
    assert.ok(s.includes("## 파일명 규칙"), t);
    assert.ok(s.includes(`docs/${t}/${t}_<YYMMDDHH>`), t);
  }
});

test("AT-04 example frontmatter 필수 키", () => {
  const iv = readText(REPO, "docs/interview/example.md");
  for (const k of ["status:", "approved_quote:", "approved_at:"]) assert.ok(iv.includes(k), k);
  for (const t of ["plan", "devlog", "checklist"]) assert.ok(readText(REPO, `docs/${t}/example.md`).includes("upstream:"), t);
  assert.ok(readText(REPO, "docs/checklist/example.md").includes("verdict:"));
});

test("AT-05 workflow.md: HITL·연속 FAIL 상한·4종 안티패턴", () => {
  const s = readText(REPO, ".claude/rules/workflow.md");
  assert.ok(s.includes("HITL 은 S0 끝 한 곳뿐이다"));
  assert.ok(s.includes("연속 FAIL 상한 = 3"));
  for (const p of ["모킹", "폴백", "하드코딩", "매직넘버"]) assert.match(s, new RegExp(`^\\| ${p} \\|`, "m"), p);
});

test("AT-06 docs.md: 명명 SSOT·폴더 확장 규약·upstream 사유", () => {
  const s = readText(REPO, ".claude/rules/docs.md");
  for (const k of ["## 1. 명명 SSOT", "## 5. 폴더 확장 규약", "upstream.missing", "upstream.not_found"]) assert.ok(s.includes(k), k);
});

test("AT-07 CLAUDE.md: 필수 절과 규칙 참조", () => {
  const s = readText(REPO, "CLAUDE.md");
  for (const k of ["## 목표", "## 불변식", "## 안전 경계", "## 명령", "## 참조", ".claude/rules/workflow.md", ".claude/rules/docs.md"]) {
    assert.ok(s.includes(k), k);
  }
});

test("AT-08 git 추적 규칙: check-ignore", () => {
  const ignored = (p: string) => spawnSync("git", ["check-ignore", "-q", p], { cwd: REPO }).status;
  for (const p of ["docs/plan/plan_26102411_x.md", "__llm-wiki/index.md", "__llm-wiki/cards/a.card.md"]) assert.equal(ignored(p), 0, p);
  for (const p of ["docs/plan/example.md", "__llm-wiki/contract.json", "__llm-wiki/receipt.json"]) assert.equal(ignored(p), 1, p);
});

// ---------------------------------------------------------------- 실행형 (임시 프로젝트)

test("AT-09 init dry-run: applied:false, wiki 디렉터리 없음", () => {
  const root = project();
  const j = ok(cli(root, "init", "--contract", path.join(root, "c.json")));
  assert.equal(j.applied, false);
  assert.equal(fs.existsSync(path.join(root, W)), false);
});

test("AT-10 init apply: writes 순서·.gitignore·contract 바이트", () => {
  const root = project();
  const j = ok(cli(root, "init", "--contract", path.join(root, "c.json"), "--apply"));
  assert.deepEqual(j.writes, [`${W}/contract.json`, `${W}/.gitignore`, `${W}/index.md`, `${W}/log.md`, `${W}/receipt.json`]);
  assert.equal(readText(root, `${W}/.gitignore`), ".cache/\n");
  assert.deepEqual(fs.readFileSync(path.join(root, `${W}/contract.json`)), fs.readFileSync(path.join(root, "c.json")));
});

test("AT-11 init 재실행: exit≠0, stdout 비움", () => {
  const root = project("init");
  const r = cli(root, "init", "--contract", path.join(root, "c.json"), "--apply");
  assert.notEqual(r.code, 0);
  assert.equal(r.stdout, "");
});

test("AT-12 계약 거부: schema_version 2 · yymmddhh group 제거 · cache_dir 포함 관계", () => {
  const variants: ((c: any) => void)[] = [
    (c) => (c.schema_version = 2),
    (c) => (c.filename_pattern = c.filename_pattern.replace("(?<yymmddhh>\\d{8})", "\\d{8}")),
    (c) => (c.layout.cache_dir = "cards/x"),
  ];
  for (const v of variants) {
    const root = project();
    fs.writeFileSync(path.join(root, "bad.json"), contractJson(v));
    const r = cli(root, "init", "--contract", path.join(root, "bad.json"), "--apply");
    assert.notEqual(r.code, 0, r.stdout);
    assert.equal(r.stdout, "");
    assert.equal(fs.existsSync(path.join(root, W)), false);
  }
});

test("AT-13 sync dry-run: created 3건, 카드 0", () => {
  const root = project("init");
  const j = ok(cli(root, "sync"));
  assert.equal(j.applied, false);
  assert.equal(j.created.length, 3);
  assert.equal(fs.existsSync(path.join(root, `${W}/cards`)), false);
});

test("AT-14 sync apply: created 경로 오름차순·카드 3개·원문 불변", () => {
  const root = project("init");
  const before = snapshot(path.join(root, "docs"));
  const j = ok(cli(root, "sync", "--apply"));
  assert.deepEqual(j.created, [BAD, INTERVIEW, PLAN]);
  for (const s of [BAD, INTERVIEW, PLAN]) assert.ok(fs.existsSync(path.join(root, cardOf(s))), s);
  assert.deepEqual(snapshot(path.join(root, "docs")), before);
});

test("AT-15 고정점: 재 sync 는 writes [] · unchanged 3 · 카드 바이트 불변", () => {
  const root = project("sync");
  const before = snapshot(path.join(root, W));
  const j = ok(cli(root, "sync", "--apply"));
  assert.deepEqual(j.writes, []);
  assert.equal(j.unchanged, 3);
  assert.deepEqual(snapshot(path.join(root, W)), before);
});

const GOLDEN_CARD = `---
type: plan
title: 검색 기능 계획
description: null
resource: docs/plan/plan_26102411_검색_기능.md
tags:
  - plan
  - search
  - bm25
generated:
  by: process:wiki-desk-ts
  at: "2026-10-24T00:30:04.893Z"
authority:
  document_type: plan
  authority_rank: 55
  role: plan
source_meta: {}
source_meta_unknown:
  upstream: docs/interview/interview_26102410_검색_기능.md
  tags:
    - search
    - bm25
needs_review: false
review_reasons: []
source_sha256: "5893c42ecda78b14564500b389ca0a5888b7a2f0801117cca6a7bf46a8a4e13e"
---

# 검색 기능 계획

- 원문: \`docs/plan/plan_26102411_검색_기능.md\`
`;

test("AT-16 골든 카드: generated.at 줄 외 바이트 동일", () => {
  const root = project("sync");
  const strip = (s: string) => s.replace(/^  at: .*$/m, "  at: <AT>");
  const card = readText(root, cardOf(PLAN));
  assert.match(card, /^  at: "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"$/m);
  assert.equal(strip(card), strip(GOLDEN_CARD));
});

test("AT-17 골든 index.md / log.md", () => {
  const root = project("sync");
  assert.equal(
    readText(root, `${W}/index.md`),
    '---\nokf_version: "0.2"\n---\n\n# devlog\n\n* [docs/devlog/bad-name.md](cards/docs/devlog/bad-name.md.card.md)\n\n# interview\n\n* [검색 기능 의도](cards/docs/interview/interview_26102410_검색_기능.md.card.md)\n\n# plan\n\n* [검색 기능 계획](cards/docs/plan/plan_26102411_검색_기능.md.card.md)\n',
  );
  assert.equal(readText(root, `${W}/log.md`), `# 위키 변경 이력\n\n## ${todayUtc()}\n- init: 위키 생성\n- sync: 생성 3 · 갱신 0 · 보존이동 0\n`);
});

test("AT-18 receipt: 키 오름차순·들여쓰기 1칸·값 = sha256", () => {
  const root = project("sync");
  const text = readText(root, `${W}/receipt.json`);
  const files = JSON.parse(text).files;
  const keys = Object.keys(files);
  assert.deepEqual(keys, [...keys].sort());
  assert.equal(text, JSON.stringify({ files }, null, 1) + "\n");
  for (const k of keys) assert.equal(files[k], sha(fs.readFileSync(path.join(root, k))), k);
});

test("AT-19 needs_review: bad-name 사유", () => {
  const root = project("sync");
  const card = readText(root, cardOf(BAD));
  assert.ok(card.includes('review_reasons:\n  - "파일명 규칙 위반: docs/devlog/bad-name.md"\n  - "upstream.missing: upstream 키 없음"\n'), card);
  assert.ok(card.includes("needs_review: true\n"));
});

test("AT-20 upstream 정상: plan 카드 needs_review false", () => {
  const root = project("sync");
  assert.ok(readText(root, cardOf(PLAN)).includes("needs_review: false\nreview_reasons: []\n"));
});

test("AT-21 upstream 미실재: not_found 사유 · updated 에 plan", () => {
  const root = project("sync");
  const missing = "docs/interview/interview_26102409_없음.md";
  fs.writeFileSync(path.join(root, PLAN), FIXTURE[PLAN].replace(INTERVIEW, missing));
  const j = ok(cli(root, "sync", "--apply"));
  assert.ok(j.updated.includes(PLAN));
  assert.ok(readText(root, cardOf(PLAN)).includes(`review_reasons:\n  - "upstream.not_found: ${missing}"\nsource_sha256:`));
});

test("AT-22 frontmatter 닫힘 누락: 명령 성공 + 사유", () => {
  const root = project("sync");
  const rel = "docs/plan/plan_26102412_닫힘누락.md";
  fs.writeFileSync(path.join(root, rel), "---\ntitle: 닫힘 누락\n\n# 본문\n");
  ok(cli(root, "sync", "--apply"));
  assert.ok(readText(root, cardOf(rel)).includes("frontmatter 파싱 불가: frontmatter 닫힘 구분선(---) 없음"));
});

const Q = ["query", "--terms", "임베딩", "--terms", "agent_config.yaml"];

test("AT-23 query: 토큰·점수·span", () => {
  const root = project("sync");
  const j = ok(cli(root, ...Q));
  assert.deepEqual(j.query_tokens, ["임베", "베딩", "agent", "config", "yaml", "agent_config.yaml"]);
  assert.equal(j.results[0].path, PLAN);
  close(j.results[0].score, 3.8070933684917714);
  assert.equal(j.results[1].path, INTERVIEW);
  close(j.results[1].score, 2.094967772576156);
  assert.equal(j.results[0].spans[0].ref, `${PLAN}:9-11`);
  assert.deepEqual(j.results[0].spans[0].heading_path, ["검색 기능 계획", "단계"]);
  assert.equal(j.results[1].spans[0].ref, `${INTERVIEW}:10-11`);
});

test("AT-24 query 출력 키 순서", () => {
  const root = project("sync");
  assert.deepEqual(Object.keys(ok(cli(root, ...Q))), [
    "terms", "query_tokens", "unmatched_tokens", "results", "stale", "missing_cards", "invalid_cards",
    "corpus", "index_rebuilt", "index_cache_reset", "elapsed_ms",
  ]);
});

test("AT-25 query 거부: 1글자 질의", () => {
  const root = project("sync");
  const r = cli(root, "query", "--terms", "a");
  assert.notEqual(r.code, 0);
  assert.equal(r.stdout, "");
});

test("AT-26 query 결정론: 2회 동일 · 2회차 index_rebuilt 0", () => {
  const root = project("sync");
  const a = ok(cli(root, ...Q));
  const b = ok(cli(root, ...Q));
  assert.equal(b.index_rebuilt, 0);
  for (const o of [a, b]) {
    delete o.elapsed_ms;
    delete o.index_rebuilt;
  }
  assert.deepEqual(a, b);
});

test("AT-27 캐시: index.json 존재 · v:1 · 카드 불변", () => {
  const root = project("sync");
  const cards = snapshot(path.join(root, `${W}/cards`));
  ok(cli(root, ...Q));
  const cache = readText(root, `${W}/.cache/index.json`);
  assert.ok(cache.startsWith('{"v":1,'));
  assert.deepEqual(snapshot(path.join(root, `${W}/cards`)), cards);
});

test("AT-28 read: 근거 구간 원문 · 범위 밖 경로 거부", () => {
  const root = project("sync");
  const j = ok(cli(root, "read", `${PLAN}:9-11`));
  assert.equal(j.text, "## 단계\n1. agent_config.yaml 을 읽는다.\n2. BM25 점수를 계산한다.");
  const r = cli(root, "read", "contract.json:1-1");
  assert.notEqual(r.code, 0);
  assert.equal(r.stdout, "");
});

test("AT-29 tree: plan 헤딩 트리", () => {
  const root = project("sync");
  assert.deepEqual(ok(cli(root, "tree", PLAN)), [
    { level: 1, title: "검색 기능 계획", start: 7, end: 12, children: [{ level: 2, title: "단계", start: 9, end: 12, children: [] }] },
  ]);
});

test("AT-30 check 정상: ok · counts", () => {
  const root = project("sync");
  const j = ok(cli(root, "check"));
  assert.equal(j.ok, true);
  assert.deepEqual(j.counts, { sources: 3, cards: 3, archived: 0, needs_review: 1 });
});

test("AT-31 check 문제: stale·missing → exit 1", () => {
  const root = project("sync");
  fs.appendFileSync(path.join(root, PLAN), "3. 추가 단계\n");
  fs.writeFileSync(path.join(root, "docs/checklist/checklist_26102413_새문서.md"), "---\ntitle: 새 문서\n---\n");
  const r = cli(root, "check");
  assert.equal(r.code, 1);
  const codes = r.json.issues.map((i: any) => i.code);
  assert.ok(codes.includes("card.stale"));
  assert.ok(codes.includes("card.missing"));
});

test("AT-32 고아 차단: 원문 삭제 후 sync --apply 거부 · 위키 불변", () => {
  const root = project("sync");
  fs.rmSync(path.join(root, BAD));
  const before = snapshot(path.join(root, W));
  const r = cli(root, "sync", "--apply");
  assert.notEqual(r.code, 0);
  assert.equal(r.stdout, "");
  assert.deepEqual(snapshot(path.join(root, W)), before);
});

test("AT-33 고아 수용: --accept-removed 로 archive 이동 + log", () => {
  const root = project("sync");
  const cardBytes = fs.readFileSync(path.join(root, cardOf(BAD)));
  fs.rmSync(path.join(root, BAD));
  ok(cli(root, "sync", "--apply", "--accept-removed", BAD));
  assert.equal(fs.existsSync(path.join(root, cardOf(BAD))), false);
  assert.deepEqual(fs.readFileSync(path.join(root, `${W}/archive/${BAD}.card.md`)), cardBytes);
  assert.ok(readText(root, `${W}/log.md`).includes(`- 보존이동: ${BAD} (원문 삭제 수용)\n`));
});

test("AT-34 사람 수정 보호: 본문 수정 카드는 protected · 바이트 유지", () => {
  const root = project("sync");
  fs.appendFileSync(path.join(root, cardOf(PLAN)), "사람이 덧붙인 줄\n");
  const edited = fs.readFileSync(path.join(root, cardOf(PLAN)));
  fs.appendFileSync(path.join(root, PLAN), "3. 추가 단계\n");
  const j = ok(cli(root, "sync", "--apply"));
  assert.ok(j.protected.includes(cardOf(PLAN)));
  assert.deepEqual(fs.readFileSync(path.join(root, cardOf(PLAN))), edited);
});

test("AT-35 remove: dry-run 쓰기 0 · 적용 후 contract·receipt·사람 수정 파일만", () => {
  const root = project("sync");
  ok(cli(root, ...Q));
  fs.appendFileSync(path.join(root, cardOf(PLAN)), "사람 메모\n");
  const docs = snapshot(path.join(root, "docs"));
  const before = snapshot(path.join(root, W));
  const dry = ok(cli(root, "remove"));
  assert.equal(dry.applied, false);
  assert.deepEqual(snapshot(path.join(root, W)), before);
  const j = ok(cli(root, "remove", "--apply"));
  assert.deepEqual(j.preserved, [cardOf(PLAN)]);
  assert.deepEqual(Object.keys(snapshot(path.join(root, W))).sort(), ["cards/docs/plan/plan_26102411_검색_기능.md.card.md", "contract.json", "receipt.json"]);
  assert.equal(fs.existsSync(path.join(root, `${W}/.cache`)), false);
  assert.deepEqual(snapshot(path.join(root, "docs")), docs);
});

test("AT-36 status: 키", () => {
  const root = project("sync");
  assert.deepEqual(Object.keys(ok(cli(root, "status"))), ["wiki_dir", "project_name", "sources", "cards", "archived", "index_cache"]);
});

test("AT-37 name 기본: 쓰기 0", () => {
  const root = project("init");
  const before = snapshot(root);
  const j = ok(cli(root, "name", "--type", "plan", "--topic", "하네스_루프_구조개선", "--at", "2026-07-25T06:58:00Z"));
  assert.equal(j.basename, "plan_26072515_하네스_루프_구조개선.md");
  assert.equal(j.suffixed, false);
  assert.deepEqual(snapshot(root), before);
});

test("AT-38 name 충돌: _MM_SS 형태 → 소진 시 거부", () => {
  const root = project("init");
  fs.writeFileSync(path.join(root, "docs/checklist/checklist_26072515_구조개선.md"), "x\n");
  const args = ["name", "--type", "checklist", "--topic", "다른주제", "--at", "2026-07-25T06:58:29Z"];
  const j = ok(cli(root, ...args));
  assert.equal(j.basename, "checklist_26072515_58_29_다른주제.md");
  assert.equal(j.suffixed, true);
  fs.writeFileSync(path.join(root, "docs/checklist/checklist_26072515_58_29_다른주제.md"), "x\n");
  const r = cli(root, ...args);
  assert.notEqual(r.code, 0);
  assert.equal(r.stdout, "");
});

test("AT-39 name 거부: 공백 topic · 모르는 type", () => {
  const root = project("init");
  for (const args of [["--type", "plan", "--topic", "a b"], ["--type", "report", "--topic", "x"]]) {
    const r = cli(root, "name", ...args);
    assert.notEqual(r.code, 0, args.join(" "));
    assert.equal(r.stdout, "");
  }
});

// ---------------------------------------------------------------- 실제 저장소 (§9.3 완료 후)

test("AT-40 부트스트랩 체인: 실제 저장소 check · 4문서 needs_review false · upstream 실재", (t) => {
  const chain = ["interview", "plan", "devlog", "checklist"].map((type) => {
    const dir = path.join(REPO, "docs", type);
    const hit = fs.existsSync(dir) ? fs.readdirSync(dir).find((n) => n.startsWith(`${type}_`) && n.endsWith("_SDD서고환경_설치.md")) : undefined;
    return hit ? `docs/${type}/${hit}` : null;
  });
  if (chain.some((c) => c === null) || !fs.existsSync(path.join(REPO, W, "cards"))) {
    t.skip("부트스트랩 체인(§9.3) 입고 전 — 설치 마지막에 실행");
    return;
  }
  const j = ok(cli(REPO, "check"));
  assert.equal(j.ok, true);
  for (const doc of chain as string[]) {
    assert.ok(readText(REPO, `${W}/cards/${doc}.card.md`).includes("needs_review: false\n"), doc);
  }
  const up = (doc: string) => /^upstream: (.+)$/m.exec(readText(REPO, doc))![1].replace(/^"|"$/g, "");
  assert.equal(up(chain[1]!), chain[0]);
  assert.equal(up(chain[2]!), chain[1]);
  assert.equal(up(chain[3]!), chain[2]);
  for (const doc of chain.slice(1) as string[]) assert.ok(fs.statSync(path.join(REPO, up(doc))).isFile());
});

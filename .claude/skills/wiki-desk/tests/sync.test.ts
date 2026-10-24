// 소유권(사람 키·verified)·relocate·카드 파싱 단위 테스트(§8.8)
import { after, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { cmdCheck, cmdInit, cmdRemove, cmdSync, appendLog } from "../src/commands.ts";
import { resolveRoot } from "../src/fs-safety.ts";
import { tryParseCard } from "../src/okf.ts";

const NOW = "2026-10-24T00:00:00.000Z";
const LATER = "2026-10-25T00:00:00.000Z";
const PLAN = "docs/plan/plan_26102411_x.md";
const IV = "docs/interview/interview_26102410_x.md";
const CARD = `__llm-wiki/cards/${PLAN}.card.md`;
const sync = (root: string, now = NOW, more: Partial<Parameters<typeof cmdSync>[1]> = {}) =>
  cmdSync(root, { apply: true, acceptRemoved: [], relocate: [], ...more }, now);

const made: string[] = [];
after(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function project(): string {
  const root = resolveRoot(fs.mkdtempSync(os.tmpdir() + "/wd-sync-"));
  made.push(root);
  fs.mkdirSync(path.join(root, "docs/plan"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs/interview"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs/devlog"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs/checklist"), { recursive: true });
  fs.writeFileSync(path.join(root, IV), "---\ntitle: 의도\n---\n\n# 의도\n");
  fs.writeFileSync(path.join(root, PLAN), `---\ntitle: 계획\nupstream: ${IV}\n---\n\n# 계획\n`);
  const c = JSON.parse(fs.readFileSync(new URL("../assets/project-contract.json", import.meta.url), "utf8"));
  fs.writeFileSync(path.join(root, "c.json"), JSON.stringify(c));
  cmdInit(root, path.join(root, "c.json"), true, NOW);
  sync(root);
  return root;
}

const addHumanKey = (root: string, line: string) => {
  const p = path.join(root, CARD);
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("\n---\n\n#", `\n${line}\n---\n\n#`));
};

test("사람 키 카드: 원문이 바뀌면 사람 키를 보존해 갱신 · receipt 는 extra 뺀 렌더 해시", () => {
  const root = project();
  addHumanKey(root, "reviewed_by: 홍길동");
  assert.equal(sync(root).unchanged, 2, "고정점: 사람 키만 더한 카드는 그대로");
  fs.appendFileSync(path.join(root, PLAN), "추가\n");
  const r = sync(root, LATER);
  assert.deepEqual(r.updated, [PLAN]);
  assert.deepEqual(r.protected, []);
  const card = fs.readFileSync(path.join(root, CARD), "utf8");
  assert.ok(card.includes("source_sha256: ") && card.includes("\nreviewed_by: 홍길동\n---\n"));
  assert.equal(cmdCheck(root).ok, true);
  fs.appendFileSync(path.join(root, PLAN), "또 추가\n");
  assert.deepEqual(sync(root, LATER).updated, [PLAN], "다음 sync 도 소유로 인식");
});

test("verified 카드: 원문이 바뀌면 쓰지 않고 reverify", () => {
  const root = project();
  addHumanKey(root, "verified:\n  by: human");
  const before = fs.readFileSync(path.join(root, CARD));
  fs.appendFileSync(path.join(root, PLAN), "추가\n");
  const r = sync(root, LATER);
  assert.deepEqual(r.reverify, [PLAN]);
  assert.deepEqual(r.updated, []);
  assert.deepEqual(fs.readFileSync(path.join(root, CARD)), before);
});

test("frontmatter 주석이 섞인 카드는 edited → protected", () => {
  const root = project();
  addHumanKey(root, "# 사람 주석\nreviewed_by: x");
  fs.appendFileSync(path.join(root, PLAN), "추가\n");
  assert.deepEqual(sync(root, LATER).protected, [CARD]);
});

test("relocate: 고아 카드를 보존 이동하고 새 원문 카드를 만든다", () => {
  const root = project();
  const neu = "docs/plan/plan_26102412_y.md";
  fs.renameSync(path.join(root, PLAN), path.join(root, neu));
  assert.throws(() => sync(root, LATER, { relocate: [[PLAN, "docs/plan/none.md"]] }), /원문 범위에 없음/);
  assert.throws(() => sync(root, LATER, { acceptRemoved: [IV] }), /고아 카드만/);
  const r = sync(root, LATER, { relocate: [[PLAN, neu]] });
  assert.deepEqual(r.archived, [PLAN]);
  assert.deepEqual(r.created, [neu]);
  assert.ok(fs.readFileSync(path.join(root, "__llm-wiki/log.md"), "utf8").includes(`- 보존이동: ${PLAN} → ${neu} (이동)\n`));
  assert.equal(cmdCheck(root).ok, true);
  const rm = cmdRemove(root, true);
  assert.ok(rm.deletes.includes(`__llm-wiki/archive/${PLAN}.card.md`));
});

test("receipt 없음: dry-run 도 거부", () => {
  const root = project();
  fs.rmSync(path.join(root, "__llm-wiki/receipt.json"));
  assert.throws(() => cmdSync(root, { apply: false, acceptRemoved: [], relocate: [] }, NOW), /receipt 없음/);
});

test("appendLog: 날짜 그룹 삽입 규칙", () => {
  const base = "# 위키 변경 이력\n\n## 2026-10-24\n- a\n";
  assert.equal(appendLog(base, ["b"], "2026-10-24"), "# 위키 변경 이력\n\n## 2026-10-24\n- a\n- b\n");
  assert.equal(appendLog(base, ["c"], "2026-10-25"), "# 위키 변경 이력\n\n## 2026-10-25\n- c\n\n## 2026-10-24\n- a\n");
});

test("tryParseCard: 불변식 위반은 오류 결과", () => {
  const root = project();
  const text = fs.readFileSync(path.join(root, CARD), "utf8");
  assert.equal(tryParseCard("x", text).ok, true);
  const bad = tryParseCard("x", text.replace("needs_review: false", "needs_review: true"));
  assert.equal(bad.ok, false);
  assert.match((bad as { error: string }).error, /^x: 불변식 위반/);
});

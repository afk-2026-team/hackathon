// 토크나이저·glob·명명·경로 안전·트랜잭션 단위 테스트(§10.4)
import { after, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { globMatch, validateContract } from "../src/contract.ts";
import { datedDocBasename, localTokens, NamingCollisionExhausted } from "../src/doc_naming.ts";
import { applyTxn, inspectInside, isSafeRel, planTxn, resolveRoot } from "../src/fs-safety.ts";
import { queryTokens, tokenize } from "../src/tokenize.ts";

const made: string[] = [];
after(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const tmp = () => {
  const d = fs.mkdtempSync(os.tmpdir() + "/wd-unit-");
  made.push(d);
  return d;
};

test("토크나이저 예시(§8.9)", () => {
  assert.deepEqual(tokenize("임베딩을"), ["임베", "베딩", "딩을"]);
  assert.deepEqual(tokenize("agent_config.yaml"), ["agent", "config", "yaml", "agent_config.yaml"]);
  assert.deepEqual(tokenize("gemini-embedding-2"), ["gemini", "embedding", "gemini-embedding-2"]);
  assert.deepEqual(tokenize("가 BM25"), ["가", "bm25"]);
  assert.deepEqual(tokenize("ＡＢＣ"), ["abc"]);
  assert.deepEqual(queryTokens(["a"]), []);
  assert.deepEqual(queryTokens(["검색 검색", "search"]), ["검색", "search"]);
  for (const s of ["임베딩을 agent_config.yaml", "Ｘ-ray"]) {
    const n = s.normalize("NFKC").toLowerCase();
    for (const t of tokenize(s)) assert.ok(n.includes(t), t);
  }
});

test("glob(§8.2)", () => {
  assert.ok(globMatch("docs/plan/**", "docs/plan/a/b.md"));
  assert.ok(globMatch("**/x.md", "x.md"));
  assert.ok(globMatch("**/x.md", "a/b/x.md"));
  assert.ok(globMatch("docs/*.md", "docs/a.md"));
  assert.ok(!globMatch("docs/*.md", "docs/a/b.md"));
  assert.ok(!globMatch("docs/plan/**", "docs/planx/a.md"));
  assert.ok(globMatch("a.b(c)/[x]", "a.b(c)/[x]"));
  assert.ok(!globMatch("a.b", "axb"));
});

test("계약: 별칭이 두 정본에 걸리면 거부 · 알 수 없는 키 보존 · 깊은 복사", () => {
  const base = JSON.parse(fs.readFileSync(new URL("../assets/project-contract.json", import.meta.url), "utf8"));
  const c = validateContract({ ...base, x_ext: { keep: 1 } });
  assert.deepEqual(c.x_ext, { keep: 1 });
  assert.notEqual(c.search, base.search);
  assert.throws(() => validateContract({ ...base, frontmatter_aliases: { summary: ["description"] } }), /^Error: 계약 frontmatter_aliases/);
  assert.throws(() => validateContract({ ...base, frontmatter_aliases: { a: ["x"], b: ["x"] } }), /두 정본/);
  assert.throws(() => validateContract({ ...base, source_roots: ["__llm-wiki/x"] }), /계약 source_roots/);
  assert.throws(() => validateContract({ ...base, source_roots: ["docs/node_modules"] }), /차단 디렉터리/);
  assert.throws(() => validateContract({ ...base, layout: { ...base.layout, cards_dir: "Index.md/x" } }), /예약 파일명/);
  assert.throws(() => validateContract({ ...base, naming: { ...base.naming, utc_offset: "+9" } }), /계약 naming.utc_offset/);
});

test("명명 골든(§8.15)", () => {
  assert.deepEqual(localTokens("2026-07-24T16:22:29Z", "+09:00"), ["26072501", "22", "29"]);
  assert.deepEqual(localTokens("2026-99-99T99:99:99Z", "+09:00"), ["NA", "00", "00"]);
  assert.deepEqual(localTokens("2026-02-30T00:00:00Z", "+09:00"), ["NA", "00", "00"]);
  assert.deepEqual(localTokens("2026-01-01T03:00:00Z", "-05:30"), ["25123121", "30", "00"]);
  const T = ["interview", "plan", "devlog", "checklist"];
  assert.equal(datedDocBasename("plan", "2026-07-25T06:58:00Z", "하네스_루프_구조개선", [], "+09:00", T), "plan_26072515_하네스_루프_구조개선.md");
  assert.equal(
    datedDocBasename("checklist", "2026-07-25T06:58:29Z", "다른주제", ["checklist_26072515_구조개선.md"], "+09:00", T),
    "checklist_26072515_58_29_다른주제.md",
  );
  assert.throws(
    () => datedDocBasename("checklist", "2026-07-25T06:58:29Z", "다른주제", ["checklist_26072515_구조개선.md", "checklist_26072515_58_29_다른주제.md"], "+09:00", T),
    (e: unknown) => e instanceof NamingCollisionExhausted && (e as Error).name === "NamingCollisionExhausted",
  );
  for (const bad of ["a b", "a/b", ".", "..", ""]) assert.throws(() => datedDocBasename("plan", "2026-07-25T06:58:00Z", bad, [], "+09:00", T), /doc_naming: topic/);
  assert.throws(() => datedDocBasename("report", "2026-07-25T06:58:00Z", "x", [], "+09:00", T), /doc_naming: type/);
});

test("안전 상대경로·루트·심링크 거부", () => {
  for (const ok of ["a", "a/b.md", "docs/x:y"]) assert.ok(isSafeRel(ok), ok);
  for (const bad of ["", "/a", "a//b", "./a", "a/../b", "a\\b", "c:/x", "a\x01", "a/"]) assert.ok(!isSafeRel(bad), bad);
  assert.throws(() => resolveRoot("/"), /파일시스템 루트/);
  assert.throws(() => resolveRoot("a/../b"), /'\.\.'/);
  const root = resolveRoot(tmp());
  fs.mkdirSync(path.join(root, "real"));
  fs.writeFileSync(path.join(root, "real/f.md"), "x");
  fs.symlinkSync(path.join(root, "real"), path.join(root, "link"));
  assert.throws(() => inspectInside(root, "link/f.md"), /심볼릭링크/);
  assert.throws(() => inspectInside(root, "real/f.md/x"), /파일 아래/);
  assert.equal(inspectInside(root, "real/f.md"), "file");
  assert.equal(inspectInside(root, "real/none"), "absent");
});

test("트랜잭션: 계획 거부 규칙과 쓰기 중 예외 시 전부 복원", () => {
  const root = resolveRoot(tmp());
  fs.mkdirSync(path.join(root, "w"));
  fs.writeFileSync(path.join(root, "w/a.txt"), "old-a");
  fs.writeFileSync(path.join(root, "w/d.txt"), "old-d");
  assert.throws(() => planTxn(root, "w", [{ path: "w/x", data: Buffer.from("1") }, { path: "w/x", data: Buffer.from("2") }]), /중복/);
  assert.throws(() => planTxn(root, "w", [{ path: "other/x", data: Buffer.from("1") }]), /범위 밖/);
  assert.throws(() => planTxn(root, "w", [{ path: "w/a.txt/x", data: Buffer.from("1") }]), /파일 아래/);
  assert.throws(() => planTxn(root, "w", [{ path: "w/n", data: Buffer.from("1") }, { path: "w/n/m", data: Buffer.from("1") }]), /충돌/);
  assert.throws(() => planTxn(root, "w", [{ path: "w/none", data: null }]), /없는 삭제/);

  const ops = [
    { path: "w/a.txt", data: Buffer.from("new-a") },
    { path: "w/sub/deep/b.txt", data: Buffer.from("new-b") },
    { path: "w/d.txt", data: null },
    { path: "w/c.txt", data: Buffer.from("new-c") },
  ];
  const plan = planTxn(root, "w", ops);
  assert.throws(() => applyTxn(plan, { beforeOp: (i) => { if (i === 3) throw new Error("주입된 결함"); } }), /주입된 결함/);
  assert.equal(fs.readFileSync(path.join(root, "w/a.txt"), "utf8"), "old-a");
  assert.equal(fs.readFileSync(path.join(root, "w/d.txt"), "utf8"), "old-d");
  assert.equal(fs.existsSync(path.join(root, "w/sub")), false);
  assert.equal(fs.existsSync(path.join(root, "w/c.txt")), false);
  assert.deepEqual(fs.readdirSync(path.join(root, "w")).sort(), ["a.txt", "d.txt"]);

  const plan2 = planTxn(root, "w", ops);
  fs.writeFileSync(path.join(root, "w/a.txt"), "changed");
  assert.throws(() => applyTxn(plan2), /사전 상태/);
  fs.writeFileSync(path.join(root, "w/a.txt"), "old-a");
  applyTxn(planTxn(root, "w", ops));
  assert.equal(fs.readFileSync(path.join(root, "w/sub/deep/b.txt"), "utf8"), "new-b");
  assert.equal(fs.statSync(path.join(root, "w/c.txt")).mode & 0o777, 0o644);
  assert.equal(fs.statSync(path.join(root, "w/sub")).mode & 0o777, 0o755);
  assert.equal(fs.existsSync(path.join(root, "w/d.txt")), false);
});

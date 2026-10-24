// YAML 서브셋 파서·에미터(§8.4) 단위 테스트
import { test } from "node:test";
import assert from "node:assert/strict";
import { emitString, emitYaml, locate, parseYaml } from "../src/frontmatter.ts";

const parse = (raw: string) => {
  const r = parseYaml(raw);
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r.value;
};
const parseErr = (raw: string) => {
  const r = parseYaml(raw);
  assert.equal(r.ok, false, `파싱이 성공함: ${raw}`);
  return (r as { error: string }).error;
};

test("locate: none · error · ok 와 bodyStartLine", () => {
  assert.deepEqual(locate("# 제목\n"), { kind: "none", bodyStartLine: 1 });
  assert.equal(locate("---\na: 1\n").kind, "error");
  const r = locate("\uFEFF---\r\na: 1\n---  \nbody\n");
  assert.equal(r.kind, "ok");
  assert.equal(r.bodyStartLine, 4);
});

test("스칼라 해석: null·bool·정수·실수·문자열", () => {
  const v = parse("a: ~\nb: True\nc: -12\nd: 1.5e3\ne: 2026-10-24\nf: yes\ng: 99999999999999999999\nh: .5\ni: ''\n");
  assert.deepEqual(v, { a: null, b: true, c: -12, d: 1500, e: "2026-10-24", f: "yes", g: "99999999999999999999", h: 0.5, i: "" });
});

test("블록 시퀀스·콤팩트 매핑·흐름 컬렉션·같은 들여쓰기 시퀀스", () => {
  const v = parse("tags: [search, bm25]\nm: {a: 1, b: [x, 'y z']}\nl:\n  - a\n  - k: v\n    k2: [1]\n  -\n    - inner\nsame:\n- p\n- q\nmulti: [a,\n  b]\n");
  assert.deepEqual(v, {
    tags: ["search", "bm25"],
    m: { a: 1, b: ["x", "y z"] },
    l: ["a", { k: "v", k2: [1] }, ["inner"]],
    same: ["p", "q"],
    multi: ["a", "b"],
  });
});

test("따옴표 이스케이프·다중 줄 plain·블록 스칼라 chomping", () => {
  const v = parse('q: "a\\tb\\u00e9\\U0001F600\\x41\\N"\ns: \'it\'\'s\' # 주석\np: one\n  two\n\n  three\nlit: |\n  x\n   y\n\nkeep: |+\n  k\n\nstrip: >-\n  f1\n  f2\n\n  f3\n');
  assert.equal(v.q, "a\tbé😀A\x85");
  assert.equal(v.s, "it's");
  assert.equal(v.p, "one two\nthree");
  assert.equal(v.lit, "x\n y\n");
  assert.equal(v.keep, "k\n\n");
  assert.equal(v.strip, "f1 f2\nf3");
});

test("거부: 탭·앵커·태그·디렉티브·예약문자·복합키·멀티문서·중복키·plain ': '·잔여·여러 줄 따옴표", () => {
  const cases = [
    "a:\n\t- x\n", "a: &x 1\n", "a: *x\n", "a: !tag 1\n", "%YAML 1.2\n", "a: @x\n", "a: `x`\n", "? a\n",
    "a: 1\n---\nb: 2\n", "a: 1\na: 2\n", "a: b: c\n", "a: \"x\" y\n", "a: \"open\n  close\"\n", "- a\n", "  a: 1\n",
  ];
  for (const c of cases) assert.match(parseErr(c), /^\d+행: /, c);
});

test("__proto__ 키도 일반 데이터", () => {
  const v = parse("__proto__: x\nconstructor: y\n");
  assert.equal(Object.getPrototypeOf(v), Object.prototype);
  assert.deepEqual(Object.keys(v), ["__proto__", "constructor"]);
  assert.equal(v["__proto__" as keyof typeof v], "x");
});

test("에미터 따옴표 규칙(§8.4 예)", () => {
  assert.equal(emitYaml({ okf_version: "0.2" }), 'okf_version: "0.2"\n');
  assert.equal(emitString("5893c42e"), '"5893c42e"');
  assert.equal(emitString("process:wiki-desk-ts"), "process:wiki-desk-ts");
  for (const s of ["", " a", "a ", "-x", "a: b", "a #b", "yes", "Null", "=", "<<", ".inf", "12", "true", "~", "a\u2028b"]) {
    assert.ok(emitString(s).startsWith('"'), s);
  }
  assert.equal(emitString("a\u2028b"), '"a\\u2028b"');
});

test("에미터 컬렉션 표기", () => {
  assert.equal(
    emitYaml({ a: [], b: {}, c: [1, [2, 3], { k: "v", k2: [4] }, []], d: { e: { f: null } } }),
    "a: []\nb: {}\nc:\n  - 1\n  -\n    - 2\n    - 3\n  - k: v\n    k2:\n      - 4\n  - []\nd:\n  e:\n    f: null\n",
  );
});

test("왕복: 파싱 → 에밋 → 파싱 의미 동등", () => {
  const samples = [
    'title: 검색 기능 계획\nupstream: docs/plan/x.md\ntags: [search, bm25]\n',
    'a: "  공백  "\nb: [1, 2.5, true, null, "x: y"]\nc:\n  - k: v\n    n: {}\n  - - deep\nd: "\\u0085\\u2028"\ne: |\n  line1\n  line2\n',
  ];
  for (const raw of samples) {
    const v1 = parse(raw);
    const v2 = parse(emitYaml(v1));
    assert.deepEqual(v2, v1);
    assert.equal(emitYaml(v2), emitYaml(v1));
  }
});

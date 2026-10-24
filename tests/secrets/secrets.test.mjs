import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import contract from "../../envs/infisical.config.json" with { type: "json" };
import { checkSecrets, getSecret, getServiceSecrets, getPublicConfig, secretNames } from "../../src/server/secrets.mjs";
import { authenticationEnv, applicationEnv, loadInfisicalSecrets } from "../../scripts/lib/infisical.mjs";
import { main, runApplication } from "../../scripts/secrets.mjs";

const SENTINEL = "test-only-sensitive-sentinel";
function fixtures() {
  return Object.fromEntries(Object.values(contract.services).flatMap((fields) => Object.entries(fields).map(([name, type]) =>
    [name, type === "https" ? "https://example.test/api" : type === "positive-integer" ? "1024" : `${SENTINEL}-${name}`])));
}
function harness() {
  const lines = [];
  return { lines, log: (line) => lines.push(line), error: (line) => lines.push(line) };
}

test("shared schema and TypeScript declarations cover the same keys", () => {
  const declarations = readFileSync(new URL("../../src/server/secrets.d.mts", import.meta.url), "utf8");
  const declared = [...declarations.matchAll(/\b([A-Z][A-Z_]+): string\b/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(declared)].sort(), [...secretNames].sort());
});

test("server access validates values and only returns explicitly public configuration", () => {
  const values = fixtures();
  assert.equal(getSecret("ANTHROPIC_API_KEY", values), values.ANTHROPIC_API_KEY);
  assert.deepEqual(Object.keys(getServiceSecrets("claude", values)), ["ANTHROPIC_API_KEY", "CLAUDE_API_MODEL"]);
  assert.deepEqual(Object.keys(getPublicConfig(values)).sort(), ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_URL"]);
  assert.throws(() => getSecret(SENTINEL, values), (e) => !e.message.includes(SENTINEL));
  for (const unsafeUrl of ["http://example.test", "https://user:password@example.test", "https://example.test?key=hidden"]) {
    assert.equal(checkSecrets(["supabase"], { ...values, SUPABASE_URL: unsafeUrl }).SUPABASE_URL, "INVALID");
  }
  assert.equal(checkSecrets(["nebius"], { ...values, NEBIUS_EMBEDDING_DIMENSIONS: "0" }).NEBIUS_EMBEDDING_DIMENSIONS, "INVALID");
  assert.throws(() => getSecret("ANTHROPIC_API_KEY", {}), /ANTHROPIC_API_KEY: MISSING/);
});

test("browser use fails before exposing a value", () => {
  globalThis.window = {};
  try { assert.throws(() => getSecret("ANTHROPIC_API_KEY", fixtures()), /server-only/); }
  finally { delete globalThis.window; }
});

test("one CLI read uses shared values and ignores undeclared exported variables", async () => {
  let calls = 0;
  const result = await loadInfisicalSecrets({ services: ["claude"], env: { PATH: "/test" }, executeFile: async (command, args, options) => {
    calls++;
    assert.equal(command, "infisical");
    assert.ok(args.includes("--secret-overriding=false"));
    assert.ok(args.includes(`--projectId=${contract.projectId}`));
    assert.ok(args.includes("--env=dev"));
    assert.equal(options.timeout, 30_000);
    return { stdout: JSON.stringify([...Object.entries(fixtures()).map(([key, value]) => ({ key, value })), { key: "NODE_OPTIONS", value: SENTINEL }]) };
  } });
  assert.equal(calls, 1);
  assert.deepEqual(Object.keys(result).sort(), ["ANTHROPIC_API_KEY", "CLAUDE_API_MODEL"]);
});

test("authentication and CLI failure never leak response bodies, credentials or raw output", async () => {
  await assert.rejects(authenticationEnv({ INFISICAL_CLIENT_ID: "id", INFISICAL_CLIENT_SECRET: SENTINEL }, async () => { throw new Error(SENTINEL); }), (e) => !e.message.includes(SENTINEL));
  await assert.rejects(authenticationEnv({ INFISICAL_CLIENT_SECRET: SENTINEL }), /Set both/);
  await assert.rejects(loadInfisicalSecrets({ env: {}, executeFile: async () => { throw Object.assign(new Error(SENTINEL), { stdout: SENTINEL, stderr: SENTINEL }); } }), (e) => !e.message.includes(SENTINEL));
  await assert.rejects(loadInfisicalSecrets({ env: {}, executeFile: async () => ({ stdout: SENTINEL }) }), (e) => !e.message.includes(SENTINEL));
});

test("machine login keeps the token out of CLI argv and logs", async () => {
  const env = await authenticationEnv({ INFISICAL_CLIENT_ID: "id", INFISICAL_CLIENT_SECRET: SENTINEL }, async (url, options) => {
    assert.equal(new URL(url).protocol, "https:");
    assert.equal(options.redirect, "error");
    assert.equal(JSON.parse(options.body).clientSecret, SENTINEL);
    return { ok: true, json: async () => ({ accessToken: "test-only-token" }) };
  });
  assert.equal(env.INFISICAL_TOKEN, "test-only-token");
  await loadInfisicalSecrets({ services: ["youtube"], env, executeFile: async (_command, args, opts) => {
    assert.ok(!args.join(" ").includes(SENTINEL));
    assert.ok(!args.join(" ").includes("test-only-token"));
    assert.equal(opts.env.INFISICAL_TOKEN, "test-only-token");
    return { stdout: JSON.stringify([{ key: "YOUTUBE_API_KEY", value: "test-only-youtube" }]) };
  } });
});

test("unselected/stale credentials and public-prefix leaks do not reach the app", () => {
  const source = { PATH: "/test", ...fixtures(), INFISICAL_TOKEN: SENTINEL, INFISICAL_CLIENT_SECRET: SENTINEL, NEXT_PUBLIC_ANTHROPIC_API_KEY: SENTINEL, anthropic_api_key: "stale" };
  const env = applicationEnv(source, { YOUTUBE_API_KEY: "new", NODE_OPTIONS: SENTINEL }, ["youtube"]);
  assert.deepEqual(env, { PATH: "/test", YOUTUBE_API_KEY: "new" });
});

test("missing vault value cannot fall back to an old parent key or start the app", async () => {
  const h = harness();
  let launched = false;
  const result = await main(["run", "--services", "claude", "--", "node", "app.mjs"], {
    ...h, source: fixtures(), load: async () => ({ CLAUDE_API_MODEL: "test-model" }), launch: async () => { launched = true; return 0; },
  });
  assert.equal(result, 1);
  assert.equal(launched, false);
  assert.ok(h.lines.includes("ANTHROPIC_API_KEY: MISSING"));
  assert.ok(!h.lines.join("\n").includes(SENTINEL));
});

test("check prints only names and statuses; run preserves command arguments and exit status", async () => {
  const h = harness();
  assert.equal(await main(["check"], { ...h, load: async () => fixtures() }), 0);
  assert.equal(h.lines.length, secretNames.length);
  assert.ok(h.lines.every((line) => /^[A-Z_]+: OK$/.test(line)));
  assert.equal(await main(["run", "--services", "youtube", "--", "node", "app.mjs", "a b", "; literal"], {
    ...h, source: { INFISICAL_TOKEN: SENTINEL }, load: async () => fixtures(),
    launch: async (args, env) => {
      assert.deepEqual(args, ["node", "app.mjs", "a b", "; literal"]);
      assert.deepEqual(Object.keys(env), ["YOUTUBE_API_KEY"]);
      return 7;
    },
  }), 7);
});

test("invalid CLI options fail before authenticating; unexpected failures are redacted", async () => {
  const h = harness();
  let reads = 0;
  assert.equal(await main(["check", "--env", "typo"], { ...h, load: async () => { reads++; } }), 1);
  assert.equal(reads, 0);
  assert.equal(await main(["check"], { ...h, load: async () => { throw new Error(SENTINEL); } }), 1);
  assert.ok(!h.lines.join("\n").includes(SENTINEL));
});

test("duplicate or hidden vault values are rejected without output", async () => {
  for (const rows of [[{ key: "YOUTUBE_API_KEY", value: SENTINEL, secretValueHidden: true }], [{ key: "YOUTUBE_API_KEY", value: SENTINEL }, { key: "YOUTUBE_API_KEY", value: SENTINEL }]]) {
    await assert.rejects(loadInfisicalSecrets({ services: ["youtube"], env: {}, executeFile: async () => ({ stdout: JSON.stringify(rows) }) }), (e) => !e.message.includes(SENTINEL));
  }
});

test("application launches directly without a shell and forwards its failure status", async () => {
  const result = await runApplication(["node", "app.mjs", "x y"], { SOME_CONFIG: "test-only" }, (executable, args, options) => {
    assert.equal(executable, process.execPath);
    assert.deepEqual(args, ["app.mjs", "x y"]);
    assert.equal(options.shell, false);
    const child = new EventEmitter();
    child.kill = () => {};
    queueMicrotask(() => child.emit("exit", 23, null));
    return child;
  });
  assert.equal(result, 23);
});

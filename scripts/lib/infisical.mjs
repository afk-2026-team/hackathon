import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import contract from "../../envs/infisical.config.json" with { type: "json" };
import { SecretConfigError, selectServices, secretNames } from "../../src/server/secrets.mjs";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));

export async function authenticationEnv(source, fetcher = fetch) {
  const env = { ...source };
  if (env.INFISICAL_TOKEN?.trim()) return env;
  const id = env.INFISICAL_CLIENT_ID;
  const secret = env.INFISICAL_CLIENT_SECRET;
  if (!id && !secret) return env; // Developer's own Infisical CLI login.
  if (!id?.trim() || !secret?.trim()) throw new SecretConfigError("Set both INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET for machine authentication.");
  try {
    const response = await fetcher(`${contract.domain}/v1/auth/universal-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: id, clientSecret: secret }),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("authentication rejected");
    const result = await response.json();
    if (typeof result.accessToken !== "string" || !result.accessToken.trim()) throw new Error("missing token");
    env.INFISICAL_TOKEN = result.accessToken;
    return env;
  } catch {
    // Never include response bodies, credentials, or the underlying error object.
    throw new SecretConfigError("Infisical machine authentication failed. Check credentials, expiry and network access.");
  }
}

/** One vault read per process start. No .env, temp file, stdout dump or local fallback. */
export async function loadInfisicalSecrets({ environment = "dev", services, env = process.env, executeFile = execute, fetcher = fetch } = {}) {
  if (!contract.environments.includes(environment)) throw new SecretConfigError("Environment must be dev or prod.");
  const selected = selectServices(services);
  const names = selected.flatMap((s) => Object.keys(contract.services[s]));
  const auth = await authenticationEnv(env, fetcher);
  let output;
  try {
    ({ stdout: output } = await executeFile("infisical", [
      "export", `--projectId=${contract.projectId}`, `--env=${environment}`,
      `--path=${contract.secretPath}`, "--format=json", "--secret-overriding=false",
      "--expand=false", `--domain=${contract.domain}`, "--silent", "--log-level=error", "--log-destination=stderr",
    ], { cwd: root, env: auth, encoding: "utf8", timeout: 30_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true }));
  } catch {
    throw new SecretConfigError("Unable to read Infisical. Check CLI installation, login, project access and network; cached/local keys will not be used.");
  }
  try {
    const rows = JSON.parse(output);
    if (!Array.isArray(rows)) throw new Error("invalid export");
    const values = Object.create(null);
    for (const row of rows) {
      if (!row || !names.includes(row.key)) continue;
      if (Object.hasOwn(values, row.key) || row.secretValueHidden || typeof row.value !== "string" || row.value.includes("\0")) throw new Error("invalid secret");
      values[row.key] = row.value;
    }
    return values;
  } catch {
    throw new SecretConfigError("Invalid Infisical response. Secret values and raw output are withheld.");
  }
}

/** Exported vault data cannot inject arbitrary variables such as NODE_OPTIONS. */
export function applicationEnv(source, values, services) {
  const selected = selectServices(services);
  const allowed = new Set(selected.flatMap((s) => Object.keys(contract.services[s])));
  const env = { ...source };
  for (const name of Object.keys(env)) {
    const canonical = name.toUpperCase().replace(/^(NEXT_PUBLIC_|VITE_)/, "");
    if (secretNames.includes(canonical) || name.toUpperCase().startsWith("INFISICAL_")) delete env[name];
  }
  for (const [name, value] of Object.entries(values)) {
    if (allowed.has(name)) env[name] = value;
  }
  return env;
}

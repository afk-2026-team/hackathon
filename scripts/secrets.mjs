#!/usr/bin/env node
import process from "node:process";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { constants } from "node:os";
import { loadInfisicalSecrets, applicationEnv } from "./lib/infisical.mjs";
import { SecretConfigError, checkSecrets, selectServices } from "../src/server/secrets.mjs";

const help = `Usage (Node.js 24+ and Infisical CLI required):
  node scripts/secrets.mjs check [--env dev|prod] [--services claude,supabase,nebius,naver,naver_maps,youtube]
  node scripts/secrets.mjs run [--env dev|prod] [--services claude,supabase] -- node --run dev
  node scripts/secrets.mjs run --services claude -- python app.py
Default: dev, all services. Login once with: infisical login
The runner never writes secret files. Key changes require an app restart.`;

export function parseArgs(args) {
  const [action, ...rest] = args;
  if (action === "--help" || action === "-h") return { action: "help" };
  if (!["check", "run"].includes(action)) throw new SecretConfigError(help);
  let environment = "dev";
  let services;
  let command = [];
  const seen = new Set();
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag === "--") { command = rest.slice(i + 1); break; }
    if (!["--env", "--services"].includes(flag) || seen.has(flag) || !rest[i + 1] || rest[i + 1].startsWith("--")) throw new SecretConfigError(help);
    seen.add(flag);
    const value = rest[++i];
    if (flag === "--env") environment = value;
    else services = value.split(",");
  }
  if (!["dev", "prod"].includes(environment)) throw new SecretConfigError("Environment must be dev or prod.");
  if ((action === "run" && !command.length) || (action === "check" && command.length)) throw new SecretConfigError(help);
  return { action, environment, services: selectServices(services), command };
}

export async function runApplication(command, env, spawnProcess = spawn) {
  const executable = command[0] === "node" ? process.execPath : command[0];
  if (process.platform === "win32" && (/\.(cmd|bat)$/i.test(executable) || /^(npm|npx|pnpm|yarn)$/i.test(executable))) {
    throw new SecretConfigError("On Windows use -- node --run dev (or a direct .exe), so no shell receives secret-bearing commands.");
  }
  return await new Promise((resolve, reject) => {
    const child = spawnProcess(executable, command.slice(1), { env, stdio: "inherit", shell: false });
    const handlers = new Map(["SIGINT", "SIGTERM"].map((signal) => [signal, () => child.kill(signal)]));
    for (const [signal, fn] of handlers) process.on(signal, fn);
    function cleanup() { for (const [signal, fn] of handlers) process.off(signal, fn); }
    child.once("error", () => { cleanup(); reject(new SecretConfigError("Unable to start the application command. Check its executable and arguments.")); });
    child.once("exit", (code, signal) => { cleanup(); resolve(code ?? 128 + (constants.signals[signal] ?? 1)); });
  });
}

export async function main(args, { load = loadInfisicalSecrets, launch = runApplication, source = process.env, log = console.log, error = console.error } = {}) {
  try {
    const options = parseArgs(args);
    if (options.action === "help") { log(help); return 0; }
    const values = await load({ environment: options.environment, services: options.services, env: source });
    const statuses = checkSecrets(options.services, values);
    const valid = Object.values(statuses).every((status) => status === "OK");
    if (options.action === "check" || !valid) {
      for (const [name, status] of Object.entries(statuses)) log(`${name}: ${status}`);
    }
    if (!valid) throw new SecretConfigError("Required configuration is missing or invalid; application was not started.");
    if (options.action === "check") return 0;
    return await launch(options.command, applicationEnv(source, values, options.services));
  } catch (cause) {
    error(cause instanceof SecretConfigError ? cause.message : "Secret manager failed; underlying output withheld.");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}

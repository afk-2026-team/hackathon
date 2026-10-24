import process from "node:process";
import contract from "../../envs/infisical.config.json" with { type: "json" };

// Server only. Never import this module from a Client Component/browser entry.
const definitions = Object.assign({}, ...Object.values(contract.services));
export const serviceNames = Object.freeze(Object.keys(contract.services));
export const secretNames = Object.freeze(Object.keys(definitions));

export class SecretConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "SecretConfigError";
  }
}

function assertServer() {
  if (typeof window !== "undefined") {
    throw new SecretConfigError("Secret manager is server-only.");
  }
}

export function selectServices(services = serviceNames) {
  if (!Array.isArray(services) || services.length === 0 ||
      services.some((name) => !Object.hasOwn(contract.services, name))) {
    throw new SecretConfigError(`Choose services from: ${serviceNames.join(", ")}.`);
  }
  return [...new Set(services)];
}

function statusFor(name, source) {
  const value = source[name];
  if (typeof value !== "string" || !value.trim()) return "MISSING";
  if (definitions[name] === "positive-integer" &&
      (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))) return "INVALID";
  if (definitions[name] === "https") {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash) return "INVALID";
    } catch { return "INVALID"; }
  }
  return "OK";
}

/** Only names and status labels; safe to print. Never returns secret values. */
export function checkSecrets(services = serviceNames, source = process.env) {
  assertServer();
  const names = [...new Set(selectServices(services).flatMap((s) => Object.keys(contract.services[s])))];
  return Object.fromEntries(names.map((name) => [name, statusFor(name, source)]));
}

/** Values stay in the application process; errors include registered names only. */
export function getSecret(name, source = process.env) {
  assertServer();
  if (!Object.hasOwn(definitions, name)) throw new SecretConfigError("Unregistered secret name. Add it to envs/infisical.config.json first.");
  const status = statusFor(name, source);
  if (status !== "OK") throw new SecretConfigError(`${name}: ${status}. Start with the shared secrets runner.`);
  return source[name];
}

export function getServiceSecrets(service, source = process.env) {
  selectServices([service]);
  return Object.freeze(Object.fromEntries(Object.keys(contract.services[service]).map((name) => [name, getSecret(name, source)])));
}

/** Call on the server and send only this result to the client when needed. */
export function getPublicConfig(source = process.env) {
  return Object.freeze(Object.fromEntries(contract.publicKeys.map((name) => [name, getSecret(name, source)])));
}

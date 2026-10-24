// upstream 판정(§8.6, 3.2.0 추가): 원문을 열지 않고 존재만 본다
import { globMatch } from "./contract.ts";
import { isRegularFileInside, isSafeRel } from "./fs-safety.ts";
import type { Contract, JsonObject } from "./types.ts";

export function upstreamReason(
  root: string,
  contract: Contract,
  rel: string,
  fmKind: "none" | "error" | "ok",
  data: JsonObject | null,
): string | null {
  const rule = (contract.upstream_rules ?? []).find((r) => globMatch(r.pattern, rel));
  if (!rule) return null;
  const v = fmKind === "ok" && data && Object.hasOwn(data, rule.key) ? data[rule.key] : undefined;
  if (typeof v !== "string" || v.trim() === "") return `upstream.missing: ${rule.key} 키 없음`;
  if (!isSafeRel(v) || !isRegularFileInside(root, v)) return `upstream.not_found: ${v}`;
  return null;
}

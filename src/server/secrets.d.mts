export type ServiceName = "claude" | "supabase" | "nebius" | "naver" | "naver_maps" | "youtube" | "ash_workflow";
export interface ServiceSecrets {
  claude: { ANTHROPIC_API_KEY: string; CLAUDE_API_MODEL: string };
  supabase: { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string; SUPABASE_SECRET_KEY: string; SUPABASE_STORAGE_BUCKET: string };
  nebius: { NEBIUS_API_KEY: string; NEBIUS_BASE_URL: string; NEBIUS_EMBEDDING_MODEL: string; NEBIUS_EMBEDDING_DIMENSIONS: string };
  naver: { NAVER_CLIENT_ID: string; NAVER_CLIENT_SECRET: string; NAVER_API_BASE_URL: string };
  naver_maps: { NAVER_MAPS_CLIENT_ID: string; NAVER_MAPS_CLIENT_SECRET: string };
  youtube: { YOUTUBE_API_KEY: string };
  ash_workflow: { ASH_ANTHROPIC_API_KEY: string; ASH_JEV_KEY: string };
}
export type SecretName = { [S in ServiceName]: keyof ServiceSecrets[S] }[ServiceName];
export type SecretSource = Record<string, string | undefined>;
export const serviceNames: readonly ServiceName[];
export const secretNames: readonly SecretName[];
export class SecretConfigError extends Error {}
export function selectServices(services?: readonly ServiceName[]): ServiceName[];
export function checkSecrets(services?: readonly ServiceName[], source?: SecretSource): Partial<Record<SecretName, "OK" | "MISSING" | "INVALID">>;
export function getSecret(name: SecretName, source?: SecretSource): string;
export function getServiceSecrets<S extends ServiceName>(service: S, source?: SecretSource): Readonly<ServiceSecrets[S]>;
export function getPublicConfig(source?: SecretSource): Readonly<Pick<ServiceSecrets["supabase"], "SUPABASE_URL" | "SUPABASE_PUBLISHABLE_KEY">>;

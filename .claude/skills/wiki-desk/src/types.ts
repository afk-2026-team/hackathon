// 공용 타입
export type Json = null | boolean | number | string | Json[] | JsonObject;
export interface JsonObject {
  [key: string]: Json;
}

export interface Authority {
  document_type: string;
  authority_rank: number;
  role: string;
}

export interface AuthorityRule extends Authority {
  pattern: string;
}

export interface UpstreamRule {
  pattern: string;
  key: string;
}

export interface Naming {
  docs_root: string;
  doc_types: string[];
  utc_offset: string;
}

export interface Contract {
  schema_version: 1;
  project_name: string;
  wiki_dir: "__llm-wiki" | "__llm_wiki";
  source_roots: string[];
  excluded_roots: string[];
  source_suffixes: string[];
  authority_rules: AuthorityRule[];
  fallback: Authority;
  copy_policy: "path_reference";
  frontmatter_aliases: Record<string, string[]>;
  filename_pattern: string;
  layout: { cards_dir: string; cache_dir: string; archive_dir: string };
  search: {
    bm25_k1: number;
    bm25_b: number;
    authority_weight: number;
    span_max_lines: number;
    result_limit: number;
    spans_per_result: number;
    field_boost: { title: number; heading: number; meta: number; body: number };
  };
  naming?: Naming;
  upstream_rules?: UpstreamRule[];
  [extra: string]: unknown;
}

/** OKF 0.2 포인터 카드(도구 키) */
export interface Card {
  type: string;
  title: string | null;
  description: string | null;
  resource: string;
  tags: string[];
  generated: { by: string; at: string };
  authority: Authority;
  source_meta: JsonObject;
  source_meta_unknown: JsonObject;
  needs_review: boolean;
  review_reasons: string[];
  source_sha256: string;
}

export interface HeadingNode {
  level: number;
  title: string;
  start: number;
  end: number;
  children: HeadingNode[];
}

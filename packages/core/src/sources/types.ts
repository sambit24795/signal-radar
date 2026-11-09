import type { FetchFn } from '../http.js';
import type { Niche, RawItem, SourceKind } from '../schema.js';

export interface SourceContext {
  fetch: FetchFn;
  now: Date;
  niches: Niche[];
  env: Record<string, string | undefined>;
  /** Per-run scratch space shared between sources (e.g. "reddit .json is blocked"). */
  state: Map<string, unknown>;
  warn: (msg: string) => void;
}

export interface SourceStatus {
  ok: boolean;
  reason?: string;
}

export interface Source {
  id: string;
  name: string;
  kind: SourceKind;
  alwaysInclude: boolean;
  status: SourceStatus;
  fetch(ctx: SourceContext): Promise<RawItem[]>;
}

export interface BuildOptions {
  rsshubBase?: string | undefined;
}

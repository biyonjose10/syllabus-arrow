/**
 * The model boundary. Everything that talks to a model goes through this
 * interface, so the rest of the product never names a vendor or a model id.
 *
 * Only src/lib/ingest (and later src/lib/checks) may import from src/lib/llm.
 * Mastery, the schedule, the graph and plan limits may not — `npm run verify`
 * fails CI if they do, even transitively.
 */

export type LlmPart = { kind: "text"; text: string } | { kind: "pdf"; data: Uint8Array };

export type LlmRequest = {
  /** Short name for logs, e.g. "extract". */
  label: string;
  system: string;
  parts: LlmPart[];
  /** JSON Schema the answer must satisfy. */
  schema: object;
};

export type LlmResponse = {
  raw: string;
  /** The model that answered, or "cache". */
  model: string;
  promptTokens?: number;
  outputTokens?: number;
};

export interface LlmProvider {
  /** Identifies the provider + model chain; part of every cache key. */
  readonly id: string;
  generateJson(request: LlmRequest): Promise<LlmResponse>;
}

/**
 * Every model in the chain was overloaded or rate-limited. Transient: the
 * caller should retry after `retryAfterMs` (the background job hands this to
 * Inngest, which waits without holding a function open).
 */
export class LlmBusyError extends Error {
  constructor(
    readonly retryAfterMs: number,
    readonly detail: string,
  ) {
    super(`All models are busy right now (${detail}).`);
    this.name = "LlmBusyError";
  }
}

/** A failure retrying will not fix: bad key, refused request, empty answer. */
export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

/** The service-wide daily cap on real model calls has been reached. */
export class LlmCapacityError extends Error {
  constructor(readonly limit: number) {
    super(`Syllabus→ has used today's ${limit} model calls. Try again tomorrow, or open the demo course.`);
    this.name = "LlmCapacityError";
  }
}

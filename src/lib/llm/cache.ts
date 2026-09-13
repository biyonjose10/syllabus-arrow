import { createHash } from "node:crypto";

import { prismaUnsafe as db } from "../db";
import { GeminiProvider } from "./gemini";
import { LlmCapacityError, type LlmProvider, type LlmRequest, type LlmResponse } from "./provider";

/**
 * Content-addressed model cache, in Postgres, plus the service-wide daily cap.
 *
 * The key covers everything that could change the answer — provider + model
 * chain, system prompt, schema, and every input byte — so editing a prompt can
 * never serve a stale answer, and the same syllabus uploaded twice (or the demo
 * re-run for the video) costs nothing the second time.
 *
 * One of the two modules besides the tenancy layer allowed to hold the raw
 * Prisma client (see scripts/verify.mts): `LlmCache` and `GlobalCounter` are
 * the only tables with no workspace, by design. A cache hit reveals nothing a
 * second uploader does not already hold — they uploaded the same bytes.
 */

const DEFAULT_DAILY_MODEL_CALLS = 150;

export function dailyModelCallLimit(): number {
  const configured = Number(process.env.SYLLABUS_DAILY_MODEL_CALLS);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_DAILY_MODEL_CALLS;
}

export function cacheKey(providerId: string, request: LlmRequest): string {
  const h = createHash("sha256");
  const field = (value: string | Uint8Array) => {
    const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : value;
    // Length-prefixed, so ("ab","c") and ("a","bc") never collide.
    h.update(`${bytes.byteLength}:`).update(bytes);
  };
  field(providerId);
  field(request.system);
  field(JSON.stringify(request.schema));
  for (const part of request.parts) {
    field(part.kind);
    field(part.kind === "text" ? part.text : part.data);
  }
  return h.digest("hex");
}

/** Counts one real model call against today's cap. Throws when over it. */
async function claimModelCall(): Promise<void> {
  const limit = dailyModelCallLimit();
  const key = `llm-calls:${new Date().toISOString().slice(0, 10)}`;
  const counter = await db.globalCounter.upsert({
    where: { key },
    create: { key, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  if (counter.count > limit) throw new LlmCapacityError(limit);
}

let defaultProvider: LlmProvider | undefined;

/** The one entry point the pipeline uses: cache → daily cap → model chain → cache. */
export async function generateJsonCached(
  request: LlmRequest,
  provider: LlmProvider = (defaultProvider ??= new GeminiProvider()),
): Promise<LlmResponse> {
  const key = cacheKey(provider.id, request);

  const hit = await db.llmCache.findUnique({ where: { key }, select: { raw: true } });
  if (hit) return { raw: hit.raw, model: "cache" };

  await claimModelCall();
  const response = await provider.generateJson(request);

  await db.llmCache.upsert({
    where: { key },
    create: {
      key,
      model: response.model,
      raw: response.raw,
      promptTokens: response.promptTokens ?? null,
      outputTokens: response.outputTokens ?? null,
    },
    update: {},
  });
  return response;
}

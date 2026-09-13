import { GoogleGenAI, type Part } from "@google/genai";

import { LlmBusyError, LlmError, type LlmPart, type LlmProvider, type LlmRequest, type LlmResponse } from "./provider";

/**
 * Gemini, behind a model chain.
 *
 * Measured on the free key, 2026-09-11: 3.8-flash and 3.7-flash shed real-sized
 * requests with 503 "high demand" (tiny requests still passed), then 3.7 hit
 * 429 quota; 3.6-flash served them reliably and 3.5-flash was fine. So the
 * dependable model goes first and a busy one falls through to the next,
 * instead of failing a student's upload.
 */
export const MODEL_CHAIN = ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash"] as const;

/** Requests are capped at 20 MB and base64 inflates by a third. */
const INLINE_PDF_LIMIT = 14 * 1024 * 1024;

/**
 * Longest wait worth spending inside one serverless invocation. A longer
 * `retryDelay` moves on to the next model; if every model wants a long wait,
 * the whole call fails with LlmBusyError and the job retries later.
 */
const MAX_IN_PROCESS_WAIT_MS = 12_000;
const ATTEMPTS_PER_MODEL = 2;
const REQUEST_TIMEOUT_MS = 150_000;

const RETRYABLE = /"code":\s*(429|500|503|504)|UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL|DEADLINE_EXCEEDED|fetch failed|ECONNRESET|ETIMEDOUT|timed? ?out/i;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** One line naming what actually went wrong, e.g. `429 RESOURCE_EXHAUSTED: Quota exceeded…`. */
export function describeError(err: unknown): string {
  const text = errorText(err);
  const code = text.match(/"code":\s*(\d+)/)?.[1];
  const status = text.match(/"status":\s*"([A-Z_]+)"/)?.[1];
  const message = text.match(/"message":\s*"([^"]{0,160})/)?.[1] ?? text.slice(0, 160);
  return [code, status].filter(Boolean).join(" ") + (code || status ? ": " : "") + message;
}

function suggestedDelayMs(err: unknown): number | null {
  const seconds = errorText(err).match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/)?.[1];
  return seconds ? Math.ceil(Number(seconds) * 1000) + 1_000 : null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class GeminiProvider implements LlmProvider {
  readonly id = `gemini:${MODEL_CHAIN.join(",")}`;
  private client: GoogleGenAI | undefined;

  private getClient(): GoogleGenAI {
    // Never GEMINI_API_KEY: on the dev machine that name is inherited from the
    // user environment, holds a different paid key, and beats .env.local.
    const apiKey = process.env.SYLLABUS_GEMINI_KEY;
    if (!apiKey) throw new LlmError("SYLLABUS_GEMINI_KEY is not set.");
    return (this.client ??= new GoogleGenAI({ apiKey }));
  }

  async generateJson(request: LlmRequest): Promise<LlmResponse> {
    const client = this.getClient();
    const parts = await Promise.all(request.parts.map((p) => this.toPart(client, p)));

    let longestWait = 0;
    let lastError: unknown;

    for (const model of MODEL_CHAIN) {
      for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
        try {
          const response = await client.models.generateContent({
            model,
            contents: [{ role: "user", parts }],
            config: {
              systemInstruction: request.system,
              maxOutputTokens: 32_768,
              responseMimeType: "application/json",
              responseJsonSchema: request.schema,
              httpOptions: { timeout: REQUEST_TIMEOUT_MS },
            },
          });

          const raw =
            response.candidates?.[0]?.content?.parts
              ?.filter((p) => !p.thought && typeof p.text === "string")
              .map((p) => p.text)
              .join("") ?? "";

          if (!raw.trim()) {
            // An empty answer (safety stop, token limit) will not improve on retry
            // with the same model, but the next model may answer it.
            lastError = new LlmError(`${model} returned no text (finishReason: ${response.candidates?.[0]?.finishReason})`);
            console.warn(`[llm] ${request.label} ${model}: ${errorText(lastError)}`);
            break;
          }

          return {
            raw,
            model,
            promptTokens: response.usageMetadata?.promptTokenCount,
            outputTokens: response.usageMetadata?.candidatesTokenCount,
          };
        } catch (err) {
          lastError = err;
          if (!RETRYABLE.test(errorText(err))) {
            console.error(`[llm] ${request.label} ${model}: ${describeError(err)}`);
            throw new LlmError(describeError(err));
          }
          const wait = suggestedDelayMs(err) ?? 3_000 * attempt;
          longestWait = Math.max(longestWait, wait);
          console.warn(`[llm] ${request.label} ${model} attempt ${attempt}: ${describeError(err)}`);
          if (attempt === ATTEMPTS_PER_MODEL || wait > MAX_IN_PROCESS_WAIT_MS) break;
          await sleep(wait);
        }
      }
    }

    if (lastError instanceof LlmError) throw lastError;
    throw new LlmBusyError(Math.max(longestWait, 30_000), describeError(lastError));
  }

  private async toPart(client: GoogleGenAI, part: LlmPart): Promise<Part> {
    if (part.kind === "text") return { text: part.text };
    if (part.data.byteLength <= INLINE_PDF_LIMIT) {
      return { inlineData: { mimeType: "application/pdf", data: Buffer.from(part.data).toString("base64") } };
    }
    // Large PDFs (full past-paper sets) go through the Files API instead of inline.
    const file = await client.files.upload({
      file: new Blob([part.data as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
      config: { mimeType: "application/pdf" },
    });
    let current = file;
    for (let i = 0; i < 20 && current.state === "PROCESSING" && current.name; i++) {
      await sleep(1_000);
      current = await client.files.get({ name: current.name });
    }
    if (!current.uri || current.state === "FAILED") throw new LlmError("The PDF could not be prepared for reading.");
    return { fileData: { fileUri: current.uri, mimeType: "application/pdf" } };
  }
}

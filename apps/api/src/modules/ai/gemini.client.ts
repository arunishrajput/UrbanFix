/**
 * Minimal Gemini (Google AI Studio) REST client.
 *
 * - The API key travels in the `x-goog-api-key` header, never in a URL or log line.
 * - Structured output: `responseJsonSchema` + zod validation of the reply.
 * - Resilience: retries with jittered backoff on 429/5xx, a model fallback chain
 *   (free-tier models are often overloaded), a per-call timeout and a small
 *   circuit breaker so an outage doesn't stall every upload.
 */
import type { z } from 'zod';
import { config } from '../../config';
import { logger } from '../../core/logger';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/* ---------- circuit breaker ---------- */

const breaker = { failures: 0, openUntil: 0 };
const BREAKER_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 60_000;

function assertAvailable() {
  if (!config.aiAvailable) throw new AiUnavailableError('AI is disabled or GEMINI_API_KEY is not set');
  if (Date.now() < breaker.openUntil)
    throw new AiUnavailableError('AI temporarily unavailable (circuit open)');
}
function recordSuccess() {
  breaker.failures = 0;
}
function recordFailure() {
  breaker.failures += 1;
  if (breaker.failures >= BREAKER_THRESHOLD) {
    breaker.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
    breaker.failures = 0;
    logger.warn('gemini circuit opened for 60s after repeated failures');
  }
}
export function resetBreaker() {
  breaker.failures = 0;
  breaker.openUntil = 0;
}

/* ---------- transport ---------- */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': config.GEMINI_API_KEY! },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.GEMINI_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) throw new HttpError(res.status, json.error?.message ?? res.statusText);
  return json;
}

/** Runs `fn` for each model in the chain, retrying transient errors, until one succeeds. */
async function withFallback<T>(
  models: string[],
  fn: (model: string) => Promise<T>,
): Promise<{ value: T; model: string }> {
  assertAvailable();
  let lastError: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const value = await fn(model);
        recordSuccess();
        return { value, model };
      } catch (err) {
        lastError = err;
        const status = err instanceof HttpError ? err.status : 0;
        const transient = RETRYABLE.has(status) || status === 0;
        logger.debug({ model, attempt, status, msg: (err as Error).message }, 'gemini call failed');
        // Overloaded or rate limited: move on to the next model quickly rather than hammering this one.
        if (!transient || status === 429 || status === 503 || attempt === 2) break;
        await sleep(400 * 2 ** attempt + Math.random() * 300);
      }
    }
  }
  recordFailure();
  throw new AiUnavailableError(
    `all Gemini models failed: ${(lastError as Error)?.message ?? 'unknown error'}`,
  );
}

/* ---------- public API ---------- */

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

export interface GenerateJsonOptions<S extends z.ZodType> {
  parts: GeminiPart[];
  systemInstruction: string;
  /** JSON Schema sent to Gemini to constrain the output. */
  jsonSchema: Record<string, unknown>;
  /** zod schema that validates (and narrows) the reply. */
  schema: S;
  temperature?: number;
}

export async function generateJson<S extends z.ZodType>(
  opts: GenerateJsonOptions<S>,
): Promise<{ data: z.infer<S>; model: string }> {
  const { value, model } = await withFallback(config.GEMINI_MODELS, async (model) => {
    const body = (thinking: boolean) => ({
      systemInstruction: { parts: [{ text: opts.systemInstruction }] },
      contents: [{ role: 'user', parts: opts.parts }],
      generationConfig: {
        temperature: opts.temperature ?? 0.2,
        responseMimeType: 'application/json',
        responseJsonSchema: opts.jsonSchema,
        ...(thinking ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
      },
    });
    let res: GenerateResponse;
    try {
      res = (await post(`models/${model}:generateContent`, body(true))) as GenerateResponse;
    } catch (err) {
      // Older models reject thinkingLevel; retry once without it.
      if (err instanceof HttpError && err.status === 400) {
        res = (await post(`models/${model}:generateContent`, body(false))) as GenerateResponse;
      } else throw err;
    }
    if (res.promptFeedback?.blockReason)
      throw new HttpError(422, `blocked: ${res.promptFeedback.blockReason}`);
    const text = (res.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join('');
    if (!text) throw new HttpError(502, 'empty response');
    return opts.schema.parse(JSON.parse(text));
  });
  return { data: value, model };
}

export type EmbeddingTask = 'SEMANTIC_SIMILARITY' | 'RETRIEVAL_DOCUMENT';

export async function embed(parts: GeminiPart[], taskType?: EmbeddingTask): Promise<number[]> {
  const { value } = await withFallback([config.GEMINI_EMBED_MODEL], async (model) => {
    const res = (await post(`models/${model}:embedContent`, {
      content: { parts },
      outputDimensionality: config.GEMINI_EMBED_DIMENSIONS,
      ...(taskType ? { taskType } : {}),
    })) as { embedding?: { values?: number[] } };
    const values = res.embedding?.values;
    if (!values?.length) throw new HttpError(502, 'empty embedding');
    return normalize(values);
  });
  return value;
}

/** Truncated (Matryoshka) embeddings must be re-normalised before cosine comparisons. */
function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => Math.round((x / norm) * 1e6) / 1e6);
}

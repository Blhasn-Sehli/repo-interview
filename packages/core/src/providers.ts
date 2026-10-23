import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { join } from "node:path";

export interface CompletionRequest {
  system: string;
  prompt: string;
  /** JSON schema the reply must follow; providers that can enforce it do, others rely on the prompt */
  schema?: object;
}

/** Anything that turns a system + user prompt into text. Adapters below; tests use RecordedProvider. */
export interface ModelProvider {
  readonly id: string;
  complete(req: CompletionRequest): Promise<string>;
}

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

/** Anthropic API. Reads ANTHROPIC_API_KEY (or an `ant auth login` profile) unless apiKey is given. */
export function anthropic(opts: { model?: string; apiKey?: string } = {}): ModelProvider {
  const model = opts.model ?? DEFAULT_ANTHROPIC_MODEL;
  const client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
  return {
    id: `anthropic:${model}`,
    async complete({ system, prompt }) {
      const res = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system,
        messages: [{ role: "user", content: prompt }],
      });
      if (res.stop_reason === "refusal") throw new Error(`${model} declined the request`);
      return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    },
  };
}

export interface OpenAICompatibleOptions {
  baseURL: string;
  model: string;
  apiKey?: string;
  fetch?: typeof fetch;
}

/** Any server speaking the OpenAI chat-completions format (OpenAI, vLLM, LM Studio, Ollama). */
export function openAICompatible(opts: OpenAICompatibleOptions, id = `openai-compatible:${opts.model}`): ModelProvider {
  const doFetch = opts.fetch ?? fetch;
  const url = `${opts.baseURL.replace(/\/+$/, "")}/chat/completions`;
  return {
    id,
    async complete({ system, prompt }) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (opts.apiKey) headers.authorization = `Bearer ${opts.apiKey}`;
      const res = await doFetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: opts.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!res.ok) throw new Error(`${url} returned ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== "string") throw new Error(`${url} returned no message content`);
      return text;
    },
  };
}

export interface OllamaOptions {
  model: string;
  baseURL?: string;
  /** context window in tokens; Ollama's own default (4096 on small GPUs) silently cuts long prompts */
  numCtx?: number;
  fetch?: typeof fetch;
}

/**
 * POST without fetch's 5-minute wait for response headers: Ollama sends none until the model is
 * loaded, and loading from a slow disk can take longer than that.
 */
const patientFetch = ((url: string, init: RequestInit) =>
  new Promise<Response>((resolveRes, reject) => {
    const req = httpRequest(url, { method: init.method, headers: init.headers as Record<string, string> }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolveRes(new Response(Buffer.concat(chunks), { status: res.statusCode })));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end(init.body as string);
  })) as typeof fetch;

/** Local model through Ollama's native chat API; code never leaves the machine. */
export function ollama(opts: OllamaOptions): ModelProvider {
  const doFetch = opts.fetch ?? patientFetch;
  const url = `${(opts.baseURL ?? "http://localhost:11434").replace(/\/+$/, "")}/api/chat`;
  return {
    id: `ollama:${opts.model}`,
    async complete({ system, prompt, schema }) {
      const res = await doFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: opts.model,
          stream: false,
          // stay loaded between corpus repos; cap output so a rambling small model can't run for minutes
          keep_alive: "30m",
          options: { num_ctx: opts.numCtx ?? 16384, num_predict: 2048 },
          ...(schema ? { format: schema } : {}),
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!res.ok) throw new Error(`${url} returned ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as { message?: { content?: string } };
      if (typeof body.message?.content !== "string") throw new Error(`${url} returned no message content`);
      return body.message.content;
    },
  };
}

/**
 * Replays responses saved in `dir`, keyed by a hash of the request. With an inner provider,
 * missing responses are fetched and saved (record mode); without one, they throw (offline tests).
 */
export class RecordedProvider implements ModelProvider {
  readonly id: string;

  constructor(private readonly dir: string, private readonly inner?: ModelProvider) {
    this.id = inner ? `recording:${inner.id}` : "recorded";
  }

  static key(req: CompletionRequest): string {
    return createHash("sha256").update(req.system).update("\0").update(req.prompt).digest("hex").slice(0, 16);
  }

  async complete(req: CompletionRequest): Promise<string> {
    const key = RecordedProvider.key(req);
    const path = join(this.dir, `${key}.json`);
    if (existsSync(path)) return (JSON.parse(readFileSync(path, "utf8")) as { response: string }).response;
    if (!this.inner) throw new Error(`no recording for request ${key} in ${this.dir}; run once with a real provider to record it`);
    const response = await this.inner.complete(req);
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(path, JSON.stringify({ provider: this.inner.id, request: req, response }, null, 2) + "\n");
    return response;
  }
}

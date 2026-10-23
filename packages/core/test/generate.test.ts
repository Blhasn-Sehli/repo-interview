import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPrompt,
  generateQuestions,
  ollama,
  openAICompatible,
  parseQuestions,
  RecordedProvider,
  scanRepo,
  type ModelProvider,
} from "../src/index.js";

const stub = (response: string): ModelProvider => ({ id: "stub", complete: async () => response });

describe("parseQuestions", () => {
  it("accepts a bare JSON array or one wrapped in a code fence", () => {
    const q = [{ text: "Why?", file: "a.ts", symbol: "f" }];
    expect(parseQuestions(JSON.stringify(q))).toEqual(q);
    expect(parseQuestions("Here:\n```json\n" + JSON.stringify(q) + "\n```")).toEqual(q);
  });
  it("drops entries without text or file", () => {
    expect(parseQuestions('[{"text":"x"},{"file":"a"},{"text":"ok","file":"a.ts"}]')).toEqual([
      { text: "ok", file: "a.ts" },
    ]);
  });
});

describe("buildPrompt", () => {
  const root = mkdtempSync(join(tmpdir(), "ri-prompt-"));
  writeFileSync(join(root, "a.ts"), "export function retry(n: number) {\n  return n * 2; // backoff\n}\n");
  writeFileSync(join(root, "b.ts"), "export const big = () => 1;\n" + "// filler\n".repeat(400));

  it("includes code excerpts around cited symbols, labelled with path and line", () => {
    const { prompt } = buildPrompt(scanRepo(root));
    expect(prompt).toContain("a.ts:1");
    expect(prompt).toContain("return n * 2; // backoff");
  });

  it("keeps excerpts within the character budget", () => {
    const { prompt } = buildPrompt(scanRepo(root), { maxExcerptChars: 60 });
    expect(prompt).toContain("a.ts (typescript): retry");
    expect(prompt).not.toContain("// filler");
  });
});

describe("generateQuestions", () => {
  const root = mkdtempSync(join(tmpdir(), "ri-gen-"));
  writeFileSync(join(root, "a.ts"), "export function retry() {}\n");

  it("keeps verified questions and reports dropped ones", async () => {
    const provider = stub(
      JSON.stringify([
        { text: "Why does retry exist?", file: "a.ts", symbol: "retry" },
        { text: "Explain ghost", file: "a.ts", symbol: "ghost" },
        { text: "Explain b", file: "b.ts" },
      ]),
    );
    const { kept, dropped } = await generateQuestions(scanRepo(root), provider, { count: 3 });
    expect(kept.map((q) => q.symbol)).toEqual(["retry"]);
    expect(dropped.map((v) => v.reason)).toEqual(["symbol not found: ghost", "file not found: b.ts"]);
  });
});

describe("RecordedProvider", () => {
  it("records a response, then replays it offline", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ri-rec-"));
    const req = { system: "s", prompt: "p" };
    const recorder = new RecordedProvider(dir, stub("hello"));
    expect(await recorder.complete(req)).toBe("hello");
    expect(readdirSync(dir)).toHaveLength(1);

    const replay = new RecordedProvider(dir);
    expect(await replay.complete(req)).toBe("hello");
    await expect(replay.complete({ system: "s", prompt: "other" })).rejects.toThrow(/no recording/);
  });
});

describe("ollama", () => {
  it("uses the native chat API with a context window large enough for the prompt", async () => {
    let seen: { url: string; body: any } | undefined;
    const fetchStub = (async (url: string, init: RequestInit) => {
      seen = { url, body: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({ message: { content: "hi" } }));
    }) as typeof fetch;
    const p = ollama({ model: "qwen", fetch: fetchStub });
    expect(await p.complete({ system: "s", prompt: "p" })).toBe("hi");
    expect(seen!.url).toBe("http://localhost:11434/api/chat");
    expect(seen!.body).toMatchObject({ model: "qwen", stream: false, options: { num_ctx: 16384 } });
  });
});

describe("openAICompatible", () => {
  it("posts a chat completion and returns the message text", async () => {
    let seen: { url: string; body: any; auth?: string } | undefined;
    const fetchStub = (async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      seen = { url, body: JSON.parse(String(init.body)), auth: headers.authorization };
      return new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }));
    }) as typeof fetch;
    const p = openAICompatible({ baseURL: "http://localhost:11434/v1/", model: "qwen", apiKey: "k", fetch: fetchStub });
    expect(await p.complete({ system: "s", prompt: "p" })).toBe("hi");
    expect(seen!.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(seen!.body.messages).toEqual([
      { role: "system", content: "s" },
      { role: "user", content: "p" },
    ]);
    expect(seen!.auth).toBe("Bearer k");
  });
});

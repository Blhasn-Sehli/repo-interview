import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  codeContext,
  renderReport,
  runInterview,
  scoreAnswer,
  type CompletionRequest,
  type ModelProvider,
  type Question,
  type Score,
} from "../src/index.js";

const root = mkdtempSync(join(tmpdir(), "ri-interview-"));
writeFileSync(join(root, "a.ts"), "// header\n\nexport function retry(n: number) {\n  return n * 2;\n}\n");
const q: Question = { text: "Why does retry double n?", file: "a.ts", symbol: "retry" };

describe("codeContext", () => {
  it("starts at the cited symbol and labels the line", () => {
    const ctx = codeContext(root, q);
    expect(ctx).toMatch(/^a\.ts:3\n/);
    expect(ctx).toContain("return n * 2;");
    expect(ctx).not.toContain("// header");
  });

  it("without a symbol, finds a `backticked` name from the question", () => {
    const ctx = codeContext(root, { text: "What does `retry` return?", file: "a.ts" });
    expect(ctx).toMatch(/^a\.ts:3\n/);
  });
});

describe("scoreAnswer", () => {
  it("sends question, code and answer, and parses a clamped score", async () => {
    let seen: CompletionRequest | undefined;
    const provider: ModelProvider = {
      id: "stub",
      complete: async (req) => {
        seen = req;
        return JSON.stringify({ score: 7, feedback: "Good.", followUp: "What if n is negative?" });
      },
    };
    const s = await scoreAnswer(root, q, "to back off", provider);
    expect(s).toEqual({ score: 3, feedback: "Good.", followUp: "What if n is negative?" });
    expect(seen!.prompt).toContain("Why does retry double n?");
    expect(seen!.prompt).toContain("return n * 2;");
    expect(seen!.prompt).toContain("to back off");
    expect(seen!.schema).toBeDefined();
  });

  it("scores an empty answer 0 without calling the model", async () => {
    const provider: ModelProvider = { id: "stub", complete: async () => { throw new Error("should not be called"); } };
    expect((await scoreAnswer(root, q, "  ", provider)).score).toBe(0);
  });

  it("treats an unreadable reply as unscored instead of crashing", async () => {
    const provider: ModelProvider = { id: "stub", complete: async () => "not json" };
    const s = await scoreAnswer(root, q, "x", provider);
    expect(s.score).toBeNull();
  });
});

describe("runInterview", () => {
  it("asks each question and one follow-up only after a weak answer", async () => {
    const answers = ["weak", "better", "great"];
    const asked: string[] = [];
    const scores: Score[] = [
      { score: 1, feedback: "vague", followUp: "Be specific?" },
      { score: 2, feedback: "ok" },
      { score: 3, feedback: "full" },
    ];
    const q2: Question = { text: "Second?", file: "a.ts" };
    const results = await runInterview([q, q2], {
      ask: async (prompt) => {
        asked.push(prompt);
        return answers.shift()!;
      },
      say: () => {},
      score: async () => scores.shift()!,
    });
    expect(asked).toEqual([q.text, "Be specific?", "Second?"]);
    expect(results[0].followUp).toMatchObject({ question: "Be specific?", answer: "better", score: 2 });
    expect(results[1].followUp).toBeUndefined();
  });
});

describe("renderReport", () => {
  it("lists totals, weak spots with file links, and every answer", () => {
    const md = renderReport("my-repo", [
      { question: q, answer: "dunno", score: 0, feedback: "Read retry." },
      { question: { text: "Second?", file: "b.ts" }, answer: "yes", score: 3, feedback: "Spot on." },
    ]);
    expect(md).toContain("# Interview report: my-repo");
    expect(md).toContain("3/6");
    expect(md).toMatch(/## Study next[\s\S]*\[a\.ts\]\(a\.ts\)/);
    expect(md).not.toMatch(/## Study next[\s\S]*b\.ts[\s\S]*## Questions/);
    expect(md).toContain("Spot on.");
  });
});

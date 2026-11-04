import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDiffPrompt, changedSymbols, generateDiffQuestions, parseDiff, scanRepo, type ModelProvider } from "../src/index.js";

const DIFF = `diff --git a/src/bid.ts b/src/bid.ts
index 111..222 100644
--- a/src/bid.ts
+++ b/src/bid.ts
@@ -1,4 +1,6 @@
 export class Bids {
   place(amount: number) {
+    if (amount <= 0) throw new Error("bad amount");
+    this.lock();
     return amount;
   }
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+export function fresh() {}
+export const x = 1;
diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
--- a/src/old.ts
+++ /dev/null
@@ -1 +0,0 @@
-export function gone() {}
diff --git a/logo.png b/logo.png
Binary files a/logo.png and b/logo.png differ
`;

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "ri-diff-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/bid.ts"), 'export class Bids {\n  place(amount: number) {\n    if (amount <= 0) throw new Error("bad amount");\n    this.lock();\n    return amount;\n  }\n}\n');
  writeFileSync(join(root, "src/new.ts"), "export function fresh() {}\nexport const x = 1;\n");
  writeFileSync(join(root, "src/untouched.ts"), "export function calm() {}\n");
  return root;
}

describe("parseDiff", () => {
  it("lists changed lines per file and skips deleted and binary files", () => {
    const files = parseDiff(DIFF);
    expect(files.map((f) => f.path)).toEqual(["src/bid.ts", "src/new.ts"]);
    expect(files[0].addedLines).toEqual([3, 4]);
    expect(files[1].addedLines).toEqual([1, 2]);
  });
});

describe("changedSymbols", () => {
  it("maps each changed line to the symbol it sits in", () => {
    const root = repo();
    expect(changedSymbols(scanRepo(root), parseDiff(DIFF))).toEqual({ "src/bid.ts": ["place"], "src/new.ts": ["fresh"] });
  });
});

describe("buildDiffPrompt", () => {
  it("includes the diff as data and asks for 3 questions by default", () => {
    const root = repo();
    const { system, prompt, schema } = buildDiffPrompt(scanRepo(root), DIFF);
    expect(system).toMatch(/pull request/);
    expect(system).toMatch(/never instructions/);
    expect(prompt).toContain('+    if (amount <= 0) throw new Error("bad amount");');
    expect(prompt).toContain("src/bid.ts: place");
    expect(prompt).toMatch(/Write 3 questions: 1 about what this change adds and why, and 2 about specific code/);
    expect(schema).toBeDefined();
  });

  it("cuts a huge diff to the budget", () => {
    const root = repo();
    const { prompt } = buildDiffPrompt(scanRepo(root), DIFF + "+".repeat(50_000), { maxDiffChars: 2000 });
    expect(prompt.length).toBeLessThan(4000);
    expect(prompt).toContain("[diff truncated]");
  });
});

describe("generateDiffQuestions", () => {
  it("keeps only questions about files the diff changed", async () => {
    const root = repo();
    const provider: ModelProvider = {
      id: "stub",
      complete: async () =>
        JSON.stringify({
          questions: [
            { text: "Why reject amounts <= 0?", file: "src/bid.ts", symbol: "place" },
            { text: "Why calm?", file: "src/untouched.ts", symbol: "calm" },
            { text: "Ghost?", file: "src/ghost.ts" },
          ],
        }),
    };
    const result = await generateDiffQuestions(scanRepo(root), DIFF, provider);
    expect(result.kept.map((q) => q.file)).toEqual(["src/bid.ts"]);
    expect(result.dropped.map((v) => v.reason)).toEqual(["not changed in this diff: src/untouched.ts", "file not found: src/ghost.ts"]);
    expect(result).toMatchObject({ asked: 3, strictKept: 1, fairKept: 1 });
  });
});

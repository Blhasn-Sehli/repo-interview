import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyQuestions } from "../src/index.js";

describe("verifyQuestions", () => {
  const root = mkdtempSync(join(tmpdir(), "ri-"));
  writeFileSync(join(root, "a.ts"), "export function retry() {}");
  it("keeps questions citing real code", () => {
    const [v] = verifyQuestions(root, [{ text: "Why retry?", file: "a.ts", symbol: "retry" }]);
    expect(v.ok).toBe(true);
  });
  it("rejects missing file and missing symbol", () => {
    const vs = verifyQuestions(root, [
      { text: "x", file: "nope.ts" },
      { text: "y", file: "a.ts", symbol: "ghost" },
    ]);
    expect(vs.map((v) => v.ok)).toEqual([false, false]);
  });
});

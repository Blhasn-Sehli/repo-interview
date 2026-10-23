import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyQuestions, type Question } from "../src/index.js";

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

describe("verifyQuestions fair mode", () => {
  const root = mkdtempSync(join(tmpdir(), "ri-fair-"));
  mkdirSync(join(root, "tests/unity/src"), { recursive: true });
  mkdirSync(join(root, "a"), { recursive: true });
  mkdirSync(join(root, "b"), { recursive: true });
  writeFileSync(join(root, "tests/unity/src/unity.h"), "#define UNITY_BEGIN() x\n");
  writeFileSync(join(root, "CurlFactory.php"), "class CurlFactory {\n  public function __construct() {}\n}\n");
  writeFileSync(join(root, "a/util.ts"), "export function a() {}\n");
  writeFileSync(join(root, "b/util.ts"), "export function b() {}\n");
  const files = ["tests/unity/src/unity.h", "CurlFactory.php", "a/util.ts", "b/util.ts"];
  const fair = (q: Question) => verifyQuestions(root, [q], { mode: "fair", files })[0];
  const strict = (q: Question) => verifyQuestions(root, [q])[0];

  it("resolves a path given without its folders when exactly one file matches", () => {
    const q = { text: "?", file: "unity.h", symbol: "UNITY_BEGIN" };
    expect(strict(q).ok).toBe(false);
    const v = fair(q);
    expect(v.ok).toBe(true);
    expect(v.question.file).toBe("tests/unity/src/unity.h");
    expect(v.rule).toBe("path-suffix");
  });

  it("rejects a folder-less path that matches more than one file", () => {
    expect(fair({ text: "?", file: "util.ts" }).reason).toBe("file not found: util.ts (2 files match)");
  });

  it("accepts Class::method when every part is in the file", () => {
    const q = { text: "?", file: "CurlFactory.php", symbol: "CurlFactory::__construct" };
    expect(strict(q).ok).toBe(false);
    expect(fair(q)).toMatchObject({ ok: true, rule: "qualified-symbol" });
    expect(fair({ ...q, symbol: "CurlFactory::ghost" }).ok).toBe(false);
  });

  it("still drops citations that are simply invented", () => {
    expect(fair({ text: "?", file: "src/click/context.py" }).ok).toBe(false);
    expect(fair({ text: "?", file: "CurlFactory.php", symbol: "Isolate" }).ok).toBe(false);
  });
});

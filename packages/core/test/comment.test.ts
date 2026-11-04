import { describe, expect, it } from "vitest";
import { COMMENT_MARKER, renderPrComment, type GenerateResult } from "../src/index.js";

const result = (kept: GenerateResult["kept"]): GenerateResult => ({ kept, dropped: [], asked: kept.length, strictKept: kept.length, fairKept: kept.length, rescued: [] });

describe("renderPrComment", () => {
  it("starts with a marker so the action can update its own comment", () => {
    const md = renderPrComment(result([{ text: "Why?", file: "a.ts" }]), { model: "qwen2.5-coder:3b" });
    expect(md.startsWith(COMMENT_MARKER)).toBe(true);
  });

  it("lists each question with its kind and a link to the cited file", () => {
    const md = renderPrComment(
      result([
        { text: "What does this add?", file: "src/a.ts", kind: "overview" },
        { text: "What if n is 0?", file: "src/a.ts", symbol: "retry", kind: "code" },
      ]),
      { model: "m", fileUrl: (f) => `https://example.com/blob/abc/${f}` },
    );
    expect(md).toContain("1. **[big picture]** What does this add?");
    expect(md).toContain("2. **[code]** What if n is 0?");
    expect(md).toContain("[`src/a.ts`](https://example.com/blob/abc/src/a.ts) › `retry`");
    expect(md).toMatch(/advisory/i);
  });

  it("neutralises @mentions and HTML from model text", () => {
    const md = renderPrComment(result([{ text: "Ping @octocat <img src=x onerror=alert(1)>", file: "a.ts" }]), { model: "m" });
    expect(md).not.toMatch(/@octocat/);
    expect(md).toContain("@​octocat");
    expect(md).not.toContain("<img");
    expect(md).toContain("&lt;img");
  });

  it("caps very long question text", () => {
    const md = renderPrComment(result([{ text: "x".repeat(5000), file: "a.ts" }]), { model: "m" });
    expect(md.length).toBeLessThan(1500);
  });

  it("says so when no question passed the checks", () => {
    const md = renderPrComment(result([]), { model: "m" });
    expect(md).toMatch(/No questions this time/);
  });
});

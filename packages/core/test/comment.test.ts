import { describe, expect, it } from "vitest";
import {
  COMMENT_MARKER,
  parseNumberedAnswers,
  readQuestionsFromComment,
  renderPrComment,
  renderScoreComment,
  SCORE_MARKER,
  type GenerateResult,
} from "../src/index.js";

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
    expect(md.length).toBeLessThan(2500); // visible text and the stored copy are both capped at 500
  });

  it("says so when no question passed the checks", () => {
    const md = renderPrComment(result([]), { model: "m" });
    expect(md).toMatch(/No questions this time/);
  });
});

describe("questions stored in the comment", () => {
  it("round-trips the questions, even with text that would end an HTML comment", () => {
    const kept = [
      { text: "Why --> this?", file: "a.ts", symbol: "f", kind: "code" as const },
      { text: "What does it add?", file: "README.md", kind: "overview" as const },
    ];
    const md = renderPrComment(result(kept), { model: "m" });
    expect(md.match(/-->/g)?.length).toBe(2); // the marker and the data block, nothing from the text
    expect(readQuestionsFromComment(md)).toEqual(kept);
  });

  it("returns nothing for a comment without data", () => {
    expect(readQuestionsFromComment("hello")).toEqual([]);
  });
});

describe("parseNumberedAnswers", () => {
  it("splits a reply into numbered answers, keeping multi-line answers together", () => {
    const reply = "Thanks!\n1. It validates input\nso NaN never reaches the prompt\n2) Throws an Error\n3 - because overview is part of count";
    expect(parseNumberedAnswers(reply, 3)).toEqual([
      "It validates input\nso NaN never reaches the prompt",
      "Throws an Error",
      "because overview is part of count",
    ]);
  });

  it("leaves missing answers empty and ignores numbers past the question count", () => {
    expect(parseNumberedAnswers("2. only the second\n7. ignored", 3)).toEqual(["", "only the second", ""]);
  });

  it("treats an unnumbered reply as the answer to a single question", () => {
    expect(parseNumberedAnswers("just text", 1)).toEqual(["just text"]);
    expect(parseNumberedAnswers("just text", 2)).toEqual(["", ""]);
  });
});

describe("renderScoreComment", () => {
  it("shows each score with feedback and a total, safely", () => {
    const md = renderScoreComment(
      [
        { question: { text: "Q1", file: "a.ts" }, answer: "x", score: 3, feedback: "Spot on." },
        { question: { text: "Q2", file: "a.ts" }, answer: "", score: 0, feedback: "No answer given. Ask @octocat" },
      ],
      { model: "m", author: "dev" },
    );
    expect(md.startsWith(SCORE_MARKER)).toBe(true);
    expect(md).toContain("3/6");
    expect(md).toContain("1. **3/3** Spot on.");
    expect(md).toContain("@\u200boctocat");
    expect(md).toMatch(/advisory/i);
  });
});

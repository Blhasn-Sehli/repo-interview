import type { GenerateResult } from "./generate.js";
import type { InterviewResult } from "./interview.js";
import type { Question } from "./verify.js";

/** Hidden marker so the action edits its own earlier comment instead of adding a new one per push. */
export const COMMENT_MARKER = "<!-- repo-interview:pr-questions -->";
/** Marker for the comment that scores the author's answers. */
export const SCORE_MARKER = "<!-- repo-interview:pr-scores -->";

// The questions travel inside the comment so the scoring run knows exactly what was asked.
// Base64 keeps model text from closing the HTML comment early.
const DATA_PREFIX = "<!-- repo-interview:questions ";

function questionsBlock(questions: Question[]): string {
  const data = questions.map(({ text, file, symbol, kind }) => ({ text: text.slice(0, 500), file: file.slice(0, 300), symbol: symbol?.slice(0, 200), kind }));
  return `${DATA_PREFIX}${Buffer.from(JSON.stringify(data), "utf8").toString("base64")} -->`;
}

/** The questions stored in a questions comment, or [] when it has none. */
export function readQuestionsFromComment(body: string): Question[] {
  const at = body.indexOf(DATA_PREFIX);
  if (at < 0) return [];
  const encoded = body.slice(at + DATA_PREFIX.length).split(" -->")[0];
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as Question[];
    return parsed.flatMap((q) => {
      if (typeof q?.text !== "string" || typeof q?.file !== "string") return [];
      const out: Question = { text: q.text, file: q.file };
      if (typeof q.symbol === "string") out.symbol = q.symbol;
      if (q.kind === "overview" || q.kind === "code") out.kind = q.kind;
      return [out];
    });
  } catch {
    return [];
  }
}

/**
 * Answers from a reply numbered "1.", "2)" or "3 -", one per question (empty when missing).
 * Lines after a number belong to that answer. An unnumbered reply counts only when there is one question.
 */
export function parseNumberedAnswers(reply: string, count: number): string[] {
  const answers: string[][] = Array.from({ length: count }, () => []);
  let current = -1;
  let numbered = false;
  for (const line of reply.split(/\r?\n/)) {
    const m = /^\s*(\d+)\s*[.):-]\s*(.*)$/.exec(line);
    if (m) {
      numbered = true;
      const n = Number(m[1]) - 1;
      current = n >= 0 && n < count ? n : -2;
      if (current >= 0) answers[current].push(m[2]);
    } else if (current >= 0) {
      answers[current].push(line);
    }
  }
  if (!numbered && count === 1) return [reply.trim()];
  return answers.map((a) => a.join("\n").trim());
}

export interface PrCommentOptions {
  /** model id shown in the footer */
  model: string;
  /** link for a cited file, e.g. its blob URL at the PR head */
  fileUrl?: (file: string) => string;
}

/**
 * Model text comes from a prompt that included the PR's own diff, so treat it as untrusted:
 * escape HTML, break @mentions (no pings to strangers), and cap the length.
 */
function safe(text: string, max: number): string {
  const short = text.length > max ? `${text.slice(0, max)}…` : text;
  return short
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/@(?=\w)/g, "@​")
    .replace(/\s+/g, " ")
    .trim();
}

const safeName = (s: string) => s.replace(/[`\r\n]/g, "").slice(0, 200);

export function renderPrComment(result: GenerateResult, opts: PrCommentOptions): string {
  const lines = [COMMENT_MARKER, "### 🧠 repo-interview: questions about this change", ""];
  if (!result.kept.length) {
    lines.push("No questions this time: none of the model's questions passed the citation checks.");
  } else {
    lines.push("Can you answer these about your own change? Reply in a comment, numbering your answers `1.`, `2.`, `3.`; you'll get a short score.", "");
    result.kept.forEach((q, i) => {
      const kind = q.kind === "overview" ? "**[big picture]** " : q.kind === "code" ? "**[code]** " : "";
      const file = safeName(q.file);
      const link = opts.fileUrl ? `[\`${file}\`](${encodeURI(opts.fileUrl(file))})` : `\`${file}\``;
      lines.push(`${i + 1}. ${kind}${safe(q.text, 500)}`, `   ${link}${q.symbol ? ` › \`${safeName(q.symbol)}\`` : ""}`);
    });
  }
  lines.push(
    "",
    `<sub>Advisory only: this never blocks the PR. Every question cites a file this PR changed, checked to exist. Model: \`${safeName(opts.model)}\`, run locally on the CI runner.</sub>`,
  );
  if (result.kept.length) lines.push(questionsBlock(result.kept));
  return lines.join("\n") + "\n";
}

/** Comment with a 0-3 score and feedback per answer. Feedback is model text, so it gets the same treatment. */
export function renderScoreComment(results: InterviewResult[], opts: { model: string; author: string }): string {
  const graded = results.filter((r) => r.score !== null);
  const total = graded.reduce((n, r) => n + r.score!, 0);
  const lines = [
    SCORE_MARKER,
    `### 🧠 repo-interview: scores for @​${safeName(opts.author)}'s answers`,
    "",
    `Total: **${total}/${graded.length * 3}**${graded.length < results.length ? ` (${results.length - graded.length} could not be graded)` : ""}.`,
    "",
  ];
  results.forEach((r, i) => lines.push(`${i + 1}. **${r.score ?? "n/a"}/3** ${safe(r.feedback, 400)}`));
  lines.push(
    "",
    `<sub>Advisory only: a conversation starter for the review, not proof either way. Graded against the cited code by \`${safeName(opts.model)}\`, run locally on the CI runner. Reply again to be re-scored.</sub>`,
  );
  return lines.join("\n") + "\n";
}

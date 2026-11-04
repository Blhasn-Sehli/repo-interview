import type { GenerateResult } from "./generate.js";

/** Hidden marker so the action edits its own earlier comment instead of adding a new one per push. */
export const COMMENT_MARKER = "<!-- repo-interview:pr-questions -->";

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
    lines.push("Can you answer these about your own change? Reply in a comment.", "");
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
  return lines.join("\n") + "\n";
}

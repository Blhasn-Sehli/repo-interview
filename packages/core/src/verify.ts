import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Question {
  text: string;
  /** file path (relative to repo root) the question cites */
  file: string;
  /** identifier (function/class/const) the question cites, if any */
  symbol?: string;
}

/** Which fair-mode rule rescued a citation the strict check rejected. */
export type FairRule = "path-suffix" | "qualified-symbol";

export interface Verdict {
  /** the question, with its file resolved to the full repo path when a fair rule did that */
  question: Question;
  ok: boolean;
  reason?: string;
  rule?: FairRule;
}

export interface VerifyOptions {
  /**
   * strict: the file path and the symbol text must appear exactly as cited.
   * fair: also accept a path given without its folders when exactly one repo file ends with it,
   * and `Class::method` / `Class.method` when every part appears in the file.
   */
  mode?: "strict" | "fair";
  /** repo-relative paths, needed by fair mode to resolve folder-less paths */
  files?: string[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const appears = (src: string, word: string) => new RegExp(`(?<![\\w$])${escape(word)}(?![\\w$])`).test(src);

/** Drop questions that cite files or symbols that do not exist (hallucination guard). */
export function verifyQuestions(root: string, questions: Question[], opts: VerifyOptions = {}): Verdict[] {
  const fair = opts.mode === "fair";
  return questions.map((question): Verdict => {
    let rule: FairRule | undefined;
    let file = question.file;

    if (!existsSync(join(root, file))) {
      if (!fair) return { question, ok: false, reason: `file not found: ${file}` };
      const suffix = "/" + file.replace(/^\.?\/+/, "");
      const matches = (opts.files ?? []).filter((f) => ("/" + f).endsWith(suffix));
      if (matches.length !== 1) {
        const note = matches.length > 1 ? ` (${matches.length} files match)` : "";
        return { question, ok: false, reason: `file not found: ${file}${note}` };
      }
      file = matches[0];
      rule = "path-suffix";
    }

    if (question.symbol) {
      const src = readFileSync(join(root, file), "utf8");
      if (!appears(src, question.symbol)) {
        const parts = question.symbol.split(/::|->|\.|#/).filter(Boolean);
        if (!fair || parts.length < 2 || !parts.every((p) => appears(src, p))) {
          return { question, ok: false, reason: `symbol not found: ${question.symbol}` };
        }
        rule ??= "qualified-symbol";
      }
    }

    return { question: file === question.file ? question : { ...question, file }, ok: true, rule };
  });
}

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Question {
  text: string;
  /** file path (relative to repo root) the question cites */
  file: string;
  /** identifier (function/class/const) the question cites, if any */
  symbol?: string;
}

export interface Verdict { question: Question; ok: boolean; reason?: string }

/** Drop questions that cite files or symbols that do not exist (hallucination guard). */
export function verifyQuestions(root: string, questions: Question[]): Verdict[] {
  return questions.map((question) => {
    const path = join(root, question.file);
    if (!existsSync(path)) return { question, ok: false, reason: `file not found: ${question.file}` };
    if (question.symbol) {
      const src = readFileSync(path, "utf8");
      const re = new RegExp(`\\b${question.symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      if (!re.test(src)) return { question, ok: false, reason: `symbol not found: ${question.symbol}` };
    }
    return { question, ok: true };
  });
}

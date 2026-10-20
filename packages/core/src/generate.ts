import type { CompletionRequest, ModelProvider } from "./providers.js";
import type { ScanResult } from "./scan.js";
import { verifyQuestions, type Question, type Verdict } from "./verify.js";

export interface GenerateOptions {
  /** how many questions to ask the model for */
  count?: number;
  /** cap on files listed in the prompt */
  maxFiles?: number;
}

export interface GenerateResult { kept: Question[]; dropped: Verdict[] }

const SYSTEM = [
  "You interview a developer about their own repository to check they understand it.",
  "Ask how and why questions about design decisions, control flow, error handling and trade-offs.",
  "Every question must cite exactly one file from the list, and a symbol from that file when it is about a symbol.",
  "Reply with only a JSON array of objects: {\"text\": string, \"file\": string, \"symbol\"?: string}.",
].join(" ");

export function buildPrompt(scan: ScanResult, opts: GenerateOptions = {}): CompletionRequest {
  const count = opts.count ?? 8;
  const files = scan.files
    .filter((f) => f.symbols.length > 0)
    .sort((a, b) => b.symbols.length - a.symbols.length)
    .slice(0, opts.maxFiles ?? 200);
  const listing = files.map((f) => `${f.path} (${f.language}): ${f.symbols.map((s) => s.name).join(", ")}`).join("\n");
  return { system: SYSTEM, prompt: `Files and their symbols:\n${listing}\n\nWrite ${count} questions.` };
}

/** Pull the question array out of a model reply, tolerating code fences and surrounding prose. */
export function parseQuestions(raw: string): Question[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end < start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item): Question[] => {
    if (typeof item?.text !== "string" || typeof item?.file !== "string") return [];
    const q: Question = { text: item.text, file: item.file };
    if (typeof item.symbol === "string" && item.symbol) q.symbol = item.symbol;
    return [q];
  });
}

/** Ask the provider for questions, then keep only those whose cited file and symbol exist. */
export async function generateQuestions(scan: ScanResult, provider: ModelProvider, opts: GenerateOptions = {}): Promise<GenerateResult> {
  const raw = await provider.complete(buildPrompt(scan, opts));
  const verdicts = verifyQuestions(scan.root, parseQuestions(raw));
  return {
    kept: verdicts.filter((v) => v.ok).map((v) => v.question),
    dropped: verdicts.filter((v) => !v.ok),
  };
}

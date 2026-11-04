#!/usr/bin/env node
import {
  anthropic,
  generateDiffQuestions,
  generateQuestions,
  ollama,
  openAICompatible,
  RecordedProvider,
  renderReport,
  runInterview,
  loadParsers,
  scanRepo,
  scoreAnswer,
  type GenerateOptions,
  type ModelProvider,
  type Question,
} from "@repo-interview/core";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

const USAGE = `repo-interview 0.0.0 (early: expect rough edges)

Usage:
  repo-interview scan <path> [--json]
  repo-interview questions <path> --provider <anthropic|openai|ollama> [options]
  repo-interview interview <path> --provider <anthropic|openai|ollama> [options]
  repo-interview pr <path> --provider <anthropic|openai|ollama> [--base <ref> | --diff-file <file>] [options]
      3 questions about only the code changed since <ref> (default main)

Options for questions and interview:
  --model <name>       model id (anthropic default: claude-opus-5-5)
  --base-url <url>     server for openai/ollama providers
  --count <n>          questions to request (default 8; pr: 3)
  --overview <n>       how many are big-picture (default about 40%)
  --record <dir>       save model responses to <dir>
  --replay <dir>       answer from saved responses only (no network)
  --json               print JSON instead of text
  --out <file>         interview report path (default interview-report.md)

openai reads OPENAI_API_KEY; anthropic reads ANTHROPIC_API_KEY.
Sent to the model: file paths, symbol names, short code excerpts (about 24 KB at most)
and, in an interview, your answers with the code each question cites.`;

const tag = (q: Question) => (q.kind === "overview" ? "[big picture] " : q.kind === "code" ? "[code] " : "");

/** A whole number from an option, or undefined when the option is absent; nonsense like "abc" is an error. */
function wholeNumber(name: string, value: string | boolean | undefined, min: number): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new Error(`--${name} must be a whole number of at least ${min}, got "${value}"`);
  return n;
}

function genOpts(values: Record<string, string | boolean | undefined>): GenerateOptions {
  const count = wholeNumber("count", values.count, 1);
  const overview = wholeNumber("overview", values.overview, 0);
  if (count !== undefined && overview !== undefined && overview > count) throw new Error(`--overview (${overview}) cannot be more than --count (${count})`);
  return { count, overview };
}

const LOCAL_MODEL_NOTE ="(A local model's first answer can take a few minutes while it loads; later ones are fast.)";

function provider(values: Record<string, string | boolean | undefined>): ModelProvider {
  if (typeof values.replay === "string") return new RecordedProvider(values.replay);
  const model = values.model as string | undefined;
  const baseURL = values["base-url"] as string | undefined;
  let p: ModelProvider;
  switch (values.provider) {
    case "anthropic":
      p = anthropic({ model });
      break;
    case "openai":
      if (!model) throw new Error("--model is required for the openai provider");
      p = openAICompatible({ baseURL: baseURL ?? "https://api.openai.com/v1", model, apiKey: process.env.OPENAI_API_KEY });
      break;
    case "ollama":
      if (!model) throw new Error("--model is required for the ollama provider");
      p = ollama({ model, baseURL });
      break;
    default:
      throw new Error("--provider must be anthropic, openai or ollama (or use --replay <dir>)");
  }
  return typeof values.record === "string" ? new RecordedProvider(values.record, p) : p;
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: "boolean" },
      provider: { type: "string" },
      model: { type: "string" },
      "base-url": { type: "string" },
      count: { type: "string" },
      overview: { type: "string" },
      record: { type: "string" },
      replay: { type: "string" },
      out: { type: "string" },
      base: { type: "string" },
      "diff-file": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, path] = positionals;
  if (values.help || !command || !path) {
    console.log(USAGE);
    return values.help ? 0 : 1;
  }
  await loadParsers();
  const scan = scanRepo(resolve(path));

  if (command === "scan") {
    if (values.json) {
      console.log(JSON.stringify(scan, null, 2));
    } else {
      for (const f of scan.files) console.log(`${f.path}  ${f.language}  ${f.symbols.map((s) => s.name).join(", ")}`);
      const symbols = scan.files.reduce((n, f) => n + f.symbols.length, 0);
      console.log(`\n${scan.files.length} files, ${symbols} symbols${scan.skipped ? `, ${scan.skipped} skipped` : ""}`);
    }
    return 0;
  }

  if (command === "questions") {
    const p = provider(values);
    if (p.id.includes("ollama:")) console.error(LOCAL_MODEL_NOTE);
    const result = await generateQuestions(scan, p, genOpts(values));
    if (values.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      result.kept.forEach((q, i) => console.log(`${i + 1}. ${tag(q)}${q.text}\n   ${q.file}${q.symbol ? ` › ${q.symbol}` : ""}`));
      const { asked, fairKept, strictKept } = result;
      const repeats = fairKept - result.kept.length;
      console.log(`\n${fairKept}/${asked} pass the fair check, ${strictKept}/${asked} pass the strict check${repeats ? ` (${repeats} repeated symbol${repeats > 1 ? "s" : ""} hidden)` : ""}`);
      for (const v of result.rescued) console.log(`  accepted by ${v.rule}: ${v.question.file}${v.question.symbol ? ` › ${v.question.symbol}` : ""}`);
      for (const v of result.dropped) console.log(`  dropped: ${v.reason}`);
    }
    return 0;
  }

  if (command === "pr") {
    const diff = values["diff-file"]
      ? readFileSync(values["diff-file"], "utf8")
      : execFileSync("git", ["-C", scan.root, "diff", "--unified=3", `${values.base ?? "main"}...HEAD`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (!diff.trim()) throw new Error(`no changes between ${values.base ?? "main"} and HEAD`);
    const p = provider(values);
    if (p.id.includes("ollama:")) console.error(LOCAL_MODEL_NOTE);
    const result = await generateDiffQuestions(scan, diff, p, { count: wholeNumber("count", values.count, 1) });
    if (values.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      result.kept.forEach((q, i) => console.log(`${i + 1}. ${tag(q)}${q.text}\n   ${q.file}${q.symbol ? ` › ${q.symbol}` : ""}`));
      console.log(`\n${result.kept.length} questions about this change (${result.strictKept}/${result.asked} pass the strict check)`);
      for (const v of result.dropped) console.log(`  dropped: ${v.reason}`);
    }
    return 0;
  }

  if (command === "interview") {
    const p = provider(values);
    console.log("Reading the repo and preparing questions...");
    if (p.id.includes("ollama:")) console.log(LOCAL_MODEL_NOTE);
    const { kept } = await generateQuestions(scan, p, genOpts(values));
    if (!kept.length) throw new Error("the model returned no usable questions; try again or another model");
    console.log(`${kept.length} questions. Answer in one line and press Enter (empty = skip).\n`);
    // Iterate lines instead of rl.question(): with piped input, question() drops lines read ahead of it.
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const lines = rl[Symbol.asyncIterator]();
    let n = 0;
    try {
      const results = await runInterview(kept, {
        ask: async (text) => {
          const isFollowUp = !kept.some((q) => q.text === text);
          const q = kept.find((k) => k.text === text);
          if (!isFollowUp) n++;
          const header = isFollowUp ? "  Follow-up: " : `Q${n}/${kept.length}. ${q ? tag(q) : ""}`;
          const cite = q ? `\n   ${q.file}${q.symbol ? ` › ${q.symbol}` : ""}` : "";
          process.stdout.write(`${header}${text}${cite}\n> `);
          const next = await lines.next();
          return next.done ? "" : next.value;
        },
        say: (text) => console.log(`  ${text}\n`),
        score: (q, answer, followUp) => scoreAnswer(scan.root, q, answer, p, followUp),
      });
      const out = resolve(values.out ?? "interview-report.md");
      writeFileSync(out, renderReport(basename(scan.root), results));
      const graded = results.filter((r) => r.score !== null);
      console.log(`Done: ${graded.reduce((s, r) => s + r.score!, 0)}/${graded.length * 3}. Report saved to ${out}`);
    } finally {
      rl.close();
    }
    return 0;
  }

  console.error(`unknown command: ${command}\n\n${USAGE}`);
  return 1;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    // Some network errors (AggregateError) have an empty message; never exit silently.
    const e = err as NodeJS.ErrnoException;
    console.error(e?.message || e?.code || String(err));
    process.exit(1);
  },
);

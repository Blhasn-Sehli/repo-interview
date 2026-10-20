#!/usr/bin/env node
import {
  anthropic,
  generateQuestions,
  ollama,
  openAICompatible,
  RecordedProvider,
  scanRepo,
  type ModelProvider,
} from "@repo-interview/core";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const USAGE = `repo-interview 0.0.0 (early skeleton)

Usage:
  repo-interview scan <path> [--json]
  repo-interview questions <path> --provider <anthropic|openai|ollama> [options]

Options for questions:
  --model <name>       model id (anthropic default: claude-opus-5-5)
  --base-url <url>     server for openai/ollama providers
  --count <n>          questions to request (default 8)
  --record <dir>       save model responses to <dir>
  --replay <dir>       answer from saved responses only (no network)
  --json               print JSON instead of text

openai reads OPENAI_API_KEY; anthropic reads ANTHROPIC_API_KEY.
Only file paths and symbol names are sent to the model at this stage.`;

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
      record: { type: "string" },
      replay: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, path] = positionals;
  if (values.help || !command || !path) {
    console.log(USAGE);
    return values.help ? 0 : 1;
  }
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
    const result = await generateQuestions(scan, provider(values), { count: values.count ? Number(values.count) : undefined });
    if (values.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      result.kept.forEach((q, i) => console.log(`${i + 1}. ${q.text}\n   ${q.file}${q.symbol ? ` › ${q.symbol}` : ""}`));
      console.log(`\n${result.kept.length} kept, ${result.dropped.length} dropped by the verifier`);
      for (const v of result.dropped) console.log(`  dropped: ${v.reason}`);
    }
    return 0;
  }

  console.error(`unknown command: ${command}\n\n${USAGE}`);
  return 1;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);

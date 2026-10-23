// Run question generation on every corpus repo and report how many cited files/symbols were real.
// Usage: node corpus/run.mjs --provider ollama --model qwen2.5-coder:3b [--count 8]
//        node corpus/run.mjs --replay corpus/recordings      (offline, from saved responses)
// Needs `pnpm build` first and the repos fetched with `node corpus/fetch.mjs`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { anthropic, generateQuestions, ollama, openAICompatible, RecordedProvider, scanRepo } from "../packages/core/dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({
  options: {
    provider: { type: "string" },
    model: { type: "string" },
    "base-url": { type: "string" },
    count: { type: "string", default: "8" },
    replay: { type: "string" },
  },
});

function makeProvider() {
  if (values.replay) return new RecordedProvider(values.replay);
  const { model } = values;
  const real =
    values.provider === "anthropic" ? anthropic({ model })
    : values.provider === "openai" ? openAICompatible({ baseURL: values["base-url"] ?? "https://api.openai.com/v1", model, apiKey: process.env.OPENAI_API_KEY })
    : values.provider === "ollama" ? ollama({ model, baseURL: values["base-url"] })
    : undefined;
  if (!real || (values.provider !== "anthropic" && !model)) throw new Error("pass --provider anthropic|openai|ollama (and --model), or --replay <dir>");
  // Always record, so every published number can be re-checked offline.
  return new RecordedProvider(join(here, "recordings"), real);
}

const provider = makeProvider();
const entries = JSON.parse(readFileSync(join(here, "corpus.json"), "utf8"));
const rows = [];
for (const { repo, commit } of entries) {
  const root = join(here, "repos", repo.replace("/", "__"));
  try {
    const { kept, dropped, strictKept, rescued } = await generateQuestions(scanRepo(root), provider, { count: Number(values.count) });
    rows.push({
      repo,
      commit,
      asked: kept.length + dropped.length,
      strict: strictKept,
      fair: kept.length,
      rescued: rescued.map((v) => `${v.rule}: ${v.question.file}${v.question.symbol ? ` › ${v.question.symbol}` : ""}`),
      dropped: dropped.map((v) => v.reason),
      questions: kept,
    });
  } catch (err) {
    rows.push({ repo, commit, error: err instanceof Error ? err.message : String(err) });
  }
  const r = rows.at(-1);
  console.log(r.error ? `${repo}: ERROR ${r.error}` : `${repo}: strict ${r.strict}/${r.asked}, fair ${r.fair}/${r.asked}`);
}

const ok = rows.filter((r) => !r.error);
const sum = (key) => ok.reduce((n, r) => n + r[key], 0);
const asked = sum("asked");
const pct = (n) => (asked ? `${((100 * n) / asked).toFixed(1)}%` : "n/a");
const summary = {
  provider: provider.id,
  date: new Date().toISOString().slice(0, 10),
  repos: ok.length,
  asked,
  strict: sum("strict"),
  fair: sum("fair"),
  strictShare: asked ? sum("strict") / asked : null,
  fairShare: asked ? sum("fair") / asked : null,
};
console.log(`\nAcross ${ok.length} repos, questions citing real code:`);
console.log(`  strict (exact path and symbol): ${summary.strict}/${asked} (${pct(summary.strict)})`);
console.log(`  fair (folder-less paths, Class::method): ${summary.fair}/${asked} (${pct(summary.fair)})`);

if (!ok.length) process.exit(1);
mkdirSync(join(here, "results"), { recursive: true });
const out = join(here, "results", `${summary.date}.json`);
writeFileSync(out, JSON.stringify({ summary, rows }, null, 2) + "\n");
console.log(`saved ${out}`);

// Run question generation on every corpus repo and report how many cited files/symbols were real.
// Usage: node corpus/run.mjs --provider ollama --model qwen2.5-coder:3b [--count 8] [--runs 3]
//        node corpus/run.mjs --replay corpus/recordings [--runs 3]   (offline, from saved responses)
// Needs `pnpm build` first and the repos fetched with `node corpus/fetch.mjs`.
// A single run is one sample per repo and moves by several points; --runs N repeats the whole
// corpus N times (each run has its own recordings) and reports the average, lowest and highest.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { anthropic, generateQuestions, ollama, openAICompatible, loadParsers, RecordedProvider, scanRepo } from "../packages/core/dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({
  options: {
    provider: { type: "string" },
    model: { type: "string" },
    "base-url": { type: "string" },
    count: { type: "string", default: "8" },
    runs: { type: "string", default: "1" },
    replay: { type: "string" },
  },
});

function realProvider() {
  const { model } = values;
  const real =
    values.provider === "anthropic" ? anthropic({ model })
    : values.provider === "openai" ? openAICompatible({ baseURL: values["base-url"] ?? "https://api.openai.com/v1", model, apiKey: process.env.OPENAI_API_KEY })
    : values.provider === "ollama" ? ollama({ model, baseURL: values["base-url"] })
    : undefined;
  if (!real || (values.provider !== "anthropic" && !model)) throw new Error("pass --provider anthropic|openai|ollama (and --model), or --replay <dir>");
  return real;
}

// Always record, so every published number can be re-checked offline.
const makeProvider = (run) =>
  values.replay ? new RecordedProvider(values.replay, undefined, { run }) : new RecordedProvider(join(here, "recordings"), realProvider(), { run });

async function runCorpus(provider, label) {
  const entries = JSON.parse(readFileSync(join(here, "corpus.json"), "utf8"));
  const rows = [];
  for (const { repo, commit } of entries) {
    const root = join(here, "repos", repo.replace("/", "__"));
    try {
      const { kept, dropped, asked, strictKept, fairKept, rescued } = await generateQuestions(scanRepo(root), provider, { count: Number(values.count) });
      rows.push({
        repo,
        commit,
        asked,
        strict: strictKept,
        fair: fairKept,
        rescued: rescued.map((v) => `${v.rule}: ${v.question.file}${v.question.symbol ? ` › ${v.question.symbol}` : ""}`),
        dropped: dropped.map((v) => v.reason),
        questions: kept,
      });
    } catch (err) {
      rows.push({ repo, commit, error: err instanceof Error ? err.message : String(err) });
    }
    const r = rows.at(-1);
    console.log(`${label}${r.error ? `${repo}: ERROR ${r.error}` : `${repo}: strict ${r.strict}/${r.asked}, fair ${r.fair}/${r.asked}`}`);
  }
  const ok = rows.filter((r) => !r.error);
  const sum = (key) => ok.reduce((n, r) => n + r[key], 0);
  const asked = sum("asked");
  return {
    summary: { repos: ok.length, asked, strict: sum("strict"), fair: sum("fair"), strictShare: asked ? sum("strict") / asked : null, fairShare: asked ? sum("fair") / asked : null },
    rows,
  };
}

const pct = (x) => (x === null ? "n/a" : `${(100 * x).toFixed(1)}%`);
const runCount = Number(values.runs);
if (!Number.isInteger(runCount) || runCount < 1) throw new Error(`--runs must be a whole number of at least 1, got "${values.runs}"`);

await loadParsers();
const runs = [];
for (let run = 1; run <= runCount; run++) {
  const provider = makeProvider(run);
  const result = await runCorpus(provider, runCount > 1 ? `[run ${run}] ` : "");
  runs.push({ run, provider: provider.id, ...result });
}

const complete = runs.filter((r) => r.summary.repos > 0);
const stat = (key) => {
  const xs = complete.map((r) => r.summary[key]).filter((x) => x !== null);
  return xs.length ? { mean: xs.reduce((a, b) => a + b, 0) / xs.length, min: Math.min(...xs), max: Math.max(...xs) } : null;
};
const summary = { date: new Date().toISOString().slice(0, 10), runs: complete.length, strict: stat("strictShare"), fair: stat("fairShare") };

console.log(`\nQuestions citing real code, ${complete.length} run(s) over ${complete[0]?.summary.repos ?? 0} repos:`);
for (const r of complete) console.log(`  run ${r.run}: strict ${r.summary.strict}/${r.summary.asked} (${pct(r.summary.strictShare)}), fair ${r.summary.fair}/${r.summary.asked} (${pct(r.summary.fairShare)})`);
if (complete.length > 1) {
  for (const key of ["strict", "fair"]) {
    const s = summary[key];
    if (s) console.log(`  ${key} average ${pct(s.mean)} (lowest ${pct(s.min)}, highest ${pct(s.max)})`);
  }
}

if (!complete.length) process.exit(1);
mkdirSync(join(here, "results"), { recursive: true });
// One file per invocation (date and time), so a second run on the same day never overwrites the first.
const out = join(here, "results", `${new Date().toISOString().slice(0, 16).replace(":", "")}.json`);
writeFileSync(out, JSON.stringify(runCount === 1 ? { summary: { ...runs[0].summary, provider: runs[0].provider, date: summary.date }, rows: runs[0].rows } : { summary, runs }, null, 2) + "\n");
console.log(`saved ${out}`);

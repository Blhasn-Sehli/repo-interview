// Runs inside the GitHub Action: questions about the PR's diff, then one comment on the PR.
// Advisory by design: any failure becomes a warning and the step still succeeds.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const core = await import(pathToFileURL(join(here, "..", "packages", "core", "dist", "index.js")).href);
const { COMMENT_MARKER, generateDiffQuestions, ollama, renderPrComment, scanRepo } = core;

const env = process.env;
const warn = (msg) => console.log(`::warning title=repo-interview::${msg.replace(/\r?\n/g, " ")}`);
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/** The PR's own changes: on a pull_request checkout HEAD is a merge commit whose first parent is the base. */
function prDiff(event) {
  const parents = git("rev-list", "--parents", "-n", "1", "HEAD").trim().split(" ").length - 1;
  if (parents >= 2) return git("diff", "--unified=3", "HEAD^1", "HEAD");
  const base = event.pull_request?.base?.sha;
  if (!base) throw new Error("not a pull_request event, and HEAD is not a merge commit");
  return git("diff", "--unified=3", `${base}...HEAD`);
}

async function github(method, path, body) {
  const res = await fetch(`${env.GITHUB_API_URL ?? "https://api.github.com"}${path}`, {
    method,
    headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw Object.assign(new Error(`${method} ${path} returned ${res.status}`), { status: res.status });
  return res.json();
}

/** Edit our earlier comment if there is one, so a PR gets one comment, not one per push. */
async function upsertComment(repo, number, body) {
  const comments = await github("GET", `/repos/${repo}/issues/${number}/comments?per_page=100`);
  const mine = comments.find((c) => c.user?.type === "Bot" && c.body?.startsWith(COMMENT_MARKER));
  if (mine) await github("PATCH", `/repos/${repo}/issues/comments/${mine.id}`, { body });
  else await github("POST", `/repos/${repo}/issues/${number}/comments`, { body });
}

try {
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  const pr = event.pull_request;
  const diff = prDiff(event);
  if (!diff.trim()) {
    console.log("No changes to ask about.");
    process.exit(0);
  }
  const started = Date.now();
  const result = await generateDiffQuestions(scanRepo(process.cwd()), diff, ollama({ model: env.MODEL }), { count: Number(env.COUNT || 3) });
  console.log(`Model answered in ${Math.round((Date.now() - started) / 1000)} s: ${result.kept.length} question(s) kept, ${result.dropped.length} dropped.`);
  for (const v of result.dropped) console.log(`  dropped: ${v.reason}`);

  const headRepo = pr?.head?.repo?.full_name ?? env.GITHUB_REPOSITORY;
  const headSha = pr?.head?.sha ?? env.GITHUB_SHA;
  const body = renderPrComment(result, { model: env.MODEL, fileUrl: (f) => `${env.GITHUB_SERVER_URL}/${headRepo}/blob/${headSha}/${f}` });
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, body);

  if (pr) {
    try {
      await upsertComment(env.GITHUB_REPOSITORY, pr.number, body);
      console.log(`Commented on #${pr.number}.`);
    } catch (err) {
      // Pull requests from forks get a read-only token; the questions are still in the job summary.
      warn(err.status === 403 ? "no permission to comment (fork PRs get a read-only token); see the job summary" : `could not comment: ${err.message}`);
    }
  }
} catch (err) {
  warn(`skipped: ${err instanceof Error ? err.message : String(err)}`);
}

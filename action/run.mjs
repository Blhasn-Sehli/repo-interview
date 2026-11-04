// Runs inside the GitHub Action.
//   pull_request:  questions about the PR's diff, posted as one comment.
//   issue_comment: when the PR's author replies with numbered answers, score them in a second comment.
// Advisory by design: any failure becomes a warning and the step still succeeds.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const core = await import(pathToFileURL(join(here, "..", "packages", "core", "dist", "index.js")).href);
const {
  COMMENT_MARKER,
  SCORE_MARKER,
  generateDiffQuestions,
  ollama,
  parseNumberedAnswers,
  readQuestionsFromComment,
  renderPrComment,
  renderScoreComment,
  loadParsers,
  scanRepo,
  scoreAnswer,
} = core;

const env = process.env;
const warn = (msg) => console.log(`::warning title=repo-interview::${msg.replace(/\r?\n/g, " ")}`);
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const provider = () => ollama({ model: env.MODEL });

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

const listComments = (repo, number) => github("GET", `/repos/${repo}/issues/${number}/comments?per_page=100`);
const ours = (comments, marker) => comments.find((c) => c.user?.type === "Bot" && c.body?.startsWith(marker));

/** Edit our earlier comment with this marker if there is one, so a PR gets one of each, not one per run. */
async function upsertComment(repo, number, marker, body) {
  const mine = ours(await listComments(repo, number), marker);
  if (mine) await github("PATCH", `/repos/${repo}/issues/comments/${mine.id}`, { body });
  else await github("POST", `/repos/${repo}/issues/${number}/comments`, { body });
}

async function postOrWarn(repo, number, marker, body) {
  try {
    await upsertComment(repo, number, marker, body);
    console.log(`Commented on #${number}.`);
  } catch (err) {
    // Pull requests from forks get a read-only token; the text is still in the job summary.
    warn(err.status === 403 ? "no permission to comment (fork PRs get a read-only token); see the job summary" : `could not comment: ${err.message}`);
  }
}

async function askQuestions(event) {
  const pr = event.pull_request;
  const diff = prDiff(event);
  if (!diff.trim()) return console.log("No changes to ask about.");
  const started = Date.now();
  const result = await generateDiffQuestions(scanRepo(process.cwd()), diff, provider(), { count: Number(env.COUNT || 3) });
  console.log(`Model answered in ${Math.round((Date.now() - started) / 1000)} s: ${result.kept.length} question(s) kept, ${result.dropped.length} dropped.`);
  for (const v of result.dropped) console.log(`  dropped: ${v.reason}`);

  const headRepo = pr?.head?.repo?.full_name ?? env.GITHUB_REPOSITORY;
  const headSha = pr?.head?.sha ?? env.GITHUB_SHA;
  const body = renderPrComment(result, { model: env.MODEL, fileUrl: (f) => `${env.GITHUB_SERVER_URL}/${headRepo}/blob/${headSha}/${f}` });
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, body);
  if (pr) await postOrWarn(env.GITHUB_REPOSITORY, pr.number, COMMENT_MARKER, body);
}

async function scoreReply(event) {
  const { issue, comment } = event;
  if (!issue?.pull_request) return console.log("Not a pull request comment.");
  if (comment?.user?.login !== issue.user?.login) return console.log("Only the PR's author's replies are scored.");
  if (comment.body?.startsWith(COMMENT_MARKER) || comment.body?.startsWith(SCORE_MARKER)) return;

  const asked = ours(await listComments(env.GITHUB_REPOSITORY, issue.number), COMMENT_MARKER);
  const questions = asked ? readQuestionsFromComment(asked.body) : [];
  if (!questions.length) return console.log("No questions to score against on this PR.");
  const answers = parseNumberedAnswers(comment.body, questions.length);
  if (answers.every((a) => !a)) return console.log("The reply has no numbered answers; nothing to score.");

  // Read the PR's code at its head into a separate folder. It is only read as data, never run.
  const dir = join(env.RUNNER_TEMP ?? ".", "repo-interview-pr-head");
  git("fetch", "--no-tags", "--depth=1", "origin", `refs/pull/${issue.number}/head`);
  git("worktree", "add", "--detach", "--force", dir, "FETCH_HEAD");

  const results = [];
  for (const [i, q] of questions.entries()) {
    const s = await scoreAnswer(dir, q, answers[i], provider());
    results.push({ question: q, answer: answers[i], score: s.score, feedback: s.feedback });
  }
  const body = renderScoreComment(results, { model: env.MODEL, author: comment.user.login });
  console.log(`Scored ${results.length} answer(s).`);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, body);
  await postOrWarn(env.GITHUB_REPOSITORY, issue.number, SCORE_MARKER, body);
}

try {
  await loadParsers();
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  if (env.GITHUB_EVENT_NAME === "issue_comment") await scoreReply(event);
  else await askQuestions(event);
} catch (err) {
  warn(`skipped: ${err instanceof Error ? err.message : String(err)}`);
}

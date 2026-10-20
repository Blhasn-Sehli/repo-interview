// Clone every corpus repo into corpus/repos/<owner>__<name> at its pinned commit.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entries = JSON.parse(readFileSync(join(here, "corpus.json"), "utf8"));
const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "inherit" });

for (const { repo, commit } of entries) {
  const dir = join(here, "repos", repo.replace("/", "__"));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    git(dir, "init", "-q");
    git(dir, "remote", "add", "origin", `https://github.com/${repo}.git`);
  }
  git(dir, "fetch", "-q", "--depth", "1", "origin", commit);
  git(dir, "checkout", "-q", "FETCH_HEAD");
  console.log(`${repo} @ ${commit.slice(0, 7)}`);
}

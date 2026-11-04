# repo-interview

Interviews you about your own repo (or a PR diff) so you can prove you understand the code. Questions cite real files and symbols; a verifier drops any that do not exist.

## Status

Early, rough edges expected. What works today:

- `repo-interview scan <path>` lists source files and candidate symbols (regex-based, 8 language families).
- `repo-interview questions <path> --provider anthropic|openai|ollama` asks a model for questions and drops any whose cited file or symbol does not exist (strict and fair checks, see the [test corpus](corpus/README.md)).
- Questions come in two kinds: big-picture (what the project or feature does, its main parts, why it is built this way) and code. By default 3 of 8 are big-picture; change it with `--overview <n>`.
- `repo-interview pr <path> --base <ref>` asks 3 questions about only the code a change touched: 1 about what it adds and why, 2 about the code.
- `repo-interview interview <path> --provider ...` asks the questions in your terminal, grades each answer 0-3 against the cited code, asks one follow-up after a weak answer, and writes `interview-report.md` with what to study next.
- `--record <dir>` / `--replay <dir>` save and replay model responses, so tests run offline.

Measured so far: on 10 public repos with a small local model, 91.3% of questions cite real code under both the strict and the fair check ([details](corpus/README.md#results)). Grading quality has not been measured yet; with small local models it is rough.

Not built yet: scoring the author's reply to the PR comment, tree-sitter symbol lookup, multi-line answers.

## On pull requests (GitHub Action)

Posts one comment with 3 questions about the PR's own change. It runs a small model with Ollama on the GitHub runner: free, no API key, and the code stays on the runner. It is advisory and never fails the PR.

```yaml
name: PR questions
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  questions:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 2
      - uses: Blhasn-Sehli/repo-interview@main
```

On this repo's first run the whole step, including installing Ollama and downloading the model, took 86 seconds, of which the model took 45. Pull requests from forks get a read-only token, so their questions go to the job summary instead of a comment.

## Try it

```bash
pnpm install && pnpm build
node packages/cli/dist/index.js scan .
node packages/cli/dist/index.js interview . --provider ollama --model qwen2.5-coder:3b
```

## License

MIT

# Contributing

Thanks for helping. Small, focused pull requests are the easiest to review and merge.

## Setup

You need Node.js 22 or newer and pnpm.

```bash
pnpm install
pnpm build
pnpm test
```

Tests run offline: model calls in tests use stubs or recorded replies, so no API key or Ollama is needed. To try the CLI against a real model, install [Ollama](https://ollama.com) and see [TESTING.md](TESTING.md).

## Layout

- `packages/core`: scanning (regex patterns plus tree-sitter for TypeScript, JavaScript and Python), prompts, the verifier, interviews, PR diffs and comments.
- `packages/cli`: the `repo-interview` command.
- `action.yml`, `action/run.mjs`: the GitHub Action.
- `corpus/`: 10 pinned public repositories, the runner that measures how often questions cite real code, and the recorded model replies behind every published number.

## Before you open a pull request

- Open an issue first for anything bigger than a small fix, so we can agree on the approach.
- Add or update tests for any change in behaviour; write the failing test first when you fix a bug.
- Run `pnpm build && pnpm typecheck && pnpm test`; CI runs the same.
- If you change prompts or the scanner, rerun the corpus (`node corpus/run.mjs --provider ollama --model qwen2.5-coder:3b --runs 3`) and include the before and after numbers.
- Never put a number in a README or post that was not measured, and say how it was measured.

## AI-assisted contributions

Welcome, on one condition: you understand every line you submit and have run it. Fittingly, this project exists because people ship code they cannot explain.

## Conduct

Be kind, be specific, assume good faith.

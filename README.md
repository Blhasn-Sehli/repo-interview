# repo-interview

Interviews you about your own repo (or a PR diff) so you can prove you understand the code. Questions cite real files and symbols; a verifier drops any that do not exist.

## Status

Early, rough edges expected. What works today:

- `repo-interview scan <path>` lists source files and candidate symbols (regex-based, 8 language families).
- `repo-interview questions <path> --provider anthropic|openai|ollama` asks a model for questions and drops any whose cited file or symbol does not exist (strict and fair checks, see the [test corpus](corpus/README.md)).
- `repo-interview interview <path> --provider ...` asks the questions in your terminal, grades each answer 0-3 against the cited code, asks one follow-up after a weak answer, and writes `interview-report.md` with what to study next.
- `--record <dir>` / `--replay <dir>` save and replay model responses, so tests run offline.

Measured so far: on 10 public repos with a small local model, 80% of questions cite real code under the strict check and 95% under the fair check ([details](corpus/README.md#results)). Grading quality has not been measured yet; with small local models it is rough.

Not built yet: the PR gate Action, tree-sitter symbol lookup, multi-line answers.

## Try it

```bash
pnpm install && pnpm build
node packages/cli/dist/index.js scan .
node packages/cli/dist/index.js interview . --provider ollama --model qwen2.5-coder:3b
```

## License

MIT

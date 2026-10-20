# repo-interview

Interviews you about your own repo (or a PR diff) so you can prove you understand the code. Questions cite real files and symbols; a verifier drops any that do not exist.

## Status

Early skeleton, not usable yet. What works today:

- `repo-interview scan <path>` lists source files and candidate symbols (regex-based, 8 language families).
- `repo-interview questions <path> --provider anthropic|openai|ollama` asks a model for questions and drops any whose cited file or symbol does not exist. Only file paths and symbol names are sent to the model so far; no code excerpts yet.
- `--record <dir>` / `--replay <dir>` save and replay model responses, so tests run offline.

Not built yet: the interview session, answer scoring, the report, the PR gate Action, tree-sitter symbol lookup. No accuracy numbers are published yet; they will come from the [test corpus](corpus/README.md).

## Try it

```bash
pnpm install && pnpm build
node packages/cli/dist/index.js scan .
node packages/cli/dist/index.js questions . --provider ollama --model qwen2.5-coder
```

## License

MIT

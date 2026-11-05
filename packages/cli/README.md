# repo-interview

Interviews you about your own repo or pull request, so you can prove you understand the code. Every question cites a real file and symbol; a verifier drops any question that cites code that does not exist.

Runs on a free local model with [Ollama](https://ollama.com), so your code stays on your machine.

## Quick start

```bash
ollama pull qwen2.5-coder:3b
npx repo-interview interview . --provider ollama --model qwen2.5-coder:3b
```

Answer each question on one line; at the end `interview-report.md` lists your score and what to study next.

## Commands

- `repo-interview interview <path>`: questions in your terminal, each answer graded 0-3, one follow-up after a weak answer, then a report.
- `repo-interview questions <path>`: just the questions (3 big-picture and 5 about code by default; `--overview <n>` to change).
- `repo-interview pr <path> --base main`: 3 questions about only the code changed since `main`.
- `repo-interview scan <path>`: the files and symbols questions can cite.

Providers: `--provider ollama` (local), `anthropic` (`ANTHROPIC_API_KEY`) or `openai` (any OpenAI-compatible server, `OPENAI_API_KEY`).

There is also a GitHub Action that asks the questions on every pull request. See the [project README](https://github.com/Blhasn-Sehli/repo-interview#readme) for it, for measured accuracy, and for how it stays safe with untrusted code.

MIT license.

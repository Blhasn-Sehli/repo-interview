# repo-interview

Interviews you about your own repo or pull request, so you can prove you understand the code. Every question cites a real file and symbol; a verifier drops any question that cites code that does not exist.

Runs on a free local model with [Ollama](https://ollama.com), so your code stays on your machine.

## Quick start

```bash
ollama pull qwen2.5-coder:3b
npx repo-interview interview . --provider ollama --model qwen2.5-coder:3b
```

Answer each question on one line; at the end `interview-report.md` lists your score and what to study next.

## Inside Claude (MCP): no Ollama needed

Let Claude (or any MCP client) run the interview with its own model, while repo-interview keeps it honest:

```bash
claude mcp add repo-interview -- npx -y repo-interview mcp
```

Then, in your project, ask Claude to "interview me about this repo", or use the `interview` prompt (`pr_interview` for the current branch). Claude reads the code and writes and grades the questions; repo-interview's tools list what exists (`scan_repo`), show the cited code (`read_code`), list a branch's changes (`pr_changes`) and drop any question about code that does not exist (`check_questions`). The tools only read files, never run them, and refuse paths outside the project.

## Commands

- `repo-interview interview <path>`: questions in your terminal, each answer graded 0-3, one follow-up after a weak answer, then a report.
- `repo-interview questions <path>`: just the questions (3 big-picture and 5 about code by default; `--overview <n>` to change).
- `repo-interview pr <path> --base main`: 3 questions about only the code changed since `main`.
- `repo-interview scan <path>`: the files and symbols questions can cite.
- `repo-interview mcp`: run as an MCP server (see above).

Providers: `--provider ollama` (local), `anthropic` (`ANTHROPIC_API_KEY`) or `openai` (any OpenAI-compatible server, `OPENAI_API_KEY`).

There is also a GitHub Action that asks the questions on every pull request. See the [project README](https://github.com/Blhasn-Sehli/repo-interview#readme) for it, for measured accuracy, and for how it stays safe with untrusted code.

MIT license.

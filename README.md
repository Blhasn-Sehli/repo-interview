# repo-interview

**Can you explain your own code?** repo-interview reads your repository or pull request and asks you the questions an interviewer or reviewer would: what it does, why it is built this way, and how specific code works. Then it grades your answers and tells you what to study.

Every question cites a real file and symbol. A verifier checks each citation and drops any question about code that does not exist, so the model cannot quiz you on something it made up. It runs on a free local model, so your code stays on your machine.

## Who it is for

- **Students and job seekers** preparing to explain a portfolio project, especially one built with AI help.
- **Developers** who want to check they really understand a codebase before they own it.
- **Teams** who want authors to explain their own pull requests (advisory, never blocking).

## Quick start (terminal)

```bash
ollama pull qwen2.5-coder:3b
npx repo-interview interview . --provider ollama --model qwen2.5-coder:3b
```

You get 8 questions (3 big-picture, 5 about specific code). Answer each on one line; a weak answer gets one follow-up. At the end `interview-report.md` shows your score and links to the files to study.

Needs Node.js 22+ and [Ollama](https://ollama.com). Until the npm release is out, build from source: see [TESTING.md](TESTING.md).

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

To score the author's answers, add a second workflow. When the PR's author replies with numbered answers (`1.`, `2.`, `3.`), it grades each one 0-3 against the cited code and posts one scores comment, edited again if they reply again. The PR's code is fetched into a separate folder and only read, never run.

```yaml
name: PR answers
on:
  issue_comment:
    types: [created]
permissions:
  contents: read
  pull-requests: write
jobs:
  score:
    if: github.event.issue.pull_request && github.event.comment.user.login == github.event.issue.user.login
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: Blhasn-Sehli/repo-interview@main
```

## Commands

| Command | What it does |
| --- | --- |
| `interview <path>` | Questions in your terminal, each answer graded 0-3, one follow-up after a weak answer, then a report |
| `questions <path>` | Just the questions; `--overview <n>` sets how many are big-picture |
| `pr <path> --base main` | 3 questions about only the code changed since `main` (1 about what it adds, 2 about code) |
| `scan <path>` | The files and symbols questions can cite |

Providers: `--provider ollama` (local, free), `anthropic` (`ANTHROPIC_API_KEY`) or `openai` (any OpenAI-compatible server, `OPENAI_API_KEY`). `--record <dir>` and `--replay <dir>` save and replay model replies, so runs can be checked offline.

## How well it works (measured)

On 10 public repositories in 10 languages, with the small local model `qwen2.5-coder:3b`, an average of 3 runs has **90.7%** of generated questions citing real code under the strict check (runs ranged 86.3-95.8%) and **92.8%** under the fair check. The verifier removes the rest before you see them. Every number comes with its recorded model replies, so you can recheck it offline: see the [test corpus](corpus/README.md#results).

Not measured yet: how well grading agrees with a human, and how useful testers find the questions. Both are in progress.

## How it is different

Other tools also ask authors about their code or pull requests, for example comprehension-gate, PR Guard, CCG, Gater, churn interview and PathFinder. repo-interview's focus:

- **Checked citations.** A question reaches you only if the file and symbol it cites exist (and, for a PR, were changed by it), and the rate is measured and published.
- **Local and free by default.** Ollama on your machine or on the GitHub runner; no account, no API key, no code sent anywhere.
- **For learning, not only gating.** The terminal interview ends with a report of what to study, which suits students and job interview practice.

## Status

Early: expect rough edges. Symbols come from tree-sitter for TypeScript, JavaScript and Python and from patterns for Go, Rust, Java, Kotlin, C#, C/C++, Ruby and PHP. Answers in the terminal are one line each. See [SECURITY.md](SECURITY.md) for how it handles untrusted code, and [CONTRIBUTING.md](CONTRIBUTING.md) to help.

## License

MIT

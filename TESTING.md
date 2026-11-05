# Testing repo-interview

Thanks for trying it. It takes about 20 minutes. Pick **one** of the two ways below, then send feedback (the last section).

Everything runs on a local model with [Ollama](https://ollama.com), so **your code never leaves your machine** (or, for way 2, GitHub's runner). No account or API key needed.

## Way 1: an interview in your terminal (about 20 minutes)

You need Node.js 22 or newer and Ollama.

1. Install Ollama from https://ollama.com, open it, then download the model (about 2 GB, once):
   ```bash
   ollama pull qwen2.5-coder:3b
   ```
2. Go into **one of your own projects** and start the interview:
   ```bash
   cd /path/to/your/project
   npx repo-interview interview . --provider ollama --model qwen2.5-coder:3b
   ```
   - The first question can take a few minutes while the model loads.
   - Answer each question on one line and press Enter; press Enter alone to skip.
   - At the end, `interview-report.md` (in your project folder) lists your score and what to study next.

## Way 2: questions on your pull requests (no install)

In one of your GitHub repos, copy the two workflow files from the [README](README.md#on-pull-requests-github-action) into `.github/workflows/`. Then open a pull request: within about two minutes a comment asks you three questions about your change. Reply with numbered answers (`1.`, `2.`, `3.`) to get a score.

## Feedback

Please [open a "Tester feedback" issue](https://github.com/Blhasn-Sehli/repo-interview/issues/new?template=tester-feedback.md), or send the same answers by message. It asks:

1. How useful were the questions, from 1 (useless) to 5 (I'd want these in a real interview or review)?
2. Which question was the best, and which was the worst?
3. Did any score feel unfair? Which one, and why?
4. What confused you or broke during setup?
5. Would you use it again? For what?

Honest "this was useless" answers help as much as praise.

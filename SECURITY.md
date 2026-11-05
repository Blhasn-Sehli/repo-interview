# Security

## Reporting a problem

Please do not open a public issue for a security problem. Use **Security → Report a vulnerability** on this repository's GitHub page, which sends a private report. You should get a first reply within a week.

## What repo-interview does to stay safe

repo-interview reads code that may be hostile (a pull request from a stranger, or a repository you just cloned) and sends parts of it to a language model. These are the rules it follows; a way around any of them is a security bug.

- **Code is data.** Repository files and diffs are read as text and never run. The prompts tell the model that code, READMEs and diffs are data, not instructions.
- **The verifier limits what the model can make us say.** A question is shown only if the file it cites exists (and, for a pull request, was changed by it). Model text cannot add files or links outside the repository.
- **PR comments are sanitised.** Model text in comments has HTML escaped, `@mentions` broken (so nobody gets pinged) and a length cap.
- **The GitHub Action never runs pull request code.** Questions are generated from the diff; when the author's reply is scored, the PR's code is fetched into a separate folder and only read. The scoring workflow checks out the default branch, not the PR.
- **It never blocks a pull request.** Failures become warnings, so a broken model or a hostile diff cannot hold up a merge.
- **Local by default.** With Ollama, code stays on your machine or the CI runner. With a hosted provider (Anthropic, OpenAI-compatible), file paths, symbol names, short code excerpts and, in an interview, your answers are sent to that provider.
- **Pinned downloads.** The Action installs a pinned Ollama release and checks it against the release's published sha256 sums.

## Supported versions

Only the latest commit on `main` is supported while the project is pre-1.0.

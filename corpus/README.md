# Test corpus

Ten public repos used to measure repo-interview: Gate 1 (every cited file exists) and the week 5-6 evaluation (share of questions whose cited code exists, share testers rate useful).

Each repo is pinned to a commit so results are reproducible. `corpus.json` holds the same list in machine-readable form. Repos are not vendored; clone them shallow at the pinned commit.

Selection rules: one primary language each, permissive license, pushed to in 2026, small to medium source tree, code a student could plausibly be asked about in an interview.

| # | Repo | Language | License | Commit | Why |
| --- | --- | --- | --- | --- | --- |
| 1 | [sindresorhus/ky](https://github.com/sindresorhus/ky) | TypeScript | MIT | `3541888` | Small, typed HTTP client; retries, hooks and timeouts give real "why" questions |
| 2 | [expressjs/express](https://github.com/expressjs/express) | JavaScript | MIT | `0dee2c5` | Plain JS without types; tests the symbol check on untyped code and middleware patterns |
| 3 | [pallets/click](https://github.com/pallets/click) | Python | BSD-3-Clause | `2247b35` | Decorator-heavy design; checks that symbols defined by decorators are found |
| 4 | [spf13/cobra](https://github.com/spf13/cobra) | Go | Apache-2.0 | `adbc881` | Widely used CLI library with methods on structs; Go receiver syntax for the parser |
| 5 | [sharkdp/hyperfine](https://github.com/sharkdp/hyperfine) | Rust | Apache-2.0 | `c516152` | An application, not a library; modules, traits and a clear benchmark pipeline |
| 6 | [jhy/jsoup](https://github.com/jhy/jsoup) | Java | MIT | `4cf664c` | Classic OO parser with deep package paths; tests long file citations |
| 7 | [DaveGamble/cJSON](https://github.com/DaveGamble/cJSON) | C | MIT | `6d9f244` | Few files with large functions and macros; tests citations inside one big file |
| 8 | [sinatra/sinatra](https://github.com/sinatra/sinatra) | Ruby | MIT | `cb22afd` | DSL and metaprogramming; symbols that are hard to find statically |
| 9 | [guzzle/guzzle](https://github.com/guzzle/guzzle) | PHP | MIT | `b920e5f` | PSR interfaces and middleware stack; namespaced classes (branch `8.3`) |
| 10 | [App-vNext/Polly](https://github.com/App-vNext/Polly) | C# | BSD-3-Clause | `3f3adad` | Largest in the set (about 800 `.cs` files); the upper bound for "medium" and a stress test for `scan` |

Checked 21 Oct 2026 with the GitHub API: none archived, all licenses as listed.

## Rejected candidates

- `google/gson`, `colinhacks/zod`, `serilog/serilog`: larger than needed when a smaller repo covers the language.
- `jbogard/MediatR`: license now reported as `NOASSERTION` (moved to a commercial license).
- `commandlineparser/commandline`: no push since Feb 2024.

## Fetching

```bash
node corpus/fetch.mjs
```

Clones each repo into `corpus/repos/` (git-ignored) at its pinned commit.

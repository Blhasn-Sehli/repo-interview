// One-file build for npm: the CLI and @repo-interview/core in a single script, so users install one
// package. The SDK and the tree-sitter WebAssembly files stay real dependencies (the parsers are
// loaded from their package folder at run time).
import { build } from "esbuild";
import { copyFileSync } from "node:fs";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/repo-interview.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["@anthropic-ai/sdk", "@vscode/tree-sitter-wasm"],
  logLevel: "warning",
});
copyFileSync("../../LICENSE", "LICENSE");

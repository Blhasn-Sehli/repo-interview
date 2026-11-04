import { beforeAll, describe, expect, it } from "vitest";
import { extractSymbols, extractWithTreeSitter, loadParsers } from "../src/index.js";

const names = (path: string, src: string) => extractWithTreeSitter(path, src)?.map((s) => s.name);

describe("tree-sitter symbols", () => {
  beforeAll(async () => {
    await loadParsers();
  });

  it("finds what the regex patterns miss in TypeScript", () => {
    const src = [
      "import { type Options } from './o.js';",
      "export const handler =",
      "  async (req: Request) => req;",
      "@Injectable()",
      "export default class BidService {",
      "  constructor(private readonly x: X) {}",
      "  async placeBid<T>(",
      "    id: string,",
      "  ): Promise<T> {",
      "    if (id) { return foo(id); }",
      "  }",
      "  get total(): number { return 1; }",
      "}",
      "describe('x', () => { it('works', function () {}); });",
      "export type Hook<T> = (x: T) => void;",
      "interface Shape { area(): number }",
    ].join("\n");
    expect(names("bid.service.ts", src)).toEqual(["handler", "BidService", "placeBid", "total", "Hook", "Shape"]);
    // the regex patterns miss `handler`, whose value starts on the next line
    expect(extractSymbols("typescript", src).map((s) => s.name)).not.toContain("handler");
  });

  it("reports the line where each symbol is defined", () => {
    const syms = extractWithTreeSitter("a.ts", "\n\nexport function retry() {}\n");
    expect(syms).toEqual([{ name: "retry", kind: "function", line: 3 }]);
  });

  it("handles TSX and plain JavaScript", () => {
    expect(names("App.tsx", "export function App() { return <div onClick={() => 1} />; }")).toEqual(["App"]);
    expect(names("response.js", "res.send = function send(body) {}\nclass Router { route(p) {} }")).toEqual(["send", "Router", "route"]);
  });

  it("finds Python functions, classes and methods", () => {
    const src = "@click.command()\ndef main():\n    pass\n\nclass Config:\n    def load(self,\n             path):\n        pass\n";
    expect(names("cli.py", src)).toEqual(["main", "Config", "load"]);
  });

  it("returns undefined for languages it does not handle, so the caller can fall back", () => {
    expect(extractWithTreeSitter("main.go", "package main\nfunc main() {}")).toBeUndefined();
  });
});

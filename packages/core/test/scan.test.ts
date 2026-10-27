import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanRepo, verifyQuestions } from "../src/index.js";

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "ri-scan-"));
  const put = (path: string, src: string) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), src);
  };
  put(
    "src/client.ts",
    "import {\n\ttype Options,\n} from './o.js';\nexport class Client {}\nexport async function retry() {}\nconst backoff = () => 1;\nexport type Hook<T> = (x: T) => void;\n",
  );
  put(
    "src/bid.service.ts",
    [
      "@Injectable()",
      "export class BidService {",
      "  constructor(private readonly x: X) {}",
      "  async placeBid(id: string): Promise<void> {",
      "    if (id) {",
      "      this.notify(id);",
      "    }",
      "  }",
      "  @Post()",
      "  async create(",
      "    @Body() dto: CreateDto,",
      "  ): Promise<Bid> {",
      "    return foo(",
      "      dto,",
      "    );",
      "  }",
      "  private static helper(a: number) { return a; }",
      "}",
    ].join("\n"),
  );
  put(
    "lib/response.js",
    "res.status = function status(code) {}\nres.links = function(links) {}\nmodule.exports.render = async function () {}\n" +
      "describe('res', function () {\n  it('works', function(done){\n    setTimeout(function () {\n    });\n  });\n});\n",
  );
  put("app/cli.py", "import click\n\ndef main():\n    pass\n\nclass Config:\n    pass\n");
  put("cmd/root.go", "package cmd\n\nfunc Execute() {}\nfunc (c *Command) Run() {}\ntype Command struct {}\n");
  put("src/lib.rs", "pub fn run() {}\nstruct Bench;\nimpl Bench {}\n");
  put("node_modules/dep/index.js", "function hidden() {}\n");
  put("README.md", "# readme\n");
  return root;
}

describe("scanRepo", () => {
  const root = fixture();
  const scan = scanRepo(root);
  const byPath = new Map(scan.files.map((f) => [f.path, f]));

  it("lists source files with posix paths and skips vendored dirs and non-code", () => {
    expect([...byPath.keys()].sort()).toEqual(["app/cli.py", "cmd/root.go", "lib/response.js", "src/bid.service.ts", "src/client.ts", "src/lib.rs"]);
  });

  it("extracts symbols per language with line numbers", () => {
    const names = (p: string) => byPath.get(p)!.symbols.map((s) => s.name);
    expect(names("src/client.ts")).toEqual(["Client", "retry", "backoff", "Hook"]);
    expect(names("lib/response.js")).toEqual(["status", "links", "render"]);
    expect(names("src/bid.service.ts")).toEqual(["BidService", "placeBid", "create", "helper"]);
    expect(names("app/cli.py")).toEqual(["main", "Config"]);
    expect(names("cmd/root.go")).toEqual(["Execute", "Run", "Command"]);
    expect(names("src/lib.rs")).toEqual(["run", "Bench"]);
    expect(byPath.get("app/cli.py")!.symbols[0].line).toBe(3);
  });

  it("only reports symbols the verifier accepts", () => {
    const questions = scan.files.flatMap((f) => f.symbols.map((s) => ({ text: "?", file: f.path, symbol: s.name })));
    expect(verifyQuestions(root, questions).every((v) => v.ok)).toBe(true);
  });
});

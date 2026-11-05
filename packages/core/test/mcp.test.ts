import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it } from "vitest";
import { createMcpServer } from "../src/index.js";

const root = mkdtempSync(join(tmpdir(), "ri-mcp-"));
mkdirSync(join(root, "src"));
writeFileSync(join(root, "README.md"), "# Bids\n\nLive auctions.\n");
writeFileSync(join(root, "src", "bid.ts"), "export function placeBid(amount: number) {\n  if (amount <= 0) throw new Error('bad');\n  return amount;\n}\n");
const outside = mkdtempSync(join(tmpdir(), "ri-secret-"));
writeFileSync(join(outside, "id_rsa"), "PRIVATE");

let client: Client;
const call = async (name: string, args: Record<string, unknown>) => {
  const res = (await client.callTool({ name, arguments: args })) as { content: { type: string; text: string }[]; isError?: boolean };
  return { text: res.content.map((c) => c.text).join("\n"), isError: !!res.isError };
};

beforeAll(async () => {
  const server = createMcpServer({ cwd: root });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: "test", version: "0" });
  await client.connect(b);
});

describe("MCP server", () => {
  it("lists the four tools and the interview prompt", async () => {
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual(["check_questions", "pr_changes", "read_code", "scan_repo"]);
    const prompts = (await client.listPrompts()).prompts.map((p) => p.name).sort();
    expect(prompts).toEqual(["interview", "pr_interview"]);
  });

  it("scan_repo lists files, symbols and the README", async () => {
    const { text } = await call("scan_repo", {});
    const data = JSON.parse(text);
    expect(data.files).toContainEqual({ path: "src/bid.ts", language: "typescript", symbols: ["placeBid"] });
    expect(data.projectFiles).toContain("README.md");
  });

  it("read_code returns the code at the cited symbol", async () => {
    const { text } = await call("read_code", { file: "src/bid.ts", symbol: "placeBid" });
    expect(text).toMatch(/^src\/bid\.ts:1\n/);
    expect(text).toContain("amount <= 0");
  });

  it("read_code refuses paths outside the project", async () => {
    const rel = join("..", outside.split(/[\\/]/).pop()!, "id_rsa");
    const res = await call("read_code", { file: rel });
    expect(res.isError).toBe(true);
    expect(res.text).not.toContain("PRIVATE");
    expect(res.text).toMatch(/outside the project/);
  });

  it("read_code gives the same refusal for outside paths that do not exist", async () => {
    const res = await call("read_code", { file: "../../no-such-dir/id_rsa" });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/outside the project/);
  });

  it("check_questions keeps real citations and explains the rest", async () => {
    const { text } = await call("check_questions", {
      questions: [
        { text: "Why reject amounts <= 0?", file: "src/bid.ts", symbol: "placeBid" },
        { text: "What is ghost?", file: "src/bid.ts", symbol: "ghost" },
        { text: "Explain the router", file: "src/router.ts" },
      ],
    });
    const data = JSON.parse(text);
    expect(data.kept.map((q: { symbol?: string }) => q.symbol)).toEqual(["placeBid"]);
    expect(data.dropped.map((d: { reason: string }) => d.reason)).toEqual(["symbol not found: ghost", "file not found: src/router.ts"]);
  });

  it("pr_changes lists the changed files and symbols", async () => {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
    git("init", "-q");
    git("-c", "user.email=t@t", "-c", "user.name=t", "add", ".");
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");
    writeFileSync(join(root, "src", "bid.ts"), "export function placeBid(amount: number) {\n  if (amount <= 0 || !Number.isFinite(amount)) throw new Error('bad');\n  return amount;\n}\n");
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qam", "finite");
    const data = JSON.parse((await call("pr_changes", { base: "HEAD~1" })).text);
    expect(data.changed).toEqual({ "src/bid.ts": ["placeBid"] });
    expect(data.diff).toContain("Number.isFinite");
  });
});

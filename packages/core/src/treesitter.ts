import { dirname, extname, join } from "node:path";
import { createRequire } from "node:module";
import type { SymbolInfo } from "./scan.js";

// Real parsers (tree-sitter, as WebAssembly, so nothing is compiled on install) for the languages
// where the regex patterns miss the most. scanRepo uses them once loadParsers() has run, and falls
// back to the regex patterns for every other language.

type TreeSitter = typeof import("@vscode/tree-sitter-wasm");
type Parser = InstanceType<TreeSitter["Parser"]>;
type Query = InstanceType<TreeSitter["Query"]>;

const require = createRequire(import.meta.url);

const TS_QUERY = `
(function_declaration name: (identifier) @function)
(generator_function_declaration name: (identifier) @function)
(class_declaration name: (type_identifier) @class)
(abstract_class_declaration name: (type_identifier) @class)
(method_definition name: (_) @method)
(interface_declaration name: (type_identifier) @type)
(type_alias_declaration name: (type_identifier) @type)
(enum_declaration name: (identifier) @type)
(variable_declarator name: (identifier) @function value: [(arrow_function) (function_expression)])
(assignment_expression left: (member_expression property: (property_identifier) @function) right: [(arrow_function) (function_expression)])
`;

const JS_QUERY = `
(function_declaration name: (identifier) @function)
(generator_function_declaration name: (identifier) @function)
(class_declaration name: (identifier) @class)
(method_definition name: (_) @method)
(variable_declarator name: (identifier) @function value: [(arrow_function) (function_expression)])
(assignment_expression left: (member_expression property: (property_identifier) @function) right: [(arrow_function) (function_expression)])
`;

const PY_QUERY = `
(function_definition name: (identifier) @function)
(class_definition name: (identifier) @class)
`;

/** file extension → [grammar file, query] */
const GRAMMARS: Record<string, [string, string]> = {
  ".ts": ["tree-sitter-typescript.wasm", TS_QUERY],
  ".mts": ["tree-sitter-typescript.wasm", TS_QUERY],
  ".cts": ["tree-sitter-typescript.wasm", TS_QUERY],
  ".tsx": ["tree-sitter-tsx.wasm", TS_QUERY],
  ".js": ["tree-sitter-javascript.wasm", JS_QUERY],
  ".jsx": ["tree-sitter-javascript.wasm", JS_QUERY],
  ".mjs": ["tree-sitter-javascript.wasm", JS_QUERY],
  ".cjs": ["tree-sitter-javascript.wasm", JS_QUERY],
  ".py": ["tree-sitter-python.wasm", PY_QUERY],
};

let loaded: Map<string, { parser: Parser; query: Query }> | undefined;

/** Load the WebAssembly parsers once. Safe to call more than once. */
export async function loadParsers(): Promise<void> {
  if (loaded) return;
  const ts = require("@vscode/tree-sitter-wasm") as TreeSitter;
  const dir = dirname(require.resolve("@vscode/tree-sitter-wasm"));
  await ts.Parser.init({ locateFile: (file: string) => join(dir, file) });
  const byGrammar = new Map<string, { parser: Parser; query: Query }>();
  const out = new Map<string, { parser: Parser; query: Query }>();
  for (const [ext, [grammar, source]] of Object.entries(GRAMMARS)) {
    if (!byGrammar.has(grammar)) {
      const language = await ts.Language.load(join(dir, grammar));
      const parser = new ts.Parser();
      parser.setLanguage(language);
      byGrammar.set(grammar, { parser, query: new ts.Query(language, source) });
    }
    out.set(ext, byGrammar.get(grammar)!);
  }
  loaded = out;
}

/**
 * Symbols from a real parse, in source order, first definition of each name only.
 * Undefined when the parsers are not loaded or the file type is not covered, so callers fall back.
 */
export function extractWithTreeSitter(path: string, src: string): SymbolInfo[] | undefined {
  const entry = loaded?.get(extname(path).toLowerCase());
  if (!entry) return undefined;
  const tree = entry.parser.parse(src);
  if (!tree) return undefined;
  try {
    const seen = new Set<string>();
    const symbols: SymbolInfo[] = [];
    const captures = entry.query.captures(tree.rootNode).sort((a, b) => a.node.startIndex - b.node.startIndex);
    for (const { name: kind, node } of captures) {
      const name = node.text;
      if (name === "constructor" || seen.has(name)) continue;
      seen.add(name);
      symbols.push({ name, kind, line: node.startPosition.row + 1 });
    }
    return symbols;
  } finally {
    tree.delete();
  }
}

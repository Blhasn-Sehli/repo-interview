import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

export interface SymbolInfo { name: string; kind: string; line: number }
export interface FileInfo { path: string; language: string; lines: number; symbols: SymbolInfo[] }
export interface ScanResult { root: string; files: FileInfo[]; skipped: number }
export interface ScanOptions { maxFiles?: number; maxBytes?: number }

type Pattern = [kind: string, re: RegExp];

const MODS = "(?:(?:public|private|protected|internal|static|final|abstract|sealed|partial|open|data|override|virtual|async|synchronized|readonly)\\s+)";

// Regex symbol lookup, one match per line. Good enough for candidates; tree-sitter replaces it later.
const PATTERNS: Record<string, Pattern[]> = {
  typescript: [
    ["function", /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/],
    ["class", /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/],
    ["type", /^\s*(?:export\s+)?(?:declare\s+)?(?:interface|(?:const\s+)?enum)\s+([A-Za-z_$][\w$]*)/],
    // `type X =` only: a bare `type X,` is a type-only import specifier, not a definition.
    ["type", /^\s*(?:export\s+)?(?:declare\s+)?type\s+([A-Za-z_$][\w$]*)\s*(?:<[^=]*>)?\s*=/],
    ["function", /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function|[A-Za-z_$][\w$]*\s*=>)/],
    // `res.send = function send(...)`, common in older JS such as express
    ["function", /^\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b/],
  ],
  python: [
    ["function", /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/],
    ["class", /^\s*class\s+([A-Za-z_]\w*)/],
  ],
  go: [
    ["function", /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/],
    ["type", /^type\s+([A-Za-z_]\w*)/],
  ],
  rust: [
    ["function", /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_]\w*)/],
    ["type", /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait|type)\s+([A-Za-z_]\w*)/],
  ],
  java: [
    ["class", new RegExp(`^\\s*${MODS}*(?:class|interface|enum|record|struct)\\s+([A-Za-z_]\\w*)`)],
    ["function", new RegExp(`^\\s*${MODS}+[\\w<>\\[\\],.? ]+?\\s+([A-Za-z_]\\w*)\\s*\\(`)],
  ],
  c: [
    ["macro", /^#\s*define\s+([A-Za-z_]\w*)/],
    ["type", /^(?:typedef\s+)?(?:struct|enum|union)\s+([A-Za-z_]\w*)\s*\{/],
    ["function", /^(?!\s)(?!(?:if|for|while|switch|return|else)\b)[A-Za-z_][\w\s*]*?\b([A-Za-z_]\w*)\s*\([^;]*$/],
  ],
  ruby: [
    ["function", /^\s*def\s+(?:self\.)?([A-Za-z_]\w*)/],
    ["class", /^\s*(?:class|module)\s+(?:\w+::)*([A-Za-z_]\w*)/],
  ],
  php: [
    ["function", /^\s*(?:(?:public|private|protected|static|abstract|final)\s+)*function\s+&?([A-Za-z_]\w*)/],
    ["class", /^\s*(?:(?:abstract|final|readonly)\s+)*(?:class|interface|trait|enum)\s+([A-Za-z_]\w*)/],
  ],
};

const LANGUAGES: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript", ".mts": "typescript", ".cts": "typescript",
  ".js": "typescript", ".jsx": "typescript", ".mjs": "typescript", ".cjs": "typescript",
  ".py": "python", ".go": "go", ".rs": "rust",
  ".java": "java", ".kt": "java", ".cs": "java", ".scala": "java",
  ".c": "c", ".h": "c", ".cc": "c", ".cpp": "c", ".hpp": "c",
  ".rb": "ruby", ".php": "php",
};

const IGNORED_DIRS = new Set([
  "node_modules", "dist", "build", "out", "target", "vendor", "coverage",
  "venv", "__pycache__", "bin", "obj",
]);

export function languageOf(path: string): string | undefined {
  return LANGUAGES[extname(path).toLowerCase()];
}

export function extractSymbols(language: string, src: string): SymbolInfo[] {
  const patterns = PATTERNS[language] ?? [];
  const seen = new Set<string>();
  const symbols: SymbolInfo[] = [];
  src.split(/\r?\n/).forEach((text, i) => {
    for (const [kind, re] of patterns) {
      const name = re.exec(text)?.[1];
      if (!name) continue;
      if (!seen.has(name)) {
        seen.add(name);
        symbols.push({ name, kind, line: i + 1 });
      }
      break;
    }
  });
  return symbols;
}

/** List source files and candidate symbols a question could cite. Reads files as data only. */
export function scanRepo(root: string, opts: ScanOptions = {}): ScanResult {
  const maxFiles = opts.maxFiles ?? 5000;
  const maxBytes = opts.maxBytes ?? 1_000_000;
  const files: FileInfo[] = [];
  let skipped = 0;

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && !IGNORED_DIRS.has(entry.name)) walk(full);
        continue;
      }
      const language = entry.isFile() ? languageOf(entry.name) : undefined;
      if (!language) continue;
      if (files.length >= maxFiles || statSync(full).size > maxBytes) {
        skipped++;
        continue;
      }
      const src = readFileSync(full, "utf8");
      files.push({
        path: relative(root, full).split(sep).join("/"),
        language,
        lines: src.split(/\r?\n/).length,
        symbols: extractSymbols(language, src),
      });
    }
  };

  walk(root);
  return { root, files, skipped };
}

const AAA_MARKER = /^\s*\/\/\s*(Arrange|Act|Assert)\s*$/;
const COMMENT = /^\s*\/\//;
const WHILE_TRUE = /\bwhile\s*\(\s*true\s*\)/;
const CLASSIC_EXTENSION =
  /\bstatic\b[^;{}]*\bthis\s+[A-Za-z_][\w<>.?\[\],\n ]*\s+[A-Za-z_]\w*\s*[,)]/;
const TYPE_DECL =
  /^\s*(?:(?:public|internal|private|protected|file|sealed|static|abstract|partial|readonly|unsafe|new)\s+)*(?:class|record|interface|struct|enum)\s+\w/;

export function validateDotnetSource(source, context) {
  const violations = [];
  const lines = source.split(/\r?\n/);
  let typeCount = 0;
  let firstTypeLine = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const lineNumber = index + 1;

    if (COMMENT.test(line) && !(context.isTest && AAA_MARKER.test(line))) {
      violations.push({
        rule: "comment",
        line: lineNumber,
        detail:
          "comments and XML docs are forbidden; only // Arrange, // Act, // Assert in tests",
      });
    }

    if (WHILE_TRUE.test(line)) {
      violations.push({
        rule: "unbounded-loop",
        line: lineNumber,
        detail: "while (true) has no provable termination; use a bounded for loop",
      });
    }

    if (CLASSIC_EXTENSION.test(line)) {
      violations.push({
        rule: "classic-extension-method",
        line: lineNumber,
        detail:
          "classic `this` extension method; use a C# 14 extension block: extension(Type value) { ... }",
      });
    }

    if (!TYPE_DECL.test(line)) {
      continue;
    }

    if (/^\s+\S/.test(line)) {
      violations.push({
        rule: "nested-type",
        line: lineNumber,
        detail: "nested type declaration; one type per file, no exceptions",
      });
      continue;
    }

    typeCount++;
    if (typeCount === 1) {
      firstTypeLine = lineNumber;
      continue;
    }

    violations.push({
      rule: "multiple-types",
      line: lineNumber,
      detail: `second top-level type in ${context.file} (first at line ${firstTypeLine})`,
    });
  }

  const reportedLines = new Set(
    violations.filter((v) => v.rule === "classic-extension-method").map((v) => v.line),
  );
  const multiline = new RegExp(CLASSIC_EXTENSION.source, "g");
  for (const match of source.matchAll(multiline)) {
    const line = source.slice(0, match.index).split(/\r?\n/).length;
    if (reportedLines.has(line)) {
      continue;
    }
    violations.push({
      rule: "classic-extension-method",
      line: line,
      detail:
        "classic `this` extension method; use a C# 14 extension block: extension(Type value) { ... }",
    });
  }

  return violations;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  const { readFileSync } = await import("node:fs");
  const [file, ...flags] = process.argv.slice(2);
  if (!file) {
    console.error("usage: node dotnet-implementation-rules.mjs <source-file> [--test]");
    process.exit(2);
  }

  const violations = validateDotnetSource(readFileSync(file, "utf8"), {
    file,
    isTest: flags.includes("--test"),
  });

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`${file}:${violation.line}: ${violation.rule}: ${violation.detail}`);
    }
    process.exit(1);
  }

  console.log(`PASS ${file}`);
}

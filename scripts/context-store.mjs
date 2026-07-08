import fs from "node:fs";
import path from "node:path";

const defaultKeep = 10;

function usage() {
  console.error(
    [
      "Usage:",
      "  node scripts/context-store.mjs init --project <path>",
      "  node scripts/context-store.mjs clear-scratchpad --project <path>",
      "  node scripts/context-store.mjs rotate-summary --project <path> [--keep 10]",
      "  node scripts/context-store.mjs write-summary --project <path> --skill <name> --input <file> [--keep 10]",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const args = {
    keep: defaultKeep,
    project: process.cwd(),
  };

  args.command = argv[0];
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--project") {
      args.project = path.resolve(argv[++index]);
    } else if (token === "--skill") {
      args.skill = argv[++index];
    } else if (token === "--input") {
      args.input = path.resolve(argv[++index]);
    } else if (token === "--keep") {
      args.keep = Number.parseInt(argv[++index], 10);
    } else if (token === "--help") {
      args.help = true;
    }
  }

  return args;
}

function normalizeSlashes(value) {
  return value.replaceAll("\\", "/");
}

function contextPaths(projectRoot) {
  const context = path.join(projectRoot, ".agents", "context");
  return {
    context,
    summaries: path.join(context, "summaries"),
    archive: path.join(context, "summaries", "archive"),
    scratchpad: path.join(context, "scratchpad"),
    memory: path.join(context, "memory"),
    cache: path.join(context, "cache"),
    latest: path.join(context, "summaries", "latest.md"),
    currentScratchpad: path.join(context, "scratchpad", "current.json"),
  };
}

function ensureContext(projectRoot) {
  const paths = contextPaths(projectRoot);
  for (const directory of [paths.summaries, paths.archive, paths.scratchpad, paths.memory, paths.cache]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  return paths;
}

function validateKeep(keep) {
  if (!Number.isInteger(keep) || keep < 0 || keep > 1000) {
    throw new Error("--keep must be an integer from 0 to 1000");
  }
}

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function archiveName(paths) {
  let candidate = path.join(paths.archive, `${timestamp()}.md`);
  let suffix = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(paths.archive, `${timestamp()}-${suffix}.md`);
    suffix += 1;
  }
  return candidate;
}

function archivedSummaries(paths) {
  if (!fs.existsSync(paths.archive)) {
    return [];
  }

  return fs
    .readdirSync(paths.archive, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const filePath = path.join(paths.archive, entry.name);
      return {
        filePath,
        mtimeMs: fs.statSync(filePath).mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs || path.basename(b.filePath).localeCompare(path.basename(a.filePath)));
}

function enforceRetention(paths, keep) {
  validateKeep(keep);
  for (const entry of archivedSummaries(paths).slice(keep)) {
    fs.unlinkSync(entry.filePath);
  }
}

function rotateSummary(projectRoot, keep) {
  const paths = ensureContext(projectRoot);
  validateKeep(keep);

  let archived = null;
  if (fs.existsSync(paths.latest)) {
    archived = archiveName(paths);
    fs.renameSync(paths.latest, archived);
  }

  enforceRetention(paths, keep);
  return {
    archived: archived ? normalizeSlashes(path.relative(projectRoot, archived)) : null,
    kept: Math.min(archivedSummaries(paths).length, keep),
  };
}

function skillMemoryPath(paths, skillName) {
  if (!/^olko-[a-z0-9-]+$/.test(skillName ?? "")) {
    throw new Error("--skill must be an olko-* skill name using lowercase letters, digits, and hyphens");
  }

  return path.join(paths.memory, `${skillName}.md`);
}

function writeJson(value) {
  console.log(`${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.command) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  if (args.command === "init") {
    const paths = ensureContext(args.project);
    writeJson({
      project: normalizeSlashes(args.project),
      context: normalizeSlashes(path.relative(args.project, paths.context)),
    });
    return;
  }

  if (args.command === "clear-scratchpad") {
    const paths = ensureContext(args.project);
    if (fs.existsSync(paths.currentScratchpad)) {
      fs.unlinkSync(paths.currentScratchpad);
    }
    writeJson({
      cleared: normalizeSlashes(path.relative(args.project, paths.currentScratchpad)),
    });
    return;
  }

  if (args.command === "rotate-summary") {
    writeJson(rotateSummary(args.project, args.keep));
    return;
  }

  if (args.command === "write-summary") {
    if (!args.input) {
      throw new Error("write-summary requires --input <file>");
    }
    if (!args.skill) {
      throw new Error("write-summary requires --skill <name>");
    }
    if (!fs.existsSync(args.input)) {
      throw new Error(`Input file not found: ${args.input}`);
    }

    const rotation = rotateSummary(args.project, args.keep);
    const paths = ensureContext(args.project);
    const content = fs.readFileSync(args.input, "utf8").trimEnd();
    fs.writeFileSync(paths.latest, `${content}\n`);
    const memoryPath = skillMemoryPath(paths, args.skill);
    fs.writeFileSync(memoryPath, `${content}\n`);

    writeJson({
      ...rotation,
      summary: normalizeSlashes(path.relative(args.project, paths.latest)),
      skillMemory: normalizeSlashes(path.relative(args.project, memoryPath)),
    });
    return;
  }

  usage();
  process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

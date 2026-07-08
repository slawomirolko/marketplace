import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const registryPath = path.join(root, "registry.json");
const capabilityGraphPath = path.join(root, "capability-graph.json");
const skillsRoot = path.join(root, "skills");
const fix = process.argv.includes("--fix");

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const capabilityPattern = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const progressiveSections = ["overview", "workflow", "examples", "edge-cases"];
const largeSkillLineThreshold = 100;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeSlashes(value) {
  return value.replaceAll("\\", "/");
}

function parseFrontmatter(markdown, filePath) {
  const normalized = markdown.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---\n") && !normalized.startsWith("---\r\n")) {
    throw new Error(`${filePath} is missing YAML frontmatter`);
  }

  const lines = normalized.split(/\r?\n/);
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === "---") {
      end = i;
      break;
    }
  }

  if (end === -1) {
    throw new Error(`${filePath} has unterminated YAML frontmatter`);
  }

  const data = {};
  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    let value = match[2] ?? "";

    if (value === ">" || value === "|") {
      const blockLines = [];
      i += 1;
      while (i < end && /^(?:\s+|$)/.test(lines[i])) {
        blockLines.push(lines[i].trim());
        i += 1;
      }
      i -= 1;
      value = blockLines.filter(Boolean).join(" ");
    }

    data[key] = value.replace(/^["']|["']$/g, "").trim();
  }

  return data;
}

function listSkillFiles(entry) {
  const skillDir = path.join(skillsRoot, entry.category, entry.name);
  if (!fs.existsSync(skillDir)) {
    return entry.files ?? [];
  }

  const files = [];
  const visit = (directory) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, item.name);
      if (item.isDirectory()) {
        visit(absolute);
      } else if (item.isFile()) {
        files.push(normalizeSlashes(path.relative(skillDir, absolute)));
      }
    }
  };

  visit(skillDir);
  return files.sort((a, b) => {
    if (a === "SKILL.md") {
      return -1;
    }
    if (b === "SKILL.md") {
      return 1;
    }
    return a.localeCompare(b);
  });
}

function shortDescription(description) {
  return description.replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function deriveTags(entry) {
  const parts = entry.name
    .replace(/^olko-/, "")
    .split("-")
    .filter((part) => !["skill"].includes(part));
  return unique([entry.category, ...parts]).slice(0, 6);
}

function deriveCapabilities(entry) {
  const base = entry.category;
  const name = entry.name.replace(/^olko-/, "").replaceAll("-", ".");
  return unique([base, `${base}.${name}`]);
}

function deriveCost(files) {
  if (files.length <= 1) {
    return 1;
  }
  if (files.length <= 4) {
    return 2;
  }
  return 3;
}

function shouldUseProgressiveLoading(entry, files) {
  if (entry.loading?.mode === "progressive") {
    return true;
  }

  const skillPath = path.join(skillsRoot, entry.category, entry.name, "SKILL.md");
  if (!fs.existsSync(skillPath)) {
    return false;
  }

  const lineCount = fs.readFileSync(skillPath, "utf8").split(/\r?\n/).length;
  return lineCount > largeSkillLineThreshold || files.some((file) => progressiveSections.map((section) => `${section}.md`).includes(file));
}

function deriveLoading(entry, files) {
  if (!shouldUseProgressiveLoading(entry, files)) {
    return entry.loading;
  }

  return {
    mode: "progressive",
    first: "overview.md",
    sections: progressiveSections,
  };
}

function validateLoading(entry, skillDir, errors) {
  if (entry.loading === undefined) {
    return;
  }

  if (entry.loading.mode !== "progressive") {
    errors.push(`${entry.name}: loading.mode must be progressive when loading is present`);
    return;
  }

  if (entry.loading.first !== "overview.md") {
    errors.push(`${entry.name}: loading.first must be overview.md`);
  }

  if (!Array.isArray(entry.loading.sections) || entry.loading.sections.length === 0) {
    errors.push(`${entry.name}: loading.sections must be a non-empty array`);
    return;
  }

  for (const section of progressiveSections) {
    if (!entry.loading.sections.includes(section)) {
      errors.push(`${entry.name}: loading.sections must include ${section}`);
    }

    const file = `${section}.md`;
    if (!entry.files.includes(file)) {
      errors.push(`${entry.name}: progressive loading must list ${file} in files`);
    }
    if (!fs.existsSync(path.join(skillDir, file))) {
      errors.push(`${entry.name}: progressive loading file is missing: ${file}`);
    }
  }
}

function validateCompatibility(entry, errors) {
  for (const field of ["compatibleWith", "requires"]) {
    if (entry[field] !== undefined && !Array.isArray(entry[field])) {
      errors.push(`${entry.name}: ${field} must be an array when present`);
    }
  }

  for (const field of ["replaces", "deprecatedBy"]) {
    if (entry[field] !== undefined && typeof entry[field] !== "string") {
      errors.push(`${entry.name}: ${field} must be a string when present`);
    }
  }
}

function validateEntry(entry, seen) {
  const errors = [];
  for (const field of ["uses", "dependencies", "runtimeDependencies"]) {
    if (entry[field] !== undefined) {
      errors.push(`${entry.name}: ${field} must not be declared in registry entries`);
    }
  }

  if (!entry.name?.startsWith("olko-")) {
    errors.push(`${entry.name ?? "<missing>"}: name must start with olko-`);
  }

  if (seen.has(entry.name)) {
    errors.push(`${entry.name}: duplicate registry entry`);
  }
  seen.add(entry.name);

  if (!entry.category || !fs.existsSync(path.join(skillsRoot, entry.category))) {
    errors.push(`${entry.name}: category must match skills/<category>/`);
  }

  const skillDir = path.join(skillsRoot, entry.category ?? "", entry.name ?? "");
  const skillPath = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillPath)) {
    errors.push(`${entry.name}: registry entry must point to a skill directory with SKILL.md`);
    return errors;
  }

  const frontmatter = parseFrontmatter(fs.readFileSync(skillPath, "utf8"), skillPath);
  if (frontmatter.name !== entry.name) {
    errors.push(`${entry.name}: SKILL.md frontmatter name must match registry name`);
  }
  if (!frontmatter.description) {
    errors.push(`${entry.name}: SKILL.md frontmatter description is required`);
  }

  if (!entry.description) {
    errors.push(`${entry.name}: description is required`);
  }
  if (!semverPattern.test(entry.version ?? "")) {
    errors.push(`${entry.name}: version must be MAJOR.MINOR.PATCH`);
  }
  if (!Array.isArray(entry.tags) || entry.tags.length === 0) {
    errors.push(`${entry.name}: tags must be a non-empty array`);
  }
  if (!Array.isArray(entry.capabilities) || entry.capabilities.length === 0) {
    errors.push(`${entry.name}: capabilities must be a non-empty array`);
  } else {
    for (const capability of entry.capabilities) {
      if (!capabilityPattern.test(capability)) {
        errors.push(`${entry.name}: capability '${capability}' is not normalized`);
      }
    }
  }
  if (!Number.isInteger(entry.cost) || entry.cost < 1) {
    errors.push(`${entry.name}: cost must be a positive integer`);
  }
  if (!Array.isArray(entry.files) || entry.files.length === 0) {
    errors.push(`${entry.name}: files must list shipped files`);
  } else {
    for (const file of entry.files) {
      if (!fs.existsSync(path.join(skillDir, file))) {
        errors.push(`${entry.name}: listed file does not exist: ${file}`);
      }
    }
  }
  validateLoading(entry, skillDir, errors);

  validateCompatibility(entry, errors);
  return errors;
}

function normalizeRegistry(registry) {
  const normalized = {
    registrySchemaVersion: registry.registrySchemaVersion ?? 1,
    skills: registry.skills.map((entry) => {
      const skillPath = path.join(skillsRoot, entry.category, entry.name, "SKILL.md");
      const frontmatter = parseFrontmatter(fs.readFileSync(skillPath, "utf8"), skillPath);
      const files = listSkillFiles(entry);

      return {
        name: entry.name,
        category: entry.category,
        version: entry.version ?? "1.0.0",
        description: entry.description ?? shortDescription(frontmatter.description),
        tags: entry.tags ?? deriveTags(entry),
        capabilities: entry.capabilities ?? deriveCapabilities(entry),
        cost: entry.cost ?? deriveCost(files),
        files,
        ...Object.fromEntries(
          [["loading", deriveLoading(entry, files)]].filter(([, value]) => value !== undefined),
        ),
        ...Object.fromEntries(
          ["compatibleWith", "requires", "replaces", "deprecatedBy"]
            .filter((field) => entry[field] !== undefined)
            .map((field) => [field, entry[field]]),
        ),
      };
    }),
  };

  normalized.skills.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return normalized;
}

function writeCategoryIndexes(registry) {
  for (const [category, skills] of categoryIndexes(registry)) {
    writeJson(path.join(skillsRoot, category, "index.json"), {
      registrySchemaVersion: registry.registrySchemaVersion,
      skills,
    });
  }
}

function capabilityDepth(capability) {
  return capability.split(".").length;
}

function relatedCapabilities(capability, allCapabilities) {
  const parts = capability.split(".");
  const relations = new Set();

  for (let index = parts.length - 1; index > 0; index -= 1) {
    const parent = parts.slice(0, index).join(".");
    if (allCapabilities.has(parent)) {
      relations.add(parent);
    }
  }

  const prefix = `${capability}.`;
  for (const other of allCapabilities) {
    if (other !== capability && other.startsWith(prefix)) {
      relations.add(other);
    }
  }

  return [...relations].sort((a, b) => capabilityDepth(a) - capabilityDepth(b) || a.localeCompare(b)).slice(0, 6);
}

function buildCapabilityGraph(registry) {
  const skillsByCapability = new Map();
  for (const entry of registry.skills) {
    for (const capability of entry.capabilities) {
      if (!skillsByCapability.has(capability)) {
        skillsByCapability.set(capability, []);
      }
      skillsByCapability.get(capability).push(entry.name);
    }
  }

  const allCapabilities = new Set(skillsByCapability.keys());
  const capabilities = [...allCapabilities].sort().map((capability) => ({
    id: capability,
    skills: skillsByCapability.get(capability).sort(),
    related: relatedCapabilities(capability, allCapabilities),
    prerequisites: [],
  }));

  return {
    capabilityGraphSchemaVersion: 1,
    purpose: "routing-suggestions-only",
    maxTraversalDepth: 1,
    capabilities,
  };
}

function writeCapabilityGraph(registry) {
  writeJson(capabilityGraphPath, buildCapabilityGraph(registry));
}

function categoryIndexes(registry) {
  const byCategory = new Map();
  for (const entry of registry.skills) {
    if (!byCategory.has(entry.category)) {
      byCategory.set(entry.category, []);
    }
    byCategory.get(entry.category).push(entry);
  }

  return [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function validateCategoryIndexes(registry) {
  const errors = [];
  for (const [category, skills] of categoryIndexes(registry)) {
    const indexPath = path.join(skillsRoot, category, "index.json");
    const expected = {
      registrySchemaVersion: registry.registrySchemaVersion,
      skills,
    };

    if (!fs.existsSync(indexPath)) {
      errors.push(`${normalizeSlashes(path.relative(root, indexPath))}: category index is missing`);
      continue;
    }

    const actual = readJson(indexPath);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      errors.push(`${normalizeSlashes(path.relative(root, indexPath))}: category index is stale`);
    }
  }

  return errors;
}

function validateCapabilityGraph(registry) {
  const expected = buildCapabilityGraph(registry);
  if (!fs.existsSync(capabilityGraphPath)) {
    return ["capability-graph.json: capability graph is missing"];
  }

  const actual = readJson(capabilityGraphPath);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return ["capability-graph.json: capability graph is stale"];
  }

  return [];
}

let registry = readJson(registryPath);

if (fix) {
  registry = normalizeRegistry(registry);
  writeJson(registryPath, registry);
  writeCategoryIndexes(registry);
  writeCapabilityGraph(registry);
}

const errors = [];
if (registry.registrySchemaVersion !== 1) {
  errors.push("registry.json: registrySchemaVersion must be 1");
}
if (!Array.isArray(registry.skills)) {
  errors.push("registry.json: skills must be an array");
} else {
  const seen = new Set();
  for (const entry of registry.skills) {
    errors.push(...validateEntry(entry, seen));
  }
  errors.push(...validateCategoryIndexes(registry));
  errors.push(...validateCapabilityGraph(registry));
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`registry ok: ${registry.skills.length} skills`);
}

import fs from "node:fs";
import path from "node:path";

export function detectWorktree({ cwd, gitDir, commonDir }) {
  const resolvedGitDir = path.resolve(cwd, gitDir);
  const resolvedCommonDir = path.resolve(cwd, commonDir);
  return {
    isWorktree: resolvedGitDir !== resolvedCommonDir,
    cwd: path.resolve(cwd),
    gitDir: resolvedGitDir,
    commonDir: resolvedCommonDir,
  };
}

export function discoverWorktreeScripts(repoRoot, { scriptGlobPrefix = "worktree-compose" } = {}) {
  const testsRoot = path.join(repoRoot, "scripts", "tests");
  if (!fs.existsSync(testsRoot)) {
    return { wrapper: null, tests: [] };
  }

  const names = fs.readdirSync(testsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(`${scriptGlobPrefix}`) && entry.name.endsWith(".ps1"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const wrapperName = `${scriptGlobPrefix}.ps1`;
  return {
    wrapper: names.includes(wrapperName) ? path.join(testsRoot, wrapperName) : null,
    tests: names.filter((name) => name !== wrapperName).map((name) => path.join(testsRoot, name)),
  };
}

export function createIsolatedProjectName(worktreePath, { prefix = "wt" } = {}) {
  const slug = path.basename(path.resolve(worktreePath))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "worktree";
  return `${prefix}-${slug}`.replace(/[^a-z0-9_-]/g, "-");
}

export function buildWorktreeCommandPlan({
  worktreePath,
  wrapper,
  tests,
  projectName,
  mainProjectName,
  envFile,
  portOffset,
}) {
  if (!wrapper) return [];
  if (!projectName || projectName === mainProjectName) {
    throw new Error("Worktree Compose project name must be isolated from the main project");
  }

  const common = ["-File", wrapper, "-WorktreePath", worktreePath, "-ProjectName", projectName, "-EnvFile", envFile, "-PortOffset", String(portOffset)];
  return [
    { kind: "start", args: [...common, "-Action", "Up"], env: { COMPOSE_PROJECT_NAME: projectName } },
    ...tests.map((script) => ({
      kind: "test",
      args: ["-File", script, "-WorktreePath", worktreePath, "-ProjectName", projectName, "-EnvFile", envFile, "-PortOffset", String(portOffset)],
      env: { COMPOSE_PROJECT_NAME: projectName },
    })),
    { kind: "cleanup", args: [...common, "-Action", "Down"], env: { COMPOSE_PROJECT_NAME: projectName } },
  ];
}

export async function runWorktreeComposeTests(plan, runCommand) {
  if (plan.length === 0) return { status: 0, cleanupStatus: 0 };

  let status = 0;
  let failure;
  try {
    for (const command of plan.filter(({ kind }) => kind !== "cleanup")) {
      const result = await runCommand(command);
      if (result.status !== 0) {
        status = result.status;
        failure = result;
        break;
      }
    }
  } catch (error) {
    status = error.status ?? 1;
    failure = { status, error };
  } finally {
    const cleanup = plan.find(({ kind }) => kind === "cleanup");
    if (cleanup) {
      try {
        const result = await runCommand(cleanup);
        if (result.status !== 0 && status === 0) status = result.status;
        return { status, cleanupStatus: result.status, failure };
      } catch (error) {
        if (status === 0) status = error.status ?? 1;
        return { status, cleanupStatus: error.status ?? 1, failure };
      }
    }
  }
  return { status, cleanupStatus: 0, failure };
}

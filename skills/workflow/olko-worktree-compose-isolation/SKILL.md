---
name: olko-worktree-compose-isolation
version: 1.0.0
description: "Canonical Compose isolation contract for worktree builds, restarts, and log/trace/DB checks; load in steps 6, 7, and 11 of olko-implementation-orchestrator."
---

# olko-worktree-compose-isolation

Load before any Compose command in steps 6, 7, or 11 of `olko-implementation-orchestrator`, and pass the contract to every child that runs Compose.

## Adaptation
1. Read `.agents/skill-config.md` when present.
2. If `projectAdapter` is not `false`, load `.agents/skills/olko-worktree-compose-isolation/project.md` when present.
3. Apply rules in this order: Configuration, Project Adapter, AGENTS.md, then this skill.

## Procedure

WORKTREE COMPOSE ISOLATION (CANONICAL CONTRACT): applies to every worktree build,
restart, log, trace, or database check in steps 1–10. Worktree Compose can otherwise
recreate the main containers or apply migrations to the shared database volume:

- Resolve the worktree root, main repo root, a distinct project name (`<project>-<slug>`),
  an env file, and a port offset BEFORE any compose command. Never fall back to
  the main project or ports; missing values fail visibly.
- Prefer the repository's compose-isolation wrapper when one exists (it owns the
  isolated project name, the `container_name: !reset null` override, the port
  offset, and the worktree env file), invoked from the worktree root with the
  worktree path, project name, env file, and port offset. When no wrapper can run
  on this host, reproduce the same isolation explicitly with a temporary override
  file outside the repository.
- The isolation override MUST reset `container_name` to null for every service
  and offset every published host port; pass it with `-f` alongside the
  worktree's `compose.yaml`, plus `--project-name <project>-<slug>` and
  `--env-file <worktree>/.env`.
- Prove isolation before acting and after acting: `docker compose -p <project>-<slug> ps`
  shows the worktree stack, and the main stack is demonstrably untouched (compare
  container list / start times). Record both outputs in the journal.
- Teardown is scoped to the isolated project only (use `--remove-orphans` when
  needed). Never `down` the main project from a worktree.
- Touch the main compose project ONLY in the post-merge phase (step 11) from the
  main checkout, or on an explicit user instruction — and journal the intent
  first. Step 11 is the deliberate opposite of step 6: run the real main Compose
  project (real project name, real container names, real ports, merged code) with
  NO isolation override and NO port offset.
- If no isolation is achievable in this environment, STOP and report to the user
  rather than rebuilding anything in the main project.

---
name: olko-factory-workflow-sync
version: 0.1.0
description: "Script commands that keep the Software Factory workflows in step with the Olko marketplace: scan the lock for changed, removed and new sources, count mapping rounds and validate, build the YAML diff, and lock or revert. Use when you run the workflow sync loop or a mapping round of it. Triggers: 'workflow sync', 'sync factory workflows', 'factory workflows stale', 'olko-factory-workflow-sync'."
---

# olko-factory-workflow-sync

## Routing Summary
Deterministic commands for the factory workflow sync loop. Run each command as `node <this skill>/scripts/workflow-sync.mjs <command> [flags]`. Each command prints one JSON object on stdout. Exit code 0 means success. Any other exit code means an error, with the message on stderr: report the error and stop.

## Commands
- `scan [--marketplace <checkout>] [--factory <factory folder>] [--workflows <folder>] [--state-dir <folder>]`
  Compares `workflows.lock.json` with the marketplace and saves a copy of every YAML file in `<state dir>/snapshot`. Without flags, it uses the marketplace checkout that contains this skill, its `factory` folder and `factory/workflows`, and it makes a new temporary state folder. Pass the flags when the skill runs from an installed copy.
  Output: `stateDir`, `workflows`, `marketplace`, `factory`, `head`, `pending` (the number of sources plus workflows missing from the lock), `summary`, and `items`: one per source, `{n, kind: changed|missing|new, source, ask, itemFile}`. `missing` means the source was removed from the marketplace. `ask` is true only for `new`, a new main agent. The `itemFile` JSON names the YAML files that implement the source (`yamlFiles`), every file of the workflows that contain them (`family`) and the `diffFile` with the source diff (the full text for a new agent).
- `round --state-dir <dir> --source <source> [--needs-op "<line>"]... [--last-verdict <pass|fail>] [--last-engine-gaps <n>]`
  Ends one mapping round of a source. It records the verdict of the verifier of the previous round (the `--last-*` flags), counts this round, sets the verdict of this source to open, keeps the `needs engine op` lines, and runs the factory validator. Output: `source`, `round`, `valid`, `errors` (up to 20 validator lines).
- `diff --state-dir <dir> [--last-verdict <pass|fail>] [--last-engine-gaps <n>]`
  Records the last verifier verdict, then compares the YAML with the copy from `scan`. Output: `stat` (`no YAML changed` when nothing changed), `changed` (the number of changed files), `diffFile` (the full diff), `needsOp`, `open` (sources whose last verdict was not pass). `needsOp` and `open` are text with one entry per line, or `none`.
- `finish --state-dir <dir> --decision <approve|revert|none>`
  `approve` locks the workflows of every source whose last verdict was pass, plus the workflows missing from the lock, at the marketplace commit of `scan`. `revert` puts every YAML file back from the copy and removes new ones; the lock is unchanged. `none` (the default) changes no file. Output: `decision`, `locked`, `report`.

## Rules
- Pass the `--last-*` flags exactly as the caller gives them; never invent a verdict.
- `--last-engine-gaps` has an effect only together with `--last-verdict`. Every verdict other than `pass` is recorded as open.
- A flag value that starts with `--` is read as a new flag. Do not start a `--needs-op` line with `--`.
- Never edit `sync.json`, the copy or the lock by hand; only these commands change them.

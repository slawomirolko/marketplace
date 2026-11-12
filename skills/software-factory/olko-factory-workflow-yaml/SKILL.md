---
name: olko-factory-workflow-yaml
version: 0.1.0
description: "Rules for the Software Factory workflow YAML in factory/workflows: how an Olko agent's steps map to phase groups, nodes, edges and conditions, which engine operations exist, how a workflow names its sources, and how to validate it. Use when you write, update or verify a factory workflow from an Olko agent or skill. Triggers: 'factory workflow', 'map agent to yaml', 'update factory yaml', 'verify factory workflow', 'olko-factory-workflow-yaml'."
---

# olko-factory-workflow-yaml

## Routing Summary
Rules for writing and checking Software Factory workflow YAML (`factory/workflows/*.yaml`) from Olko agents and skills. Triggers: 'factory workflow', 'map agent to yaml', 'update factory yaml', 'verify factory workflow'.

## Files and names
- One standalone workflow per main agent, named after it without the role suffix (`olko-implementation-orchestrator` → `olko-implementation`). Phase groups are separate files named `<workflow-prefix>-<phase>.yaml`.
- `source:` names every file the workflow implements, as marketplace paths: `agents/opencode/<agent>.md`, `plugins/<plugin>/agents/<agent>.md`, `skills/*/<skill>`. Add the steps in parentheses, for example `agents/opencode/olko-implementation-orchestrator.md (step 7c, TASK REVIEW)`. The lock file `factory/workflows.lock.json` records a hash and the commit of each named file; a changed hash marks the workflow stale.
- `description:` on the workflow, on every node, and on every edge of a branch (two or more edges from one node). Write what happens in plain words; a branch description says what decides the branch.

## Node kinds
- `group`: a phase in its own file, inlined; node ids stay the same, so ids must be unique across the root and all its groups. Leave a group with `END`; end the whole run with `FINISH`.
- `call`: a reusable step with its own input (`input: { key: "{{state.x.y}}" }`) and its own state; use it for steps shared by workflows (`olko-safe-source`, `olko-pr-merge`, `olko-review`, `olko-impl-checks`).
- `subgraph` with `enabledWhen: "switches.<name> == true"`: a part the user can switch off (tracker, editor, docker, obsidian, adopt).
- `llm`: one agent (`agent:`), several (`agents:` list or `agentsFrom: state.<path>`), or a skill as the agent (`skill:`). Give `role:` (a tier key), `tools: [read, edit, bash]` only when the step writes or runs commands, `dirs:` for folders outside the workspace, `parse:` for its last line, and `maxVisits:` when it is in a loop.
- `script`: a deterministic engine operation (`op:`, arguments in `with:`). Use it for git, counting, gates, file checks and journals.
- `interrupt`: a question to the user (`question: { id, text, allowed }`); without `allowed` the answer is free text. Its answer is `state.<node>.answer`.

## Conditions
- `when:` is ONE comparison: `<state path> <==|!=|>|<|>=|<=> <value>`; no `&&` or `||`. Join paths with a boolean the operation sets.
- Every path in a `when:` must exist when the edge is checked, or the run fails. Operations set every field they branch on.
- Edges from one node are checked in order; the last one has no `when:`. Only one unconditional edge per node pair.

## Engine operations and parsers
- Only operations and parsers that exist in `factory/src/ops.ts` and `factory/src/impl-ops.ts` may be used. Never invent a name.
- A step in the agent text that needs a new operation or parser: do not fake it with an llm node. Report it as `needs engine op: <proposed name>: <what it must do>`.

## Mapping an agent change
1. Read the diff of the source file and only the YAML files whose `source:` names it.
2. Change the smallest part that covers the diff; keep node ids stable so run history still matches.
3. A new main agent with no workflow: write the root workflow plus one group file per phase.
4. A removed agent or skill: remove or replace every node that names it.
5. Validate: `node factory/src/validate-workflows.ts [dir]` must print `workflows ok`.

## Verifying
Compare the YAML with the CURRENT agent text, step by step: every hard rule, gate, question and loop of the text has a node or edge; nothing in the YAML contradicts the text; branch descriptions match their conditions. Report each gap with the agent line and the YAML node.

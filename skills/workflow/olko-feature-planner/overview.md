# Overview

Use this skill from the delegated Feature/Task subagent. Start with a rough idea or an existing Epic, Feature, or Task. An issue ID or implementation plan is not required. This skill owns the backlog; when the caller requested implementation planning too, return the complete accepted hierarchy so the orchestrator can create all Task plans in the same session.

Help the user define the intended behavior. Inspect the current app or related issues when useful. Ask only about decisions that evidence cannot resolve. Record and present all answerable open questions together as one batch. Wait until every question is answered or closed before recalculating or revising the complete affected Feature and Task breakdown. If answers reveal new gaps, present the full follow-up batch together. Do not revise or publish a draft while required decisions remain open.

## Modes

- **Backlog mode** (default): draft or revise the Epic, Feature, and Task hierarchy, then hand it to the two-pass tracker flow.
- **`context` mode**: read only the supplied issue and its parent or child issues, and return the relevant scope and acceptance criteria to the caller without drafting or writing issues.

## Output rules

- Write issue content in the project's tracker language; keep every code and technical artifact in English.
- One Feature per developer-sized outcome; one Task per production PR.
- A Task is acceptable only when it is verifiable after its own merge.
- Do not invent personas, metrics, deadlines, roles, or ceremonies.

Load `workflow.md` for the ordered procedure, `examples.md` for the Task description shape, and `edge-cases.md` for approval gates and strict rules.

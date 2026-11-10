---
name: olko-plan-backlog-discovery
version: 1.0.0
description: "Epic/Feature/Task discovery path of olko-plan-documentation-orchestrator: draft, one content review, approval-gated publish to YouTrack, and read-back."
---

# olko-plan-backlog-discovery

Load when `olko-plan-documentation-orchestrator` routes a request to EPIC/FEATURE/TASK DISCOVERY.

## Adaptation
1. Read `.agents/skill-config.md` when present.
2. If `projectAdapter` is not `false`, load `.agents/skills/olko-plan-backlog-discovery/project.md` when present.
3. Apply rules in this order: Configuration, Project Adapter, AGENTS.md, then this skill.

## Procedure

- EPIC/FEATURE/TASK DISCOVERY: Use this path when the user wants to explore an idea or create or refine tracker issues. Delegate to `olko-feature-backlog-writer` in `draft` mode. Pass the user's idea or issue ID.

  Use an Epic when the outcome spans multiple independently valuable Features. The Epic owns the business goal and progress-by-Feature map. Each Feature owns a business goal and progress-by-Task map. Each Task must be one independently acceptable PR.

  The backlog writer owns the discussion, acceptance criteria, behavior flow, manual checks, Task slicing, and tracker access. Record all currently answerable questions as one batch and present the complete batch together. Wait until every question is answered or closed before revising the backlog. If answers reveal more questions, present the full follow-up batch together and wait before recalculating.

  When the draft is ready, show the proposed Epic/Feature/Task hierarchy for one content review. If an existing Task misses a checklist item, show the missing items and the exact proposed edit. Ask for separate, explicit approval to update that issue. Pass the accepted draft and any required issue-level approval to the same subagent in `publish` mode. Read back and report the verified issue links.

  Do NOT create a plan directory, call `olko-plan-editor`, or run implementation-readiness checks on this path. A Feature can exist before an implementation plan.

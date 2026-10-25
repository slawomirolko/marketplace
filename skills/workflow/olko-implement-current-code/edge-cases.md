# Olko Implement Current Code — Edge Cases

## Stop and route back to planning when

- Task ID, owning Feature, approved Task plan, or independently deliverable outcome is missing.
- Any changed path is unrelated to the Task or the counted code diff exceeds 15 paths. Documentation and knowledge-base paths are outside that budget and are reported separately; they must still belong to the Task's approved scope.
- The implementation changes Feature behavior, acceptance, contracts, domain
  models/value objects, dependencies, or independent delivery safety.
- The source file list is uncertain or the target worktree contains conflicting
  edits.

Use the normal planning and Task-impact workflow to resolve these cases. Do not
hide scope changes as file transfers.

## Source and target safety

- Never reset, clean, stash-pop, or otherwise discard changes from the source
  checkout.
- Never overwrite a target path that differs from both the source change and
  its base version. Stop and report the conflict.
- Do not stage or modify plan documents, the shared Feature tracker, or unrelated
  files as part of the code transfer.
- Keep Task work isolated from the main Compose project. Runtime checks belong
  to `olko-implementation-orchestrator` and follow its worktree isolation rules.

## Handoff

- This skill owns inventory, Task-scope validation, and safe file transfer
  only. The orchestrator owns all audits, verification, delivery, and cleanup.
- If the caller cannot continue with the orchestrator, return the handoff record
  and stop. Never create a separate commit or merge path.

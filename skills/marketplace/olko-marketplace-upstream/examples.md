# Olko Marketplace Upstream

## Examples

### classification.json
```json
{
  "baseUnknown": false,
  "hunks": [
    { "file": "workflow.md", "kind": "portable", "text": "3. Validate the input before you report it." },
    { "file": "workflow.md", "kind": "adapter", "text": "Run `make ci-fast` before the report." }
  ]
}
```
The second hunk names a project command. It is reverted in the staged copy and stays out of the PR.

### Commit subject
`feat(skills): upstream change to sample-skill` (the plan's `title`). No AI attribution, no project name.

### Draft PR
```bash
gh pr create --draft --base main --head feature/upstream-sample-skill-1a2b3c4d --title "feat(skills): upstream change to sample-skill" --body-file /tmp/olko-upstream-x/body.md --label upstream-candidate
```

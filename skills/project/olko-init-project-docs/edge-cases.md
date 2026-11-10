# Edge Cases

## Re-runs
- Never overwrite an existing file. Create only the missing files.
- A new entry for an existing file (an ADR, a log row, a rule, a C4 line) goes through the same grill question and is written as a shown diff after approval.
- An existing entry that the code no longer follows → show the entry and the evidence, and ask: keep it, update it (exact new text), or mark the ADR `Superseded by NNNN` with a new ADR. Never change it silently.

## Conflicts
- A candidate rule contradicts `AGENTS.md` → stop on that candidate and ask which one holds; propose the fix to the other source. Write nothing for it until the user decides.
- Two candidates contradict each other → present both in one question; the user picks one or skips both.

## Strict rules
- Read-only scan: never run builds, tests, migrations, or containers to collect evidence.
- Never write before the user approves the exact text.
- Never commit, push, or create a branch.
- Never copy `file:line` evidence into a store file.
- Never name a single source file, class, or function in an ADR or rule; name the module or layer.
- Never write secrets, credentials, connection strings, or personal data into a store file, even when the scan finds them; report the finding instead.

## Uncommon branches
- No evidence for a part (for example no deployment configuration for C4) → say so and ask whether to write an empty file with headings only, or skip the part.
- The user limits the run to one part → scan and grill only that part.
- A monorepo with several systems → ask whether to keep one store at the root or one per system; record the directories in that system's adapter.

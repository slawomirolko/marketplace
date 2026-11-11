# Token and Cache Optimization

Use for agent prompts, SKILL.md files, skill descriptions, and context files that load on every model step. Verify provider facts against the docs of the version in use; they change.

## What loads on every step
- The agent body is its system prompt. Project instructions (`AGENTS.md`, `instructions`) and the list of allowed skills are added to it. The order is not documented. — https://opencode.ai/docs/agents/
- The skill list has only id, name, and description; a skill body enters the context only when the `skill` tool loads it, and its supporting files only when read. The list is sent again at each model step; a `deny` skill is not listed. — https://opencode.ai/docs/skills/
- A subagent starts with a fresh context: its own prompt plus the task. — https://opencode.ai/docs/agents/

## Cache rules
- Providers cache the longest matching prompt prefix. Any change early in the prompt, in tool names, descriptions, schemas, or order, or a compaction, makes the rest a miss. — https://developers.openai.com/api/docs/guides/prompt-caching
- Hits are much cheaper than misses (OpenAI: up to 95% off; DeepSeek flash: about 1/50). — https://api-docs.deepseek.com/quick_start/pricing
- Ollama Cloud caches automatically; keep the prefix stable. Local Ollama: default context is 4096 tokens — set `num_ctx` above the prompt size; keep `keep_alive` constant. — https://docs.ollama.com/faq
- OpenCode: `settings.cache.ttl` sets the cache lifetime per provider/model; OpenAI gets `prompt_cache_key`. Warming sends real, billed requests and covers top-level sessions only. — https://opencode.ai/docs/models/ , https://opencode.ai/docs/warming/

## Practices
1. **Stable prefix.** Files loaded on every step change only when their rules change. A dated note, a session reference, an absolute path, or a version literal signals content that churns or belongs to one user; move it out or delete it. Static text never breaks the cache inside a session; edits between sessions do.
2. **Stable tools and skills.** Do not change permissions or the skill allowlist during a session. Keep skill descriptions short: they are sent at every step.
3. **Split by frequency of use, not by topic.** Every step → keep. One step, one stack, or once per feature → on-demand skill, loaded in that step. Detail → skill reference file. A skill body is appended at the end of the context, so loading it does not break the cached prefix.
4. **Subagents only for isolation.** Each call sends the full child prompt plus the task; multi-agent systems use about 15× the tokens of chat. A subagent pays off when it reads a lot and returns a short summary (about 1,000–2,000 tokens). — https://www.anthropic.com/engineering/multi-agent-research-system , https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
5. **Duplication between agents is fine** when each agent needs the block on every step; each agent reads only its own prompt.
6. **Placement.** Hard rules first, the output contract last; the middle of a long prompt is used least. — https://arxiv.org/abs/2307.03172
7. **Examples over rules.** Prefer 1–3 diverse, canonical examples to a list of rules about the same behavior. — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
   - Keep as rules what an example cannot express: `NEVER` bans, numeric thresholds, edge conditions.
   - An example MUST NOT contradict a remaining rule; mismatches degrade results. — https://developers.openai.com/api/docs/guides/reasoning-best-practices
   - Several examples MUST differ; uniform examples get imitated. — https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus
   - Reasoning models often need no examples; add them for complex output formats.
8. **Append-only context.** Do not ask the agent to rewrite earlier messages or files it keeps in context; append instead. — https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus
9. **Measure.** Check `cached_tokens` (OpenAI) or `prompt_cache_hit_tokens` (DeepSeek) after a change.

## Section classes for a split plan
| Class | Meaning | Action |
|---|---|---|
| `every-step` | Needed on every model step: hard rules, step order, output contract | Keep in the prompt |
| `one-step` | Needed only in one numbered step | Move to a skill; the step says "load skill X" |
| `one-stack` | Needed only for one stack or file type | Move to a skill; load it when that stack changes |
| `rare` | Needed once per feature, on failure, or on resume | Move to a skill or reference file |
| `detail` | Examples, templates, long tables | Skill reference file, read on demand |
| `heavy-read` | Reads many files to answer one question | Subagent with a short-summary contract |
| `discoverable` | Found in code within seconds | Remove |

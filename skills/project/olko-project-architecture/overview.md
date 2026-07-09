# Olko Project Architecture Overview

Checks whole-monorepo architecture with marketplace defaults: top-level separation (`apps`/`services`/`platform`), DDD module layering (api/application/domain/infrastructure/contracts), dependency direction, cross-surface communication via platform contracts + messaging, shared-code ownership, independent buildability. Delegates the `ai/` subtree to `olko-ai-architecture` when declared in `uses`. Use during plan review, onboarding a new surface/module, or standalone.

Load `SKILL.md` for the canonical workflow and rule list.

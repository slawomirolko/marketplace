---
name: olko-clean-docker
description: "Prune Docker build cache and unused images, then compact the WSL2 VHDX virtual disk to reclaim space on the Windows host. Preserves all named volumes (never deletes DB data). Reads dockerDesktopExe and dockerVhdxPath from skill-config; compaction requires Docker Desktop on WSL2. Triggers: 'clean docker', 'prune docker', 'docker using too much space', 'compact docker disk', 'olko-clean-docker'."
---

# olko-clean-docker

## Routing Summary
Reclaim Docker Desktop disk space on a Windows host. Prune build cache + unused images, preserve every named volume, compact the WSL2 `docker_data.vhdx` offline, then restart Docker. Reads host paths (`dockerDesktopExe`, `dockerVhdxPath`) from `.agents/skill-config.md`; loads `.agents/skills/olko-clean-docker/project.md` when present.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or command examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - what it does, when to use, prerequisites, config keys, default behavior.
- `workflow.md` - ordered cleanup + compaction steps (clear prose; irreversible ops).
- `examples.md` - `docker system df` before/after shape, config + diskpart snippets.
- `edge-cases.md` - "file in use", WSL won't stop, VHDX not found, strict rules.

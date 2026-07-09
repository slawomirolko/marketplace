# olko-clean-docker

## Overview
Reclaim Docker Desktop disk space on a Windows host. Prune build cache + unused images, preserve all named volumes, compact the WSL2 VHDX offline, restart Docker. Frees space Windows can actually see — the VHDX does not auto-shrink after pruning.

## When to use
"clean docker", "prune docker", "docker using too much space", "compact docker disk", Docker Desktop disk full, host C: drive bloated by Docker.

## Prerequisites
- Windows host + Docker Desktop on the WSL2 backend
- Docker Desktop runnable (skill starts it if down)
- `diskpart` available (admin elevation may be required to compact the VHDX)

## Resolution order
1. Read `.agents/skill-config.md` for host paths.
2. Load `AGENTS.md` in scope.
3. Load `.agents/skills/olko-clean-docker/project.md` when present — the project adapter overrides defaults.
4. Run `workflow.md`.

Precedence: Configuration > Project Adapter > AGENTS.md > this skill.

## Config keys (`.agents/skill-config.md`)
| Key | Default | Meaning |
|-----|---------|---------|
| `dockerDesktopExe` | `C:\Program Files\Docker\Docker\Docker Desktop.exe` | Docker Desktop executable path |
| `dockerVhdxPath` | `$env:LOCALAPPDATA\Docker\wsl\disk\docker_data.vhdx` | WSL2 Docker data VHDX to compact |

Defaults apply when a key is absent. Any present value overrides.

## Default behavior
- Prune ALL build cache + ALL images not referenced by a running container.
- NEVER prune volumes (hard rule — see edge-cases).
- Compact the VHDX offline (stops Docker + WSL), then restart Docker.
- Report `docker system df` and VHDX size before and after.

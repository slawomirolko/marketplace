# olko-clean-docker

## Edge cases
- **diskpart reports "file in use"** — a Docker or WSL process is still holding the VHDX. Repeat Step 6 (kill `com.docker.*`, `Docker*`, `wsl*`, `wslhost*`, `wslrelay*`, `wslservice*`, `msrdc*`), confirm `wsl --list --running` is empty, then retry Step 7.
- **A WSL distro won't stop** — run `wsl --shutdown`, wait a few seconds, then `wsl --terminate docker-desktop`. Re-check `wsl --list --running`. Do not compact while any distro is running.
- **VHDX not found at the resolved path** — `dockerVhdxPath` is misconfigured or Docker uses a non-default data root. Confirm the real path (Docker Desktop → Settings → Resources → Advanced, or inspect `wsl --list -v`) and set `dockerVhdxPath` in `.agents/skill-config.md`.
- **Docker Desktop path wrong** — if `Start-Process $dockerDesktopExe` fails, set `dockerDesktopExe` in `.agents/skill-config.md` to the actual install location.
- **diskpart needs elevation** — VHDX compact may require an elevated shell. Re-run the compact step from an admin terminal.
- **Prune removed an image the user wanted** — `docker image prune -a -f` only removes images not referenced by any container. Running containers' images are safe. A stopped container's image is also preserved while the container exists.

## Rules
- NEVER delete named volumes — they contain database and persistent data.
- NEVER run `docker system prune -a --volumes` — the `--volumes` flag destroys volume data.
- Always compact the VHDX after pruning, otherwise Windows will not see the freed space.
- The VHDX must be unmounted (Docker and WSL fully stopped) before `diskpart` can compact it.
- After compacting, restart Docker Desktop so services come back online.
- The named-volume count from Step 5 must equal the count from Step 2; if any volume disappeared, stop and investigate before continuing.

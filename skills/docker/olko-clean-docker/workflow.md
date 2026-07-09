# olko-clean-docker

## Workflow — follow these steps in order

Resolve the two host paths before starting. Read them from `.agents/skill-config.md`
(`dockerDesktopExe`, `dockerVhdxPath`); use the documented defaults when a key is absent.
Load `.agents/skills/olko-clean-docker/project.md` when it exists and apply any overrides.

For the commands below, `$dockerDesktopExe` and `$dockerVhdxPath` hold the resolved values.

### Step 1 — Ensure Docker Desktop is running

```powershell
Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
if (-not $?) { Start-Process $dockerDesktopExe }
```

Wait for the daemon. Poll `docker info` every 5 seconds, up to 60 seconds, before continuing.

### Step 2 — Assess current usage

```powershell
docker system df
```

Report the current breakdown (images, containers, volumes, build cache) to the user.

### Step 3 — Prune build cache

```powershell
docker builder prune -a -f
```

Removes all unused build cache layers. This can take 1–2 minutes.

### Step 4 — Prune unused images

```powershell
docker image prune -a -f
```

Removes all images not referenced by any container. Images used by active containers are preserved.

### Step 5 — Verify volumes are preserved

```powershell
docker volume ls
docker system df
```

Confirm the named-volume count and list are unchanged from Step 2 — no named volume may
disappear. Report the final `docker system df` to the user. (This skill never prunes volumes;
this step only verifies that invariant held.)

### Step 6 — Stop Docker and WSL

The VHDX does not auto-shrink after pruning. It must be compacted offline.

```powershell
# Stop Docker Desktop
Get-Process "Docker Desktop" -ErrorAction SilentlyContinue | Stop-Process -Force

# Shut down WSL
wsl --shutdown

# Terminate the docker-desktop distro specifically
wsl --terminate docker-desktop

# Kill any lingering Docker/WSL processes
Get-Process -Name "com.docker.*","Docker*","wsl*","wslhost*","wslrelay*","wslservice*","msrdc*" -ErrorAction SilentlyContinue | Stop-Process -Force
```

Verify no WSL distros are running:

```powershell
wsl --list --running
```

### Step 7 — Compact the VHDX

```powershell
$script = @"
select vdisk file="$dockerVhdxPath"
compact vdisk
"@
$script | diskpart
```

This can take 5–10 minutes. If `diskpart` reports the file is in use, repeat Step 6 to clear
remaining processes, then retry.

### Step 8 — Verify final size

```powershell
Get-ChildItem -Path $dockerVhdxPath |
    Select-Object FullName, @{N='SizeGB';E={[math]::Round($_.Length/1GB,2)}}
```

Report before/after sizes to the user.

### Step 9 — Restart Docker Desktop and WSL

After compacting, restart Docker Desktop so services are available again:

```powershell
Start-Process $dockerDesktopExe
```

Wait for the daemon. Poll `docker info` every 5 seconds, up to 60 seconds. Docker Desktop
auto-launches the `docker-desktop` WSL distro.

# olko-clean-docker

## Examples
Load this file only when concrete output shape or command examples are needed.

## docker system df — output shape

Before prune:
```
TYPE            TOTAL   ACTIVE  SIZE      RECLAIMABLE
Images          24      3       18.5GB    15.2GB (82%)
Containers      6       6       320MB     0B (0%)
Local Volumes   9       6       4.1GB     0B (0%)
Build Cache     380     0       9.7GB     9.7GB
```

After prune + compact, only the RECLAIMABLE SIZE / Build Cache rows should drop. The
`Local Volumes` row must be unchanged — volumes are never pruned.

## skill-config.md example

```yaml
dockerDesktopExe: "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"
dockerVhdxPath: "C:\\Users\\sawek\\AppData\\Local\\Docker\\wsl\\disk\\docker_data.vhdx"
```

Omit a key to use its default.

## diskpart compact script (Step 7)

The generated script fed to `diskpart`:

```
select vdisk file="C:\Users\sawek\AppData\Local\Docker\wsl\disk\docker_data.vhdx"
compact vdisk
```

## VHDX size check (Step 8)

```
FullName      : C:\Users\sawek\AppData\Local\Docker\wsl\disk\docker_data.vhdx
SizeGB        : 23.41
```

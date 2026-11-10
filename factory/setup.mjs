import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const factoryDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(factoryDir, "app");
const image = process.env.FACTORY_IMAGE ?? "skill-factory-poc:0.3";

function run(label, command, args, cwd) {
  console.log(`\n== ${label}: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`${label} failed (exit ${result.status ?? result.error?.message})`);
    process.exit(1);
  }
}

const [major] = process.versions.node.split(".").map(Number);
if (major < 24) {
  console.error(`Node 24 or newer is required, found ${process.versions.node}`);
  process.exit(1);
}

run("viewer dependencies", "pnpm", ["install", "--frozen-lockfile"], appDir);
run("viewer build", "pnpm", ["run", "build"], appDir);
run("factory image", "docker", ["build", "-t", image, "."], factoryDir);

console.log(`
Factory image ${image} is ready. Start it (localhost only):

  docker run -d --name skill-factory --read-only --tmpfs /tmp --tmpfs /data:uid=10001 \\
    --cap-drop ALL --security-opt no-new-privileges -p 127.0.0.1:7340:7340 \\
    -e FACTORY_HOST=0.0.0.0 -e FACTORY_TOKEN --entrypoint node ${image} src/server.mjs

MCP endpoint: http://127.0.0.1:7340/mcp (Authorization: Bearer $FACTORY_TOKEN)
Run viewer:   http://127.0.0.1:7340/viewer/ (every run response has its own viewerUrl)
`);

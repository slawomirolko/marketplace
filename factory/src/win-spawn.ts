import fs from "node:fs";
import path from "node:path";

/** Characters cmd.exe treats specially on a command line; each gets a caret so cmd.exe passes it through as text. */
const CMD_META = /([()\][%!^"`<>&|;, *?])/g;
const LINE_BREAK = /[\r\n\0]/;
const SHIM_EXTENSIONS = new Set([".cmd", ".bat"]);
const DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD";

/** How to start one program without a shell: the file to spawn, its arguments and whether Node must pass them unchanged. */
export interface SpawnPlan {
  file: string;
  args: string[];
  windowsVerbatimArguments: boolean;
}

/**
 * Quotes one argument for a program started through `cmd.exe /d /s /c`: first the Windows C runtime rules
 * (backslashes before a quote are doubled, the quote is escaped, the whole argument is quoted),
 * then a caret before every cmd.exe metacharacter, so `&`, `|`, `%`, `^` and `"` stay plain text.
 */
export function escapeCmdArgument(argument: string): string {
  if (LINE_BREAK.test(argument)) {
    throw new Error("a command argument must not contain a line break or a NUL character");
  }
  const quotedForRuntime = `"${argument.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1")}"`;
  return quotedForRuntime.replace(CMD_META, "^$1");
}

/**
 * Escapes one argument for a .cmd/.bat shim: cmd.exe parses the line once to start the shim and the shim's `%*`
 * is parsed again, where `\"` does not keep a quote open, so the carets are doubled to survive both passes.
 */
export function escapeShimArgument(argument: string): string {
  return escapeCmdArgument(argument).replace(CMD_META, "^$1");
}

/** Escapes the program path of a `cmd.exe /d /s /c` command line with carets; it is not quoted. */
export function escapeCmdCommand(command: string): string {
  if (LINE_BREAK.test(command)) {
    throw new Error("a command path must not contain a line break or a NUL character");
  }
  return command.replace(CMD_META, "^$1");
}

/** Finds a bare command name on PATH the way Windows does (PATHEXT order); returns the name unchanged when it holds a path or is not found. */
export function resolveExecutable(command: string, env: NodeJS.ProcessEnv = process.env): string {
  if (command.includes("/") || command.includes("\\")) {
    return command;
  }
  const directories = (env.PATH ?? env.Path ?? "").split(path.delimiter).filter(Boolean);
  const extensions = (env.PATHEXT ?? DEFAULT_PATHEXT).split(";").filter(Boolean);
  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = path.join(directory, command + extension.toLowerCase());
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }
  return command;
}

/**
 * Plans a shell-free start of a command-line tool. Off Windows, and for .exe files, the program runs directly.
 * An npm .cmd/.bat shim runs through `cmd.exe /d /s /c` with every argument escaped, so no argument can start a second command.
 */
export function spawnPlan(command: string, args: string[], env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): SpawnPlan {
  if (platform !== "win32") {
    return { file: command, args, windowsVerbatimArguments: false };
  }
  const resolved = resolveExecutable(command, env);
  if (!SHIM_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
    return { file: resolved, args, windowsVerbatimArguments: false };
  }
  const commandLine = [escapeCmdCommand(resolved), ...args.map(escapeShimArgument)].join(" ");
  return { file: env.ComSpec ?? env.COMSPEC ?? "cmd.exe", args: ["/d", "/s", "/c", `"${commandLine}"`], windowsVerbatimArguments: true };
}

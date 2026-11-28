/**
 * Small helpers shared by the root scripts of a marketplace checkout.
 *
 * Only root scripts import this module. Skill scripts stay self-contained (an installed skill copy
 * has no root `scripts/` folder), so they keep their own copies; see docs/skill-adaptation-contract.md.
 */
import fs from "node:fs";

/** Reads and parses a JSON file; throws on a missing file or invalid JSON. */
export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/**
 * Parses `--flag value` arguments into an options object. `values` maps a flag that takes the next
 * argument to its option key, `switches` maps a flag without a value to its option key (set to true).
 * Any other argument throws `Unknown argument: <argument>`.
 */
export function parseFlags(argv, { values = {}, switches = {} } = {}, options = {}) {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (Object.hasOwn(switches, argument)) {
      options[switches[argument]] = true;
    } else if (Object.hasOwn(values, argument)) {
      index += 1;
      options[values[argument]] = argv[index];
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

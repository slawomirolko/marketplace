/**
 * Runs `action` while console.error writes into a list, and returns the lines. Other code in the process (a timer of
 * an earlier test, a background run) may log too, so callers filter the lines by their run id, tool or path.
 */
export async function capturedErrors(action: () => unknown): Promise<string[]> {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...parts: unknown[]) => {
    lines.push(parts.map(String).join(" "));
  };
  try {
    await action();
  } finally {
    console.error = original;
  }
  return lines;
}

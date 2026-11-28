/** Pause between two checks of a polled condition. */
export const POLL_INTERVAL_MS = 10;
/** How long a polled condition may take before the test fails. */
export const POLL_TIMEOUT_MS = 5000;

export interface PollOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls `probe` until it returns a truthy value and returns that value. On timeout it fails with
 * "timed out waiting for <what>"; `what` may be a function so the message can show the last value seen.
 */
export async function until<T>(probe: () => T | Promise<T>, what: string | (() => string), { timeoutMs = POLL_TIMEOUT_MS, intervalMs = POLL_INTERVAL_MS }: PollOptions = {}): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) {
      return value as NonNullable<T>;
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${typeof what === "function" ? what() : what}`);
    }
    await sleep(intervalMs);
  }
}

/** Waits until the run has one of `statuses` and returns it. */
export function runReaches<R extends { status: string }>(factory: { get(runId: string): R }, runId: string, statuses: string | string[], options: PollOptions = {}): Promise<R> {
  const wanted = typeof statuses === "string" ? [statuses] : statuses;
  let last = "";
  return until(
    () => {
      const run = factory.get(runId);
      last = run.status;
      return wanted.includes(run.status) ? run : undefined;
    },
    () => `run ${runId} to reach ${wanted.join("|")}, last ${last}`,
    options,
  );
}

/** Reads a status payload until its status is one of `statuses` and returns it. `check` runs on every payload, for example an assertion every response must pass. */
export function pollUntil<P extends { status?: string }>(read: () => Promise<P>, statuses: string[], { check, ...options }: PollOptions & { check?: (payload: P) => void } = {}): Promise<P> {
  let last: string | undefined;
  return until(
    async () => {
      const payload = await read();
      check?.(payload);
      last = payload.status;
      return payload.status && statuses.includes(payload.status) ? payload : undefined;
    },
    () => `${statuses.join("|")}, last ${last}`,
    options,
  );
}

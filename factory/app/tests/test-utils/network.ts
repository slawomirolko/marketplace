import { act, waitFor } from "@testing-library/react";
import { server } from "./server.ts";

/** Rounds of "no request in flight, then one task turn" before the network counts as settled. */
const SETTLE_ROUNDS = 20;

const inFlight = new Set<string>();
let startedCount = 0;
const unhandled: string[] = [];

server.events.on("request:start", ({ requestId }) => {
  inFlight.add(requestId);
  startedCount += 1;
});
server.events.on("request:end", ({ requestId }) => {
  inFlight.delete(requestId);
});

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Waits until every request the page made has been answered and the page has had a task turn to apply the answers,
 * with no new request started meanwhile. Use it as the positive signal before asserting that something did not happen.
 */
export async function settleNetwork(): Promise<void> {
  for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
    await waitFor(() => expect(inFlight.size).toBe(0));
    const before = startedCount;
    await act(nextTask);
    if (inFlight.size === 0 && startedCount === before) {
      return;
    }
  }
  throw new Error(`the page kept making requests for ${SETTLE_ROUNDS} rounds`);
}

/** The onUnhandledRequest strategy of the test server: prints the MSW error, records the request and fails the fetch without touching the network, so the test fails in afterEach even when the page catches the failed fetch. */
export function recordUnhandledRequest(request: Request, print: { error(): void }): void {
  unhandled.push(`${request.method} ${request.url}`);
  print.error();
  throw new Error(`no handler for ${request.method} ${request.url}`);
}

/** Forgets the requests of the previous test and returns the ones no handler answered. */
export function resetNetwork(): string[] {
  inFlight.clear();
  return unhandled.splice(0);
}

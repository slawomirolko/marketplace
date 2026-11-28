export const API = `${import.meta.env.BASE_URL}api`;

/** How often the viewer reloads data that changes while a run is live: the open run, the run list and the pending decisions. */
export const LIVE_REFRESH_MS = 15_000;

/** Shown when a change is refused with 401: a server beyond loopback keeps the token from the page, so the viewer is read-only there. */
export const READ_ONLY_NOTE = "This viewer is read-only here: changes need the factory token, which the page does not get. Use the factory tools, or open the viewer on the factory machine.";

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function bodyOf(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function serverError(body: unknown): string | null {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string" && body.error) {
    return body.error;
  }
  return null;
}

/**
 * The error of a failed response: the read-only note for 401; for a read the label and status plus the server's
 * error text; for an action the server's error text alone (it is written for the user), else the label and status.
 */
async function failureOf(response: Response, label: string, isAction: boolean): Promise<Error> {
  if (response.status === 401) {
    return new Error(READ_ONLY_NOTE);
  }
  const reason = serverError(await bodyOf(response));
  if (isAction && reason) {
    return new Error(reason);
  }
  return new Error(`${label}: ${response.status}${reason ? ` (${reason})` : ""}`);
}

/** Fetches JSON from a full URL; a non-ok status throws before the body is parsed, so an HTML or empty error page cannot hide it. */
export async function requestJson<T>(url: string, label: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw await failureOf(response, label, init?.method === "POST");
  }
  return (await response.json()) as T;
}

export function getJson<T>(path: string): Promise<T> {
  return requestJson<T>(`${API}${path}`, path);
}

/** A viewer action: a POST with the `x-factory-action` header the server requires from its own page. */
export function postAction<T>(url: string, action: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "x-factory-action": action };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  return requestJson<T>(url, `${action} failed`, { method: "POST", headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

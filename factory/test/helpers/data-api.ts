/** The host the data API tests present: the default run page address. */
export const ALLOWED_HOST = "127.0.0.1:7340";
export const ALLOWED_HOSTS: ReadonlySet<string> = new Set([ALLOWED_HOST]);
export const ALLOWED_ORIGIN = `http://${ALLOWED_HOST}`;

export interface ApiCallResult {
  status: number | "next";
  body?: any;
}

type Listener = (chunk?: unknown) => void;
type Middleware = (req: any, res: any, next: () => unknown) => unknown;

/**
 * Calls a data API middleware (apiMiddleware(api, ALLOWED_HOSTS)) the way the HTTP server does. The middleware is
 * passed in so test files that set env variables before importing src modules keep control of that order.
 * A request body is delivered through the data and end events; "next" means the middleware did not handle the URL.
 */
export function callerFor(middleware: Middleware) {
  return (method: string, url: string, options: { headers?: Record<string, string>; body?: unknown } = {}) =>
    new Promise<ApiCallResult>((resolve, reject) => {
      const res = { writeHead: (status: number) => ({ end: (body: string) => resolve({ status, body: JSON.parse(body) }) }) };
      const listeners: Record<string, Listener[]> = {};
      const req = {
        method,
        url,
        headers: options.headers ?? {},
        on(event: string, listener: Listener) {
          (listeners[event] ??= []).push(listener);
          if (event === "end") {
            queueMicrotask(() => {
              if (options.body !== undefined) {
                for (const onData of listeners.data ?? []) {
                  onData(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
                }
              }
              for (const onEnd of listeners.end ?? []) {
                onEnd();
              }
            });
          }
          return req;
        },
      };
      Promise.resolve()
        .then(() => middleware(req, res, () => resolve({ status: "next" })))
        .catch(reject);
    });
}

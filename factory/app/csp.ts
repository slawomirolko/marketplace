import { randomBytes } from "node:crypto";

export const NONCE_PLACEHOLDER = "FACTORYCSPNONCEPLACEHOLD";

export interface HtmlResponse {
  headersSent: boolean;
  getHeader(name: string): unknown;
  setHeader(name: string, value: string): unknown;
  removeHeader(name: string): void;
  end(chunk?: unknown, ...rest: unknown[]): unknown;
}

export function createNonce(): string {
  return randomBytes(18).toString("base64");
}

export function cspHeader(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' ws://127.0.0.1:* ws://localhost:*",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function isHtml(res: HtmlResponse): boolean {
  return String(res.getHeader("content-type") ?? "").includes("text/html");
}

export function cspMiddleware({ nonceFactory = createNonce }: { nonceFactory?: () => string } = {}) {
  return (_req: unknown, res: HtmlResponse, next: () => void): void => {
    const nonce = nonceFactory();
    const end = res.end.bind(res);
    res.end = (chunk?: unknown, ...rest: unknown[]) => {
      if (!chunk || !isHtml(res)) return end(chunk, ...rest);
      const html = (Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk)).replaceAll(NONCE_PLACEHOLDER, nonce);
      if (!res.headersSent) {
        res.setHeader("Content-Security-Policy", cspHeader(nonce));
        res.removeHeader("Content-Length");
      }
      return end(html, ...rest);
    };
    next();
  };
}

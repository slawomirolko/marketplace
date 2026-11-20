import test from "node:test";
import assert from "node:assert/strict";
import { cspHeader, cspMiddleware, createNonce, NONCE_PLACEHOLDER } from "../app/csp.ts";

interface FakeResponse {
  headersSent: boolean;
  body: string;
  getHeader(name: string): string | undefined;
  setHeader(name: string, value: string): void;
  removeHeader(name: string): void;
  end(chunk?: unknown): void;
  headers: Map<string, string>;
}

function fakeResponse(contentType: string): FakeResponse {
  const headers = new Map([["content-type", contentType], ["content-length", "999"]]);
  const res: FakeResponse = {
    headersSent: false,
    body: "",
    getHeader: (name) => headers.get(name.toLowerCase()),
    setHeader: (name, value) => {
      headers.set(name.toLowerCase(), value);
    },
    removeHeader: (name) => {
      headers.delete(name.toLowerCase());
    },
    end: (chunk) => {
      res.body = String(chunk);
    },
    headers,
  };
  return res;
}

function serve(contentType: string, body: string, nonceFactory?: () => string): FakeResponse {
  const res = fakeResponse(contentType);
  cspMiddleware({ nonceFactory })({}, res, () => {});
  res.end(body);
  return res;
}

const page = `<meta property="csp-nonce" nonce="${NONCE_PLACEHOLDER}" /><script type="module" nonce="${NONCE_PLACEHOLDER}">x</script>`;

test("html responses get a CSP header with the nonce that replaced the placeholder", () => {
  const res = serve("text/html", page, () => "abc123");
  assert.equal(res.body.includes(NONCE_PLACEHOLDER), false, "placeholder must not reach the browser");
  assert.equal(res.body.split('nonce="abc123"').length - 1, 2);
  const header = res.headers.get("content-security-policy") ?? "";
  assert.match(header, /script-src 'self' 'nonce-abc123'/);
  assert.match(header, /style-src 'self' 'nonce-abc123'/);
  assert.equal(res.headers.has("content-length"), false, "length is recomputed after the replacement");
});

test("the policy never allows inline or eval scripts or data: scripts", () => {
  const header = cspHeader("n");
  assert.doesNotMatch(header, /unsafe-inline|unsafe-eval/);
  assert.doesNotMatch(header.split("; ").find((d) => d.startsWith("script-src")) ?? "", /data:/);
  assert.match(header, /object-src 'none'/);
  assert.match(header, /frame-ancestors 'none'/);
});

test("each request gets a new nonce", () => {
  const first = serve("text/html", page).headers.get("content-security-policy");
  const second = serve("text/html; charset=utf-8", page).headers.get("content-security-policy");
  assert.notEqual(first, second);
  assert.equal(createNonce().length, NONCE_PLACEHOLDER.length);
});

test("non-html responses pass through unchanged", () => {
  const body = JSON.stringify({ text: NONCE_PLACEHOLDER });
  const res = serve("application/json", body, () => "abc123");
  assert.equal(res.body, body);
  assert.equal(res.headers.has("content-security-policy"), false);
  assert.equal(res.headers.get("content-length"), "999");
});

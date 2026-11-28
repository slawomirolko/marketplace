import { createHash, timingSafeEqual } from "node:crypto";

function digest(text: string): Buffer {
  return createHash("sha256").update(text).digest();
}

/** True when the Authorization header is exactly `Bearer <token>`; compares equal-length digests in constant time, so timing reveals neither the token nor its length. */
export function bearerMatches(header: string | undefined, token: string): boolean {
  return timingSafeEqual(digest(header ?? ""), digest(`Bearer ${token}`));
}

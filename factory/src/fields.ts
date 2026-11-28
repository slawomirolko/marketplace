/** The given fields without the empty ones (undefined, null, false, 0 or ""), for optional fields that are left out instead of set to nothing. */
export function definedFields<T extends Record<string, unknown>>(fields: T): { [K in keyof T]?: NonNullable<T[K]> } {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => Boolean(value))) as { [K in keyof T]?: NonNullable<T[K]> };
}

type EnvValues = Record<string, string | undefined>;

function apply(vars: EnvValues): EnvValues {
  const previous: EnvValues = {};
  for (const [name, value] of Object.entries(vars)) {
    previous[name] = process.env[name];
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  return previous;
}

function isPromise(value: unknown): value is Promise<unknown> {
  return typeof (value as { then?: unknown } | null)?.then === "function";
}

/**
 * Runs `action` with the given environment variables set (undefined removes one) and puts back the previous values
 * afterwards, also when `action` throws or its promise rejects.
 */
export function withEnv<T>(vars: EnvValues, action: () => T): T {
  const previous = apply(vars);
  let result: T;
  try {
    result = action();
  } catch (error) {
    apply(previous);
    throw error;
  }
  if (isPromise(result)) {
    return result.finally(() => apply(previous)) as T;
  }
  apply(previous);
  return result;
}

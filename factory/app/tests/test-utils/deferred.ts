export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

/** A promise the test settles itself, for a handler that must wait until the test lets it answer. */
export function deferred<T = void>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

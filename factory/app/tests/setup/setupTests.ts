import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { FLOW_HEIGHT, FLOW_WIDTH } from "../testUtils/flow-size.ts";
import { recordUnhandledRequest, resetNetwork } from "../testUtils/network.ts";
import { server } from "../testUtils/server.ts";

class ResizeObserverStub {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element): void {
    this.callback([{ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve(): void {}
  disconnect(): void {}
}

class DOMMatrixReadOnlyStub {
  m22: number;
  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([0-9.]+)\)/)?.[1];
    this.m22 = scale === undefined ? 1 : Number(scale);
  }
}

globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
globalThis.DOMMatrixReadOnly = DOMMatrixReadOnlyStub as unknown as typeof DOMMatrixReadOnly;
Object.defineProperties(HTMLElement.prototype, {
  offsetWidth: { configurable: true, get: () => FLOW_WIDTH },
  offsetHeight: { configurable: true, get: () => FLOW_HEIGHT },
});

beforeAll(() => server.listen({ onUnhandledRequest: recordUnhandledRequest }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  const unhandled = resetNetwork();
  if (unhandled.length > 0) {
    throw new Error(`requests no handler answered: ${unhandled.join(", ")}`);
  }
});
afterAll(() => server.close());

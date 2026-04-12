export type MemoryStorageSeed = Record<string, string>;

type MockWindowOptions = {
  dispatchEvent?: Window["dispatchEvent"];
  addEventListener?: Window["addEventListener"];
  removeEventListener?: Window["removeEventListener"];
};

export function createMemoryStorage(seed: MemoryStorageSeed = {}): Storage {
  const map = new Map(Object.entries(seed));

  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function ensureCustomEvent() {
  if (typeof globalThis.CustomEvent !== "undefined") return;

  class CustomEventPolyfill<T = unknown> extends Event {
    detail: T;

    constructor(type: string, params?: CustomEventInit<T>) {
      super(type, params);
      this.detail = params?.detail as T;
    }
  }

  Object.defineProperty(globalThis, "CustomEvent", {
    value: CustomEventPolyfill,
    writable: true,
    configurable: true,
  });
}

export function installMockWindow(
  seed: MemoryStorageSeed = {},
  options: MockWindowOptions = {},
) {
  const localStorage = createMemoryStorage(seed);

  const fakeWindow = {
    localStorage,
    dispatchEvent: options.dispatchEvent ?? (() => true),
    addEventListener: options.addEventListener ?? (() => undefined),
    removeEventListener: options.removeEventListener ?? (() => undefined),
  } as unknown as Window & typeof globalThis;

  Object.defineProperty(globalThis, "window", {
    value: fakeWindow,
    writable: true,
    configurable: true,
  });

  ensureCustomEvent();

  return {
    localStorage,
  };
}

export function uninstallMockWindow() {
  delete (globalThis as { window?: unknown }).window;
}

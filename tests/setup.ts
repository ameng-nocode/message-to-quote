// The lists keep their rows in the browser's localStorage. The tests run in Node, so they get a small stand-in.
const rows = new Map<string, string>();
const memoryStorage = {
  getItem: (k: string) => rows.get(k) ?? null,
  setItem: (k: string, v: string) => void rows.set(k, String(v)),
  removeItem: (k: string) => void rows.delete(k),
  clear: () => rows.clear(),
};
Object.assign(globalThis, {
  window: { localStorage: memoryStorage, addEventListener() {}, removeEventListener() {}, location: { href: "http://localhost/", hash: "", search: "", origin: "http://localhost" }, history: { replaceState() {} } },
  document: { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" },
});

export {};

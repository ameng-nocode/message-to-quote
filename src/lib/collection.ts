"use client";

import { useSyncExternalStore } from "react";

export type Row = { id: string };

/** Where a collection is kept. The app only talks to the in-memory copy; writes go out in the background. */
export type Persist<T> = {
  load(): Promise<T[]>;
  save(rows: T[]): Promise<void>; // insert or update
  remove(ids: string[]): Promise<void>;
};

/* ---------- save state, shared by every collection: shown as "Saved" / "Saving" / an error ---------- */

export type SyncState = "saved" | "saving" | "error";
let syncState: SyncState = "saved";
let inFlight = 0;
const syncListeners = new Set<() => void>();
function setSync(s: SyncState) {
  if (s === syncState) return;
  syncState = s;
  syncListeners.forEach((l) => l());
}
export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (cb) => {
      syncListeners.add(cb);
      return () => syncListeners.delete(cb);
    },
    () => syncState,
    () => "saved",
  );
}
/** Run a background write and show it in the save state. */
export async function track(job: () => Promise<void>) {
  inFlight++;
  setSync("saving");
  try {
    await job();
    if (--inFlight === 0) setSync("saved");
  } catch (e) {
    inFlight--;
    console.error("save failed", e);
    setSync("error");
  }
}

/** Every collection's pending writes, so a closing tab can send them first. */
const flushers = new Set<() => void>();
if (typeof window !== "undefined") {
  const flushAll = () => flushers.forEach((f) => f());
  window.addEventListener("pagehide", flushAll);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAll();
  });
}

/** A list of rows kept in memory, read synchronously by the UI, written out in the background.
    Writes are coalesced: typing in a field saves once the keys pause, not on every keystroke. */
export function createCollection<T extends Row>(persist: Persist<T>) {
  let rows: T[] = [];
  let loaded = false;
  const listeners = new Set<() => void>();
  const pending = new Map<string, T>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  // writes go out one after another, so a slow save never crosses the next one
  let chain: Promise<void> = Promise.resolve();
  const enqueue = (job: () => Promise<void>) => {
    chain = chain.then(() => track(job));
  };

  function emit() {
    listeners.forEach((l) => l());
  }
  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!pending.size) return;
    const batch = [...pending.values()];
    pending.clear();
    enqueue(() => persist.save(batch));
  }
  flushers.add(flush);
  function queue(list: T[]) {
    for (const r of list) pending.set(r.id, r);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 300);
  }
  function removeMany(ids: string[]) {
    if (!ids.length) return;
    const set = new Set(ids);
    rows = rows.filter((r) => !set.has(r.id));
    ids.forEach((id) => pending.delete(id));
    emit();
    enqueue(() => persist.remove(ids));
  }

  return {
    use(): T[] {
      return useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        () => rows,
        () => EMPTY as T[],
      );
    },
    all: () => rows,
    get: (id: string) => rows.find((r) => r.id === id),
    ready: () => loaded,
    /** Insert or replace by id. New rows go first. */
    put(row: T): T {
      const i = rows.findIndex((r) => r.id === row.id);
      rows = i >= 0 ? rows.map((r, j) => (j === i ? row : r)) : [row, ...rows];
      emit();
      queue([row]);
      return row;
    },
    putMany(list: T[]) {
      if (!list.length) return;
      const byId = new Map(list.map((r) => [r.id, r]));
      const kept = rows.map((r) => byId.get(r.id) ?? r);
      const fresh = list.filter((r) => !rows.some((x) => x.id === r.id));
      rows = [...fresh, ...kept];
      emit();
      queue(list);
    },
    removeMany,
    remove: (id: string) => removeMany([id]),
    async load() {
      rows = await persist.load();
      loaded = true;
      emit();
    },
    /** Forget everything in memory (signing out). */
    clear() {
      rows = [];
      loaded = false;
      pending.clear();
      emit();
    },
  };
}
const EMPTY: Row[] = [];

export type Collection<T extends Row> = ReturnType<typeof createCollection<T>>;

/** Rows kept in this browser's localStorage under one key. */
export function localPersist<T extends Row>(key: string): Persist<T> {
  const read = (): T[] => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T[]) : [];
    } catch {
      return [];
    }
  };
  const write = (list: T[]) => window.localStorage.setItem(key, JSON.stringify(list));
  return {
    async load() {
      return read();
    },
    async save(batch) {
      const list = read();
      const byId = new Map(list.map((r, i) => [r.id, i]));
      for (const r of batch) {
        const i = byId.get(r.id);
        if (i === undefined) list.unshift(r);
        else list[i] = r;
      }
      write(list);
    },
    async remove(ids) {
      const set = new Set(ids);
      write(read().filter((r) => !set.has(r.id)));
    },
  };
}

/** A random id. randomUUID only exists on https and localhost, so there is a fallback for a plain http LAN address. */
export function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

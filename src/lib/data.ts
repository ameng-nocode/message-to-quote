"use client";

import { useSyncExternalStore } from "react";
import { customers, setCustomersPersist } from "./customers";
import { setPictureStore } from "./files";
import { products, setProductsPersist } from "./products";
import { remoteCustomers, remoteProducts, remoteQuotations, remoteSettings, uploadPicture } from "./remote";
import { loadSettings, setSettingsPersist, type Settings } from "./settings";
import { quotations, setQuotationsPersist } from "./store";
import { SUPABASE_ON } from "./supabase";

if (SUPABASE_ON) {
  // Supabase mode: every list, the settings and the pictures live in the team's Supabase project
  setProductsPersist(remoteProducts);
  setCustomersPersist(remoteCustomers);
  setQuotationsPersist(remoteQuotations);
  setSettingsPersist(remoteSettings);
  setPictureStore(uploadPicture);
} else {
  // browser mode: settings in this browser, like the lists
  setSettingsPersist({
    async load() {
      try {
        const raw = window.localStorage.getItem("message-to-quote:settings");
        return raw ? (JSON.parse(raw) as Partial<Settings>) : null;
      } catch {
        return null;
      }
    },
    async save(s) {
      window.localStorage.setItem("message-to-quote:settings", JSON.stringify(s));
    },
  });
}

type Phase = "idle" | "loading" | "ready" | "error";
let phase: Phase = "idle";
let loadError = "";
const listeners = new Set<() => void>();
function set(p: Phase, err = "") {
  phase = p;
  loadError = err;
  listeners.forEach((l) => l());
}

/** Load settings and every list once. The app shows nothing until this is done, so pages can read the lists directly. */
export async function loadAll() {
  if (phase === "loading" || phase === "ready") return;
  set("loading");
  try {
    await Promise.all([loadSettings(), products.load(), customers.load(), quotations.load()]);
    set("ready");
  } catch (e) {
    console.error("load failed", e);
    const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
    set("error", msg);
  }
}

export function useDataPhase(): { phase: Phase; error: string } {
  const p = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => phase,
    () => "idle" as Phase,
  );
  return { phase: p, error: loadError };
}

"use client";

import { useSyncExternalStore } from "react";
import { track } from "./collection";
import { STANDARD_LIST, type PriceList } from "./types";

/** Which optional columns the printed quotation, PDF and Excel show. Item, quantity, unit price and amount always show. */
export type QuoteColumns = { photo: boolean; code: boolean; unit: boolean; discount: boolean };

export type Settings = {
  company: {
    name: string;
    regNo: string;
    address: string; // several lines
    phone: string;
    email: string;
    website: string;
    logo: string; // picture URL or data URL, "" = none
  };
  currency: string; // shown before every amount, e.g. RM, USD, S$
  quote: {
    title: string; // the heading on the paper
    prefix: string; // QT -> QT-ABC-2610-01
    validDays: number;
    delivery: string; // defaults for a new quotation
    payment: string;
    notes: string;
    bank: string; // payment details under the totals, several lines
    footer: string;
    columns: QuoteColumns;
  };
  tax: { enabled: boolean; name: string; rate: number };
  whatsapp: {
    countryCode: string; // added to local numbers that start with 0
    message: string; // template, see WA_FIELDS
  };
  priceLists: PriceList[]; // the first one is the standard list
};

/** Words the WhatsApp message template can use. */
export const WA_FIELDS = ["{customer}", "{number}", "{date}", "{items}", "{total}", "{valid}", "{company}"] as const;

export const DEFAULT_SETTINGS: Settings = {
  company: { name: "", regNo: "", address: "", phone: "", email: "", website: "", logo: "" },
  currency: "RM",
  quote: {
    title: "QUOTATION",
    prefix: "QT",
    validDays: 14,
    delivery: "",
    payment: "",
    notes: "",
    bank: "",
    footer: "",
    columns: { photo: true, code: true, unit: true, discount: false },
  },
  tax: { enabled: false, name: "SST", rate: 8 },
  whatsapp: {
    countryCode: "60",
    message: "Hello {customer},\n\nPlease find our quotation {number} dated {date}.\n\n{items}\n\nTotal: {total}\n{valid}\n\nThe PDF quotation is attached. Thank you.\n{company}",
  },
  priceLists: [{ id: STANDARD_LIST, name: "Standard" }],
};

export type SettingsPersist = {
  load(): Promise<Partial<Settings> | null>;
  save(s: Settings): Promise<void>;
};

/** Saved settings on top of the defaults, so a setting added in a later version still has a value. */
export function withDefaults(s: Partial<Settings> | null | undefined): Settings {
  const d = DEFAULT_SETTINGS;
  if (!s) return structuredClone(d);
  const lists = s.priceLists?.length ? s.priceLists : d.priceLists;
  return {
    company: { ...d.company, ...s.company },
    currency: s.currency ?? d.currency,
    quote: { ...d.quote, ...s.quote, columns: { ...d.quote.columns, ...s.quote?.columns } },
    tax: { ...d.tax, ...s.tax },
    whatsapp: { ...d.whatsapp, ...s.whatsapp },
    priceLists: lists[0].id === STANDARD_LIST ? lists : [{ id: STANDARD_LIST, name: "Standard" }, ...lists.filter((l) => l.id !== STANDARD_LIST)],
  };
}

let current: Settings = structuredClone(DEFAULT_SETTINGS);
let persist: SettingsPersist | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => DEFAULT_SETTINGS,
  );
}

export const getSettings = () => current;

export function setSettingsPersist(p: SettingsPersist) {
  persist = p;
}

export async function loadSettings() {
  current = withDefaults(persist ? await persist.load() : null);
  listeners.forEach((l) => l());
}

function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  const p = persist;
  const s = current;
  if (p) chain = chain.then(() => track(() => p.save(s)));
}
let chain: Promise<void> = Promise.resolve();
if (typeof window !== "undefined") window.addEventListener("pagehide", () => timer && flush());

/** Change some settings. Saved once typing pauses. */
export function saveSettings(fn: (s: Settings) => Settings) {
  current = fn(current);
  listeners.forEach((l) => l());
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 400);
}

export function priceListName(s: Settings, id: string): string {
  return s.priceLists.find((l) => l.id === id)?.name ?? "";
}

/** The price list called this (any case), if there is one. */
export function priceListByName(s: Settings, name: string): PriceList | undefined {
  const k = name.trim().toLowerCase();
  return s.priceLists.find((l) => l.name.trim().toLowerCase() === k);
}

export function hasCompany(s: Settings) {
  return Boolean(s.company.name.trim());
}

/** "{customer}" and friends filled in. Lines whose only content was an empty field are dropped. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template
    .split("\n")
    .flatMap((line) => {
      const fields = line.match(/\{[a-z]+\}/g) || [];
      const out = line.replace(/\{([a-z]+)\}/g, (m, k) => (k in values ? values[k] : m));
      return fields.length && !out.trim() ? [] : [out];
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

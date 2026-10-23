"use client";

import { createCollection, localPersist, uid, type Persist } from "./collection";
import { cityOf } from "./quote";
import { getSettings } from "./settings";
import type { Customer } from "./types";

/** Customers: everyone you quote, saved once so the next quotation fills in from a name search. */
export type SavedCustomer = Customer & { id: string; sample?: boolean; updatedAt: string };

let persist: Persist<SavedCustomer> = localPersist<SavedCustomer>("message-to-quote:customers");
export const customers = createCollection<SavedCustomer>({
  load: () => persist.load(),
  save: (rows) => persist.save(rows),
  remove: (ids) => persist.remove(ids),
});
export function setCustomersPersist(p: Persist<SavedCustomer>) {
  persist = p;
}

export const EMPTY_CUSTOMER: Customer = { name: "", address1: "", address2: "", tel: "", regNo: "", contact: "", email: "" };

const FIELDS: (keyof Customer)[] = ["name", "contact", "tel", "email", "address1", "address2", "regNo"];

export const useCustomers = () => customers.use();
export const allCustomers = () => customers.all();

/** "+60 12-000 1007" and "012-000 1007" compare equal: digits only, without the country code or the leading 0. */
export function phoneKey(tel: string): string {
  const cc = getSettings().whatsapp.countryCode.replace(/\D/g, "");
  let d = (tel || "").replace(/\D/g, "");
  if (cc && d.startsWith(cc)) d = d.slice(cc.length);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
}

const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/** The saved customer with this company name, if any. */
export function findSaved(list: SavedCustomer[], name: string): SavedCustomer | undefined {
  const k = key(name);
  return k ? list.find((c) => key(c.name) === k) : undefined;
}

export function sameDetails(a: Customer, b: Customer): boolean {
  return FIELDS.every((f) => (a[f] || "").trim() === (b[f] || "").trim());
}

/** Just the customer fields, for putting on a quotation. */
export function toCustomer(c: Customer): Customer {
  return { name: c.name, address1: c.address1, address2: c.address2, tel: c.tel, regNo: c.regNo, contact: c.contact, email: c.email };
}

/** Name first (starts with, then contains), then contact, phone, town and email. Empty query = everyone, A to Z. */
export function searchCustomers(list: SavedCustomer[], query: string, limit = 6): SavedCustomer[] {
  const q = query.trim().toLowerCase();
  const byName = (a: SavedCustomer, b: SavedCustomer) => a.name.localeCompare(b.name);
  if (!q) return [...list].sort(byName).slice(0, limit);
  const digits = q.replace(/\D/g, "");
  return list
    .map((c) => {
      const name = c.name.toLowerCase();
      let score = 0;
      if (name.startsWith(q)) score = 100;
      else if (name.split(/\s+/).some((w) => w.startsWith(q))) score = 80;
      else if (name.includes(q)) score = 60;
      else if (c.contact.toLowerCase().includes(q)) score = 40;
      else if (digits.length >= 3 && c.tel.replace(/\D/g, "").includes(digits)) score = 35;
      else if (cityOf(c.address2).toLowerCase().includes(q)) score = 30;
      else if (c.email.toLowerCase().includes(q)) score = 20;
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || byName(a.c, b.c))
    .slice(0, limit)
    .map((x) => x.c);
}

/** Add a customer, or update the saved one with the same company name. */
export function saveCustomer(c: Customer, id?: string): SavedCustomer {
  const all = customers.all();
  const existing = id ? all.find((x) => x.id === id) : findSaved(all, c.name);
  const next: SavedCustomer = { ...toCustomer(c), name: c.name.trim(), id: existing?.id ?? uid(), sample: existing?.sample, updatedAt: new Date().toISOString() };
  return customers.put(next);
}

export function deleteCustomer(id: string) {
  customers.remove(id);
}

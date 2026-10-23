"use client";

import { createCollection, localPersist, uid, type Persist } from "./collection";
import { round2 } from "./quote";
import { STANDARD_LIST, type Product } from "./types";

let persist: Persist<Product> = localPersist<Product>("message-to-quote:products");
export const products = createCollection<Product>({
  load: () => persist.load(),
  save: (rows) => persist.save(rows),
  remove: (ids) => persist.remove(ids),
});
export function setProductsPersist(p: Persist<Product>) {
  persist = p;
}

export const useProducts = () => products.use();
export const getProduct = (id: string | null | undefined) => (id ? products.get(id) : undefined);

export const EMPTY_PRODUCT: Omit<Product, "id" | "createdAt" | "updatedAt"> = {
  code: "",
  name: "",
  variant: "",
  category: "",
  unit: "pcs",
  price: 0,
  prices: {},
  photo: "",
  description: "",
};

export function saveProduct(p: Omit<Product, "id" | "createdAt" | "updatedAt"> & { id?: string; createdAt?: string }): Product {
  const now = new Date().toISOString();
  return products.put({ ...p, id: p.id || uid(), createdAt: p.createdAt || now, updatedAt: now } as Product);
}

/** "CS-RG61 Rugged Armor Case (Black)" style label: code, name, variant in brackets. */
export function productLabel(p: { code: string; name: string; variant: string }): string {
  const base = [p.code, p.name].filter(Boolean).join(" ");
  return p.variant ? `${base} (${p.variant})` : base;
}

/** Name with the variant, no code: for places that show the code in its own column. */
export function itemName(p: { name: string; variant: string }): string {
  return p.variant ? `${p.name} (${p.variant})` : p.name;
}

export function priceFor(p: Product, listId: string): number | null {
  const v = listId === STANDARD_LIST ? p.price : p.prices[listId];
  return typeof v === "number" && Number.isFinite(v) ? round2(v) : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Type a code or a word from the name, variant or category. Code-prefix matches come first. */
export function searchProducts(list: Product[], query: string, limit = 8): Product[] {
  const q = norm(query);
  if (!q) return [];
  const qc = q.replace(/\s+/g, "");
  const words = q.split(" ");
  const scored = list
    .map((p) => {
      const code = norm(p.code).replace(/\s+/g, "");
      const name = norm(p.name);
      const all = `${code} ${name} ${norm(p.variant)} ${norm(p.category)}`;
      let score = 0;
      if (code && code.startsWith(qc)) score = 100;
      else if (name.startsWith(q)) score = 90;
      else if (name.split(" ").some((w) => w.startsWith(q))) score = 80;
      else if (code && code.includes(qc)) score = 60;
      else if (words.every((w) => all.includes(w))) score = 50;
      else if (norm(p.description).includes(q)) score = 20;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || productLabel(a.p).localeCompare(productLabel(b.p)));
  return scored.slice(0, limit).map((x) => x.p);
}

export function categoriesOf(list: Product[]): string[] {
  return Array.from(new Set(list.map((p) => p.category.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

/** Drop one price list's prices from every product (when the list is deleted). */
export function dropPriceList(listId: string) {
  const touched = products
    .all()
    .filter((p) => listId in p.prices)
    .map((p) => {
      const prices = { ...p.prices };
      delete prices[listId];
      return { ...p, prices, updatedAt: new Date().toISOString() };
    });
  products.putMany(touched);
}

"use client";

import { createCollection, localPersist, uid, type Persist } from "./collection";
import { EMPTY_CUSTOMER } from "./customers";
import { priceFor } from "./products";
import { nextQuoteNumber, round2, round3, todayIso } from "./quote";
import { getSettings } from "./settings";
import { CUSTOM_PRICE, STANDARD_LIST, type Product, type QuoteLine, type Quotation } from "./types";

let persist: Persist<Quotation> = localPersist<Quotation>("message-to-quote:quotations");
export const quotations = createCollection<Quotation>({
  load: () => persist.load(),
  save: (rows) => persist.save(rows),
  remove: (ids) => persist.remove(ids),
});
export function setQuotationsPersist(p: Persist<Quotation>) {
  persist = p;
}

export const useQuotes = () => quotations.use();
export const allQuotes = () => quotations.all();
export const getQuote = (id: string) => quotations.get(id);

export function saveQuote(q: Quotation): Quotation {
  return quotations.put({ ...q, updatedAt: new Date().toISOString() });
}

export function deleteQuote(id: string) {
  quotations.remove(id);
}

/** A quotation line for a product, priced from a price list (no price there = 0 and marked as typed). */
export function lineFromProduct(p: Product, listId: string, qty = 1, unitPrice?: number): QuoteLine {
  const listPrice = priceFor(p, listId);
  const custom = typeof unitPrice === "number";
  return {
    id: uid(),
    productId: p.id,
    code: p.code,
    name: p.name,
    variant: p.variant,
    unit: p.unit,
    photo: p.photo,
    qty: round3(qty),
    unitPrice: custom ? round2(unitPrice) : (listPrice ?? 0),
    discount: 0,
    priceList: custom || listPrice === null ? CUSTOM_PRICE : listId,
  };
}

/** A line typed in by hand, for something not in the product list. */
export function blankLine(): QuoteLine {
  return { id: uid(), productId: null, code: "", name: "", variant: "", unit: "", photo: "", qty: 1, unitPrice: 0, discount: 0, priceList: CUSTOM_PRICE };
}

/** A new draft with the defaults from Settings. No customer yet, so it is numbered QT-NEW-YYMM-NN until one is picked. */
export function newDraft(): Quotation {
  const s = getSettings();
  const date = todayIso();
  const stamp = new Date().toISOString();
  return {
    id: uid(),
    number: nextQuoteNumber(allQuotes(), s.quote.prefix, "", date),
    status: "Draft",
    date,
    validDays: s.quote.validDays,
    invoiceTo: EMPTY_CUSTOMER,
    deliveryTo: EMPTY_CUSTOMER,
    sameDelivery: true,
    priceList: STANDARD_LIST,
    delivery: s.quote.delivery,
    payment: s.quote.payment,
    notes: s.quote.notes,
    taxRate: s.tax.enabled ? s.tax.rate : 0,
    lines: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/** An order dropped or pasted on the quotation list, waiting for its new quotation to open and run Add with AI on it.
    Kept in memory only: it crosses one client-side navigation and is gone. */
export type PendingImport = { text: string; images: string[] };
const pending = new Map<string, PendingImport>();

export function queueImport(quoteId: string, p: PendingImport) {
  pending.set(quoteId, p);
}

export function takeImport(quoteId: string): PendingImport | undefined {
  const p = pending.get(quoteId);
  pending.delete(quoteId);
  return p;
}

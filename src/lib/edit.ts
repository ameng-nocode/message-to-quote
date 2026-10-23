import type { AssistAction, Applied } from "./assist";
import { getProduct, priceFor } from "./products";
import { round2, round3 } from "./quote";
import { getSettings, priceListByName } from "./settings";
import { lineFromProduct } from "./store";
import { CUSTOM_PRICE, type QuoteLine, type Quotation } from "./types";

/* The rules for changing a quotation's lines, kept apart from the screen so they can be tested on their own. */

/** Every product line takes its price from one price list; lines with no price in that list keep their number as typed. */
export function relist(q: Quotation, listId: string): { next: Quotation; skipped: number } {
  let skipped = 0;
  const lines = q.lines.map((l) => {
    if (l.productId === null) return l;
    const p = getProduct(l.productId);
    const price = p ? priceFor(p, listId) : null;
    if (price === null) {
      skipped++;
      return { ...l, priceList: CUSTOM_PRICE };
    }
    return { ...l, unitPrice: price, priceList: listId };
  });
  return { next: { ...q, priceList: listId, lines }, skipped };
}

/** Numbers typed into a line, kept the way the database keeps them: money to the cent, quantity and discount to 3 places. */
export function cleanLine(f: Partial<QuoteLine>): Partial<QuoteLine> {
  const out = { ...f };
  if (out.qty !== undefined) out.qty = round3(Math.max(0, Number(out.qty) || 0));
  if (out.unitPrice !== undefined) out.unitPrice = round2(Math.max(0, Number(out.unitPrice) || 0));
  if (out.discount !== undefined) out.discount = round3(Math.min(100, Math.max(0, Number(out.discount) || 0)));
  return out;
}

/** What a set of AI actions does to a quotation, without touching it: the new quotation and what took effect.
    Products that are not in the product list are skipped; so is a price list that does not exist. */
export function runActions(cur: Quotation, actions: AssistAction[]): { next: Quotation; done: Applied } {
  const done: Applied = { added: [], changed: [], removed: [] };
  let next = cur;
  for (const a of actions) {
    if (a.type === "add") {
      const p = getProduct(a.productId);
      if (!p) continue;
      const qty = a.qty > 0 ? round3(a.qty) : 1;
      next = { ...next, lines: [...next.lines, lineFromProduct(p, next.priceList, qty, a.unitPrice)] };
      done.added.push({ productId: p.id, qty });
    } else if (a.type === "set_qty") {
      if (!(a.qty >= 0)) continue;
      const qty = round3(a.qty);
      let idx = -1;
      next.lines.forEach((l, i) => {
        if (l.productId === a.productId) idx = i;
      });
      if (idx >= 0) {
        next = { ...next, lines: next.lines.map((l, i) => (i === idx ? { ...l, qty } : l)) };
        done.changed.push({ productId: a.productId, qty });
      }
    } else if (a.type === "remove") {
      const before = next.lines.length;
      next = { ...next, lines: next.lines.filter((l) => l.productId !== a.productId) };
      if (next.lines.length < before) done.removed.push(a.productId);
    } else if (a.type === "set_price_list") {
      const list = priceListByName(getSettings(), a.priceList);
      if (!list) continue;
      next = relist(next, list.id).next;
      done.priceList = list.name;
    }
  }
  return { next, done };
}

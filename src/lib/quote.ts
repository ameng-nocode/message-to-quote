import type { QuoteLine, Quotation } from "./types";

/** Half up to a number of decimals, done on the decimal text so 1.005 -> 1.01 and 0.945 -> 0.95
    (plain Math.round(n * 100) / 100 gives 1.00 and 0.94, because 1.005 is stored as 1.00499...). */
function roundTo(n: number, places: number): number {
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  const text = Math.abs(n).toPrecision(15);
  if (text.includes("e")) return Math.round(n * 10 ** places) / 10 ** places; // astronomically large: no cents to care about
  const v = Math.round(Number(`${text}e${places}`));
  return sign * Number(`${v}e-${places}`) || 0;
}
/** Money: 2 decimals. The database keeps money at 2 decimals too, so both modes give the same totals. */
export const round2 = (n: number) => roundTo(n, 2);
/** Quantities, discounts and tax rates: 3 decimals (0.5 kg, 2.25 hours, 12.5%). */
export const round3 = (n: number) => roundTo(n, 3);
const r2 = round2;

/** A quantity from outside (the AI, a file): decimals are fine (2.5 kg, 1.5 hours), at most 3 places.
    Not a number, zero or below gives the fallback. */
export function cleanQty(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? round3(n) : fallback;
}

/** A line's amount after its discount. */
export function lineAmount(line: QuoteLine): number {
  const qty = Number(line.qty) || 0;
  const price = Number(line.unitPrice) || 0;
  const disc = Math.min(100, Math.max(0, Number(line.discount) || 0));
  return r2(qty * price * (1 - disc / 100));
}

export function calcQuote(q: Quotation) {
  const lines = q.lines.map((line) => ({ line, amount: lineAmount(line) }));
  const subtotal = r2(lines.reduce((s, l) => s + l.amount, 0));
  const tax = q.taxRate > 0 ? r2((subtotal * q.taxRate) / 100) : 0;
  return {
    lines,
    qty: lines.reduce((s, l) => s + (Number(l.line.qty) || 0), 0),
    subtotal,
    tax,
    total: r2(subtotal + tax),
  };
}

export const fmtMoney = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtQty = (n: number) => n.toLocaleString("en-US");
/** "12.5" -> "12.5%", "0" -> "" */
export const fmtPct = (n: number) => (n ? `${Number(n.toFixed(2))}%` : "");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-21" -> "21 Sep 2026" (three-letter months everywhere, so the column never wraps) */
export function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso;
  return `${m[3]} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

export function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The date a quotation stops being valid, or "" when it has no validity. */
export function validUntil(q: Pick<Quotation, "date" | "validDays">): string {
  if (!q.validDays || !/^\d{4}-\d{2}-\d{2}/.test(q.date)) return "";
  const d = new Date(q.date + "T00:00:00");
  d.setDate(d.getDate() + q.validDays);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "Digital Zone Trading Sdn Bhd" -> "DZT" (first letters of the first 3 words) */
export function customerCode(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const code = words.slice(0, 3).map((w) => w[0].toUpperCase()).join("");
  return code || "NEW";
}

const cleanPrefix = (p: string) => p.trim().replace(/[^A-Za-z0-9]+/g, "").toUpperCase() || "QT";

/** QT-DZT-2609-01: prefix + customer code + YYMM + running number within that month for that customer */
export function nextQuoteNumber(existing: Quotation[], prefix: string, customerName: string, dateIso: string): string {
  const yymm = dateIso.slice(2, 4) + dateIso.slice(5, 7);
  const start = `${cleanPrefix(prefix)}-${customerCode(customerName)}-${yymm}-`;
  // one more than the highest number used, so a deleted quotation never makes a number come back twice
  const used = existing.filter((q) => q.number.startsWith(start)).map((q) => parseInt(q.number.slice(start.length), 10) || 0);
  return `${start}${String(Math.max(0, ...used) + 1).padStart(2, "0")}`;
}

/** A draft numbered before it had a customer (QT-NEW-2610-01) gets a real number once one is picked. */
export const isUnnamedNumber = (n: string) => /^[A-Z0-9]+-NEW-\d{4}-\d+$/.test(n);

/** "Bandar Pengkalan Indah, 08000 Sungai Petani, Kedah" -> "Sungai Petani": the town after a 4 to 6 digit postcode */
export function cityOf(address2: string): string {
  const m = /\b\d{4,6}\s+([^,\d]+)/.exec(address2 || "");
  return m ? m[1].trim() : "";
}

/** One line of the customer's message for the list: newlines flattened, a bare greeting ("Boss morning") dropped. */
export function sourceSnippet(text: string): string {
  const lines = (text || "")
    .split(/\n+/)
    .map((l) => l.trim().replace(/^[-•*]\s*/, ""))
    .filter(Boolean);
  if (lines.length > 1 && lines[0].length <= 20 && !/\d/.test(lines[0])) lines.shift();
  // "restock this week:" + "CS-RG61 black x60" reads as one sentence; other lines are a list
  return lines.reduce((acc, l, i) => (i === 0 ? l : acc + (/:$/.test(acc) ? " " : ", ") + l), "");
}

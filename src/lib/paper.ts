import { calcQuote, fmtDate, fmtMoney, fmtPct, fmtQty, validUntil } from "./quote";
import type { Settings } from "./settings";
import type { Customer, QuoteLine, Quotation } from "./types";

/* What the printed page, the PDF and the Excel file have in common, so the three always match. */

export type ColKey = "no" | "photo" | "code" | "item" | "qty" | "unit" | "price" | "disc" | "amount";
export type Col = { key: ColKey; head: string; share: number; align: "left" | "center" | "right" };

/** The item columns, from Settings. The discount column also shows whenever a line has a discount. */
export function paperColumns(s: Settings, q: Quotation): Col[] {
  const c = s.quote.columns;
  const cur = s.currency;
  const cols: (Col | false)[] = [
    { key: "no", head: "No.", share: 5, align: "center" },
    c.photo && q.lines.some((l) => l.photo) && { key: "photo", head: "Photo", share: 11, align: "center" },
    c.code && q.lines.some((l) => l.code) && { key: "code", head: "Code", share: 13, align: "left" },
    { key: "item", head: "Item", share: 34, align: "left" },
    { key: "qty", head: "Qty", share: 8, align: "right" },
    c.unit && q.lines.some((l) => l.unit) && { key: "unit", head: "Unit", share: 7, align: "center" },
    { key: "price", head: `Unit price (${cur})`, share: 13, align: "right" },
    (c.discount || q.lines.some((l) => l.discount > 0)) && { key: "disc", head: "Disc.", share: 7, align: "right" },
    { key: "amount", head: `Amount (${cur})`, share: 14, align: "right" },
  ];
  return cols.filter(Boolean) as Col[];
}

/** One cell's text. Photos are drawn separately. */
export function cellText(key: ColKey, line: QuoteLine, i: number, amount: number): string {
  switch (key) {
    case "no":
      return String(i + 1);
    case "photo":
      return "";
    case "code":
      return line.code;
    case "item":
      return line.variant ? `${line.name}\n${line.variant}` : line.name;
    case "qty":
      return fmtQty(line.qty);
    case "unit":
      return line.unit;
    case "price":
      return fmtMoney(line.unitPrice);
    case "disc":
      return fmtPct(line.discount);
    case "amount":
      return fmtMoney(amount);
  }
}

export function companyLines(s: Settings): string[] {
  const co = s.company;
  return [
    co.regNo && `Company No.: ${co.regNo}`,
    ...co.address.split("\n").map((l) => l.trim()),
    [co.phone && `Tel: ${co.phone}`, co.email, co.website].filter(Boolean).join("   "),
  ].filter(Boolean) as string[];
}

export function customerLines(c: Customer): string[] {
  return [c.name, c.address1, c.address2, c.tel && `Tel: ${c.tel}`, c.regNo && `Company No.: ${c.regNo}`, c.contact && `Attn: ${c.contact}`, c.email && `Email: ${c.email}`].filter(Boolean) as string[];
}

/** Number, date and "valid until" for the top right box. */
export function headRows(q: Quotation): [string, string][] {
  const until = validUntil(q);
  return [["Quotation No.", q.number], ["Date", fmtDate(q.date)], ...(until ? ([["Valid until", fmtDate(until)]] as [string, string][]) : [])];
}

/** Subtotal, tax and total. With no tax there is only the total. */
export function totalRows(q: Quotation, s: Settings): [string, string][] {
  const c = calcQuote(q);
  if (!c.tax) return [[`Total (${s.currency})`, fmtMoney(c.total)]];
  return [
    ["Subtotal", fmtMoney(c.subtotal)],
    [`${s.tax.name || "Tax"} ${fmtPct(q.taxRate)}`, fmtMoney(c.tax)],
    [`Total (${s.currency})`, fmtMoney(c.total)],
  ];
}

/** Delivery, payment and notes, only the ones filled in. */
export function termRows(q: Quotation): [string, string][] {
  return (
    [
      ["Delivery", q.delivery],
      ["Payment", q.payment],
      ["Notes", q.notes],
    ] as [string, string][]
  ).filter(([, v]) => v.trim());
}

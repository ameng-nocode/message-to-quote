"use client";

import { uid } from "./collection";
import { downloadBlob } from "./xlsx";
import type { Settings } from "./settings";
import { round2 } from "./quote";
import { STANDARD_LIST, type PriceList, type Product } from "./types";

/* Products in and out of Excel / CSV. One row per product, one column per price list. */

type Field = "code" | "name" | "variant" | "category" | "unit" | "price" | "description" | "photo";
const ALIASES: Record<Field, string[]> = {
  code: ["code", "sku", "itemcode", "productcode", "model", "modelcode", "partno", "partnumber"],
  name: ["name", "product", "productname", "item", "itemname", "title"],
  variant: ["variant", "colour", "color", "size", "option", "variation"],
  category: ["category", "type", "group", "collection"],
  unit: ["unit", "uom", "units"],
  price: ["price", "unitprice", "sellingprice"],
  description: ["description", "details", "desc", "notes", "features"],
  photo: ["photo", "image", "imageurl", "picture", "photourl", "imagesrc"],
};
const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** "RM 1,299.00" -> 1299. Empty or not a number -> null. */
export function parsePrice(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v ?? "").replace(/[^\d.,-]/g, "");
  if (!t) return null;
  // "1.299,50" (comma decimals) vs "1,299.50"
  const s = /,\d{1,2}$/.test(t) && !/\.\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? round2(n) : null;
}

/** A small CSV reader: quotes, commas inside quotes, and comma / semicolon / tab separators. */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] || "";
  const sep = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** The first sheet of an .xlsx as rows of text. */
async function readXlsx(file: File): Promise<string[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const out: string[] = [];
    r.eachCell({ includeEmpty: true }, (c, col) => {
      const v = c.value as unknown;
      let t = "";
      if (v === null || v === undefined) t = "";
      else if (typeof v === "object" && v && "text" in v) t = String((v as { text: unknown }).text ?? "");
      else if (typeof v === "object" && v && "result" in v) t = String((v as { result: unknown }).result ?? "");
      else if (typeof v === "object" && v && "hyperlink" in v) t = String((v as { hyperlink: unknown }).hyperlink ?? "");
      else if (typeof v === "object" && v && "richText" in v) t = ((v as { richText: { text: string }[] }).richText || []).map((x) => x.text).join("");
      else t = String(v);
      out[col - 1] = t;
    });
    rows.push(Array.from(out, (x) => x ?? ""));
  });
  return rows;
}

export type ImportRow = {
  line: number; // row number in the file, for error messages
  status: "new" | "update" | "error";
  error?: string;
  product?: Product;
};

export type ImportPlan = {
  rows: ImportRow[];
  newLists: string[]; // price list names the file adds
  ignored: string[]; // columns that were not used
  priceLists: PriceList[]; // the lists after the import
};

const keyOf = (p: { code: string; name: string; variant: string }) => (p.code.trim() ? `c:${p.code.trim().toLowerCase()}` : `n:${p.name.trim().toLowerCase()}`) + `|${p.variant.trim().toLowerCase()}`;

/** Read a file and work out what importing it would do. Nothing is saved yet. */
export async function planImport(file: File, existing: Product[], s: Settings): Promise<ImportPlan> {
  const table = /\.xlsx$/i.test(file.name) ? await readXlsx(file) : parseCsv((await file.text()).replace(/^﻿/, ""));
  const headIdx = table.findIndex((r) => r.filter((c) => String(c).trim()).length >= 2);
  if (headIdx < 0) throw new Error("No header row found. The first row should name the columns: code, name, price and so on.");
  const head = table[headIdx].map((h) => String(h).trim());

  const lists = [...s.priceLists];
  // "Wholesale Price (RM)", "Price (RM)", "Retail price" -> "wholesale", "price", "retail": the currency and a trailing "price" are dropped
  const cur = squash(s.currency);
  const headKey = (h: string) => {
    let k = squash(h);
    if (cur && k.length > cur.length && k.endsWith(cur)) k = k.slice(0, -cur.length);
    if (k.length > 5 && k.endsWith("price") && !ALIASES.price.includes(k)) k = k.slice(0, -5);
    return k;
  };
  const listKey = (name: string) => headKey(name);
  const standardName = listKey(lists[0].name);
  const fieldOf = new Map<number, Field>();
  const listOf = new Map<number, string>(); // column -> price list id
  const ignored: string[] = [];
  const newLists: string[] = [];
  const body = table.slice(headIdx + 1).filter((r) => r.some((c) => String(c).trim()));

  head.forEach((h, i) => {
    const k = headKey(h);
    if (!k) return;
    const field = (Object.keys(ALIASES) as Field[]).find((f) => ALIASES[f].includes(k) || ALIASES[f].includes(squash(h)));
    if (field && ![...fieldOf.values()].includes(field)) return void fieldOf.set(i, field);
    if (k === standardName && ![...fieldOf.values()].includes("price")) return void fieldOf.set(i, "price");
    const list = lists.find((l) => listKey(l.name) === k);
    if (list) return void listOf.set(i, list.id);
    // any other column that holds prices becomes a new price list named after the column
    const filled = body.map((r) => String(r[i] ?? "").trim()).filter(Boolean);
    if (filled.length && filled.filter((v) => parsePrice(v) !== null).length >= filled.length * 0.8) {
      const pl = { id: uid(), name: h };
      lists.push(pl);
      newLists.push(h);
      listOf.set(i, pl.id);
      return;
    }
    ignored.push(h);
  });
  if (![...fieldOf.values()].includes("name")) throw new Error('No "name" column. Name one column "name" (or "product").');
  if (![...fieldOf.values()].includes("price")) throw new Error(`No "price" column. Name one column "price" (or "${lists[0].name}").`);

  const byKey = new Map(existing.map((p) => [keyOf(p), p]));
  const seen = new Map<string, number>();
  const now = new Date().toISOString();
  const rows: ImportRow[] = body.map((r, j) => {
    const line = headIdx + 2 + j;
    const get = (f: Field) => {
      for (const [i, ff] of fieldOf) if (ff === f) return String(r[i] ?? "").trim();
      return "";
    };
    const name = get("name");
    if (!name) return { line, status: "error", error: "No name" };
    const price = parsePrice(get("price"));
    if (price === null || price < 0) return { line, status: "error", error: "No price, or not a number" };
    const prices: Record<string, number> = {};
    for (const [i, id] of listOf) {
      const v = parsePrice(r[i]);
      if (v !== null && v >= 0 && id !== STANDARD_LIST) prices[id] = v;
    }
    const photo = get("photo");
    const draft = { code: get("code"), name, variant: get("variant") };
    const key = keyOf(draft);
    const old = byKey.get(key);
    const product: Product = {
      id: old?.id ?? uid(),
      code: draft.code,
      name,
      variant: draft.variant,
      category: get("category") || old?.category || "",
      unit: get("unit") || old?.unit || "pcs",
      price,
      prices: { ...(old?.prices ?? {}), ...prices },
      photo: /^https?:\/\//.test(photo) ? photo : (old?.photo ?? ""),
      description: get("description") || old?.description || "",
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
    };
    if (seen.has(key)) return { line, status: "error", error: `Same product as row ${seen.get(key)}` };
    seen.set(key, line);
    return { line, status: old ? "update" : "new", product };
  });
  return { rows, newLists, ignored, priceLists: lists };
}

function sheetRows(list: Product[], s: Settings): (string | number)[][] {
  const lists = s.priceLists;
  const head = ["code", "name", "variant", "category", "unit", lists[0].name, ...lists.slice(1).map((l) => l.name), "description", "photo"];
  return [
    head,
    ...list.map((p) => [p.code, p.name, p.variant, p.category, p.unit, p.price, ...lists.slice(1).map((l) => p.prices[l.id] ?? ""), p.description, /^https?:\/\//.test(p.photo) ? p.photo : ""]),
  ];
}

async function xlsxOf(rows: (string | number)[][]): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Products");
  rows.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c, i) => (c.width = i === 1 ? 36 : i === rows[0].length - 2 ? 40 : 14));
  return new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function exportProducts(list: Product[], s: Settings) {
  downloadBlob(await xlsxOf(sheetRows(list, s)), "products.xlsx");
}

/** An empty sheet with the right column names: one price column per price list. */
export async function downloadTemplate(s: Settings) {
  downloadBlob(await xlsxOf(sheetRows([], s)), "products-template.xlsx");
}

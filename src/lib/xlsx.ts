"use client";

import { calcQuote } from "./quote";
import { cellText, companyLines, customerLines, headRows, paperColumns, termRows, totalRows } from "./paper";
import type { Settings } from "./settings";
import type { Quotation } from "./types";

/** A file's bytes as base64, for ExcelJS pictures. */
async function base64Of(src: string): Promise<{ base64: string; ext: "jpeg" | "png" } | null> {
  try {
    const res = await fetch(src);
    const type = res.headers.get("content-type") || "";
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
    return { base64: btoa(bin), ext: type.includes("png") || src.startsWith("data:image/png") ? "png" : "jpeg" };
  } catch {
    return null;
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** The quotation as .xlsx in the same layout as the printed page, pictures embedded. */
export async function downloadXlsx(q: Quotation, s: Settings) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Quotation", { pageSetup: { orientation: "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const cols = paperColumns(s, q);
  const n = cols.length;
  ws.columns = cols.map((c) => ({ width: c.key === "item" ? 40 : c.key === "photo" ? 14 : Math.max(8, c.share * 1.1) }));
  // the paper look: ink rules over and under the header, a light grid between the cells, slate labels, cobalt title
  const bold = { bold: true, color: { argb: "FF0D1B3E" } } as const;
  const label = { bold: true, color: { argb: "FF51607F" } } as const;
  const grid = { style: "thin", color: { argb: "FFE5ECFC" } } as const;
  const ink = (style: "thin" | "medium") => ({ style, color: { argb: "FF0D1B3E" } }) as const;
  const cellBorder = (ci: number) => (ci < n - 1 ? { bottom: grid, right: grid } : { bottom: grid });
  const last = (r: number) => ws.getCell(r, n).address;

  let r = 1;
  ws.getCell(r, 1).value = s.company.name;
  ws.getCell(r, 1).font = { bold: true, size: 14 };
  ws.getCell(r, n).value = s.quote.title || "QUOTATION";
  ws.getCell(r, n).font = { bold: true, size: 16, color: { argb: "FF1F4FD8" } };
  ws.getCell(r, n).alignment = { horizontal: "right" };
  r++;
  for (const line of companyLines(s)) ws.getCell(r++, 1).value = line;
  r++;
  for (const [k, v] of headRows(q)) {
    ws.getCell(r, 1).value = k;
    ws.getCell(r, 1).font = label;
    ws.getCell(r, 2).value = v;
    r++;
  }
  r++;
  const bill = customerLines(q.invoiceTo);
  const ship = customerLines(q.sameDelivery ? q.invoiceTo : q.deliveryTo);
  const mid = Math.max(2, Math.ceil(n / 2) + 1);
  ws.getCell(r, 1).value = "Bill to";
  ws.getCell(r, mid).value = "Deliver to";
  ws.getCell(r, 1).font = label;
  ws.getCell(r, mid).font = label;
  r++;
  for (let i = 0; i < Math.max(bill.length, ship.length); i++, r++) {
    if (bill[i]) ws.getCell(r, 1).value = bill[i];
    if (ship[i]) ws.getCell(r, mid).value = ship[i];
  }
  r++;

  // item table
  cols.forEach((c, i) => {
    const cell = ws.getCell(r, i + 1);
    cell.value = c.head.toUpperCase();
    cell.font = { ...label, size: 9 };
    cell.border = { top: ink("medium"), bottom: ink("thin"), ...(i < n - 1 ? { right: grid } : {}) };
    cell.alignment = { horizontal: c.align, vertical: "middle", wrapText: true };
  });
  r++;
  const calc = calcQuote(q);
  const photoCol = cols.findIndex((c) => c.key === "photo");
  for (let i = 0; i < calc.lines.length; i++) {
    const { line, amount } = calc.lines[i];
    if (photoCol >= 0) ws.getRow(r).height = 62;
    cols.forEach((c, ci) => {
      const cell = ws.getCell(r, ci + 1);
      const v = c.key === "qty" ? line.qty : c.key === "price" ? line.unitPrice : c.key === "amount" ? amount : c.key === "disc" ? line.discount / 100 || "" : cellText(c.key, line, i, amount);
      cell.value = v;
      cell.border = cellBorder(ci);
      cell.alignment = { horizontal: c.align, vertical: "middle", wrapText: true };
      if (c.key === "price" || c.key === "amount") cell.numFmt = "#,##0.00";
      if (c.key === "disc") cell.numFmt = "0.##%";
    });
    if (photoCol >= 0 && line.photo) {
      const pic = await base64Of(line.photo);
      if (pic) {
        const id = wb.addImage({ base64: pic.base64, extension: pic.ext });
        ws.addImage(id, { tl: { col: photoCol + 0.1, row: r - 1 + 0.08 }, ext: { width: 76, height: 76 } });
      }
    }
    r++;
  }
  // totals: the grand total under an ink rule
  const totals = totalRows(q, s);
  totals.forEach(([k, v], i) => {
    const grand = i === totals.length - 1;
    ws.getCell(r, n - 1).value = k;
    ws.getCell(r, n - 1).font = grand ? { ...bold, size: 12 } : label;
    ws.getCell(r, n).value = Number(v.replace(/,/g, ""));
    ws.getCell(r, n).numFmt = "#,##0.00";
    ws.getCell(r, n).font = grand ? { ...bold, size: 12 } : bold;
    if (grand) for (const c of [n - 1, n]) ws.getCell(r, c).border = { top: ink("medium") };
    r++;
  });
  r++;
  for (const [k, v] of [...termRows(q), ...(s.quote.bank.trim() ? ([["Payment details", s.quote.bank]] as [string, string][]) : [])]) {
    ws.getCell(r, 1).value = k;
    ws.getCell(r, 1).font = label;
    r++;
    for (const line of v.split("\n")) {
      ws.mergeCells(`${ws.getCell(r, 1).address}:${last(r)}`);
      ws.getCell(r, 1).value = line;
      r++;
    }
    r++;
  }
  if (s.quote.footer.trim()) ws.getCell(r, 1).value = s.quote.footer;

  const out = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${q.number}.xlsx`);
}

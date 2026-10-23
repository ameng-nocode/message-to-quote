"use client";

import { calcQuote } from "./quote";
import { cellText, companyLines, customerLines, headRows, paperColumns, termRows, totalRows } from "./paper";
import type { Settings } from "./settings";
import type { Customer, Quotation } from "./types";

/* A4 portrait in mm */
const PAGE_W = 210;
const PAGE_H = 297;
const M = 14; // page margin
const INNER = PAGE_W - M * 2;

/* the paper colours: ink text, slate labels, cobalt title, light grid */
const INK: [number, number, number] = [13, 27, 62];
const SLATE: [number, number, number] = [81, 96, 127];
const COBALT: [number, number, number] = [31, 79, 216];
const GRID: [number, number, number] = [229, 236, 252];

/** A picture as a small JPEG, drawn once (the PDF reuses it by alias). */
async function pictureData(src: string, width = 400): Promise<{ data: string; ratio: number } | null> {
  try {
    const img = new Image();
    if (/^https?:/.test(src)) img.crossOrigin = "anonymous";
    img.src = src;
    await img.decode();
    const w = Math.min(width, img.naturalWidth || width);
    const h = Math.round((w * img.naturalHeight) / img.naturalWidth);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    return { data: c.toDataURL("image/jpeg", 0.88), ratio: h / w };
  } catch {
    return null;
  }
}

/** The quotation as a real A4 PDF: vector text, rows never cut in half, the table header repeated on every page,
    page numbers at the foot. Built from the data, not from a screenshot. Layout and columns follow Settings. */
export async function quoteToPdf(q: Quotation, s: Settings): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const calc = calcQuote(q);
  const cols = paperColumns(s, q);
  const shareSum = cols.reduce((n, c) => n + c.share, 0);
  const delivery = q.sameDelivery ? q.invoiceTo : q.deliveryTo;

  const pics = new Map<string, { data: string; ratio: number } | null>();
  const wanted = new Set<string>(cols.some((c) => c.key === "photo") ? (q.lines.map((l) => l.photo).filter(Boolean) as string[]) : []);
  await Promise.all([...wanted].map(async (src) => pics.set(src, await pictureData(src))));
  const logo = s.company.logo ? await pictureData(s.company.logo, 600) : null;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setTextColor(...INK);

  // company, top left (logo above the name)
  let y = M;
  if (logo) {
    const h = Math.min(18, 50 * logo.ratio);
    const w = h / logo.ratio;
    doc.addImage(logo.data, "JPEG", M, y, w, h, "logo", "FAST");
    y += h + 3;
  }
  doc.setFont("helvetica", "bold").setFontSize(12.5);
  y += 4;
  const nameLines = doc.splitTextToSize(s.company.name || " ", 110) as string[];
  doc.text(nameLines, M, y);
  y += nameLines.length * 5;
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...SLATE);
  for (const line of companyLines(s)) {
    for (const part of doc.splitTextToSize(line, 110) as string[]) {
      doc.text(part, M, y);
      y += 3.7;
    }
  }

  // title and number box, top right
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...COBALT);
  doc.text(s.quote.title || "QUOTATION", PAGE_W - M, M + 7, { align: "right", charSpace: 0.6 });
  doc.setTextColor(...INK);
  autoTable(doc, {
    startY: M + 11,
    margin: { left: PAGE_W - M - 66, right: M },
    tableWidth: 66,
    theme: "plain",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: { top: 0.9, bottom: 0.9, left: 1.5, right: 0 }, textColor: INK },
    columnStyles: { 0: { textColor: SLATE, cellWidth: 26 }, 1: { fontStyle: "bold", halign: "right" } },
    body: headRows(q),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headBottom = (doc as any).lastAutoTable.finalY as number;

  // Bill to | Deliver to
  const top = Math.max(y, headBottom) + 6;
  const blockW = (INNER - 8) / 2;
  let blockBottom = top;
  (
    [
      ["Bill to", q.invoiceTo],
      ["Deliver to", delivery],
    ] as [string, Customer][]
  ).forEach(([title, c], i) => {
    const x = M + i * (blockW + 8);
    let by = top;
    doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...SLATE);
    doc.text(title.toUpperCase(), x, by, { charSpace: 0.3 });
    doc.setTextColor(...INK).setFontSize(8.5);
    customerLines(c).forEach((line, j) => {
      doc.setFont("helvetica", j === 0 ? "bold" : "normal");
      for (const part of doc.splitTextToSize(line, blockW) as string[]) {
        by += 4;
        doc.text(part, x, by);
      }
    });
    blockBottom = Math.max(blockBottom, by);
  });

  // items
  const hasPhoto = cols.some((c) => c.key === "photo");
  const PIC = 12;
  autoTable(doc, {
    startY: blockBottom + 6,
    margin: { left: M, right: M, top: M, bottom: M + 6 },
    tableWidth: INNER,
    theme: "plain",
    rowPageBreak: "avoid",
    showHead: "everyPage",
    // an ink rule over and under the header, a light grid between the body cells, no outer box
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.6, lineColor: GRID, lineWidth: { bottom: 0.2, right: 0.2 }, textColor: INK, valign: "middle", overflow: "linebreak" },
    headStyles: { fontStyle: "bold", textColor: SLATE, fontSize: 7.2, lineColor: INK, lineWidth: { top: 0.6, bottom: 0.3 } },
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index === cols.length - 1) d.cell.styles.lineWidth = { bottom: 0.2 };
    },
    columnStyles: Object.fromEntries(
      cols.map((c, i) => [i, { cellWidth: (c.share / shareSum) * INNER, halign: c.align, ...(c.key === "photo" ? { minCellHeight: PIC + 2 } : {}) }]),
    ),
    head: [cols.map((c) => ({ content: c.head.toUpperCase(), styles: { halign: c.align } }))],
    body: calc.lines.map(({ line, amount }, i) => cols.map((c) => cellText(c.key, line, i, amount))),
    didDrawCell: (d) => {
      if (!hasPhoto || d.section !== "body" || cols[d.column.index]?.key !== "photo") return;
      const line = calc.lines[d.row.index]?.line;
      const pic = line?.photo ? pics.get(line.photo) : null;
      if (!line || !pic) return;
      const h = Math.min(PIC, (d.cell.width - 2) * pic.ratio);
      const w = h / pic.ratio;
      doc.addImage(pic.data, "JPEG", d.cell.x + (d.cell.width - w) / 2, d.cell.y + (d.cell.height - h) / 2, w, h, line.photo, "FAST");
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY as number;

  // totals, right aligned under the table
  const totals = totalRows(q, s);
  autoTable(doc, {
    startY: y + 2,
    margin: { left: PAGE_W - M - 70, right: M, bottom: M + 6 },
    tableWidth: 70,
    theme: "plain",
    rowPageBreak: "avoid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: { top: 1.1, bottom: 1.1, left: 2, right: 1.6 }, textColor: INK },
    columnStyles: { 1: { halign: "right" } },
    body: totals,
    didParseCell: (d) => {
      if (d.row.index === totals.length - 1) {
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fontSize = 11;
        d.cell.styles.lineColor = INK;
        d.cell.styles.lineWidth = { top: 0.6 };
        d.cell.styles.cellPadding = { top: 2, bottom: 1.1, left: 2, right: 1.6 };
      }
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable.finalY as number) + 7;

  // terms and payment details, each kept whole: on a new page when it does not fit
  const block = (title: string, text: string) => {
    if (!text.trim()) return;
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(text, INNER) as string[];
    const need = 5 + lines.length * 3.9;
    if (y + need > PAGE_H - M - 6) {
      doc.addPage();
      y = M + 4;
    }
    doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...SLATE);
    doc.text(title.toUpperCase(), M, y, { charSpace: 0.3 });
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...INK);
    doc.text(lines, M, y + 4.4);
    y += need + 3;
  };
  for (const [k, v] of termRows(q)) block(k, v);
  block("Payment details", s.quote.bank);

  // footer text and page numbers on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...SLATE);
    if (s.quote.footer.trim()) doc.text(doc.splitTextToSize(s.quote.footer.replace(/\n/g, "  "), INNER - 40) as string[], M, PAGE_H - 8);
    doc.text(`${q.number}   |   Page ${p} of ${pages}`, PAGE_W - M, PAGE_H - 8, { align: "right" });
  }
  return doc.output("blob");
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** True when this browser can hand a PDF file to another app (WhatsApp, Mail) through the system share sheet. */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    const probe = new File([new Blob(["x"], { type: "application/pdf" })], "probe.pdf", { type: "application/pdf" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

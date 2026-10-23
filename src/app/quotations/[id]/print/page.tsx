"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useLayoutEffect, useState } from "react";
import "./print.css";
import { saveQuote, useQuotes } from "@/lib/store";
import { calcQuote } from "@/lib/quote";
import { useSettings } from "@/lib/settings";
import { cellText, companyLines, customerLines, headRows, paperColumns, termRows, totalRows } from "@/lib/paper";
import type { Customer } from "@/lib/types";
import { Toast } from "@/components/ui";
import SendDialog, { useQuoteFiles } from "@/components/SendDialog";

function PartyBlock({ title, c }: { title: string; c: Customer }) {
  const lines = customerLines(c);
  return (
    <div className="party">
      <div className="lbl">{title}</div>
      {lines.map((l, i) => (
        <div key={i} className={i === 0 ? "strong" : ""}>
          {l}
        </div>
      ))}
    </div>
  );
}

export default function PrintPage() {
  const { id } = useParams<{ id: string }>();
  const quotes = useQuotes();
  const s = useSettings();
  const q = quotes.find((x) => x.id === id);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState("");
  const flash = useCallback((t: string) => {
    setToast(t);
    setTimeout(() => setToast(""), 2600);
  }, []);
  const files = useQuoteFiles(q, s, flash);

  // phones: shrink the A4 sheet on screen to the screen width (print and the PDF are not affected)
  useLayoutEffect(() => {
    const SHEET_PX = 794; // 210mm at 96 dpi
    // clientWidth is the real screen width; innerWidth grows when a phone zooms out to show a too-wide page
    const fit = () => {
      const w = Math.min(window.innerWidth, document.documentElement.clientWidth);
      document.documentElement.style.setProperty("--paper-zoom", String(Math.min(1, (w - 16) / SHEET_PX)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  if (!q) {
    return (
      <div className="paper-wrap">
        <div className="paper">Quotation not found.</div>
      </div>
    );
  }
  const calc = calcQuote(q);
  const cols = paperColumns(s, q);
  const shareSum = cols.reduce((n, c) => n + c.share, 0);
  const delivery = q.sameDelivery ? q.invoiceTo : q.deliveryTo;
  const totals = totalRows(q, s);
  const blocks = [...termRows(q), ...(s.quote.bank.trim() ? ([["Payment details", s.quote.bank]] as [string, string][]) : [])];

  return (
    <div className="paper-wrap">
      <div className="no-print print-toolbar">
        <Link href={`/quotations/${q.id}`} className="tb-link">
          Back to edit
        </Link>
        <span className="tb-title">{q.number}</span>
        <span className="tb-spacer" />
        <button className="tb-btn" onClick={() => setSending(true)}>
          Send via WhatsApp
        </button>
        <button className="tb-btn" disabled={files.xlsBusy} onClick={() => void files.downloadExcel()}>
          {files.xlsBusy ? "Building Excel" : "Download Excel"}
        </button>
        <button className="tb-btn" onClick={() => window.print()}>
          Print
        </button>
        <button className="tb-btn tb-primary" disabled={files.pdfBusy} onClick={() => void files.downloadPdf()}>
          {files.pdfBusy ? "Building PDF" : "Download PDF"}
        </button>
      </div>
      {!s.company.name.trim() && (
        <div className="no-print print-note">
          No company details yet. <Link href="/settings">Add them in Settings</Link> and they show at the top of every quotation.
        </div>
      )}

      <div className="paper">
        <div className="top">
          <div className="co">
            {s.company.logo && <img src={s.company.logo} alt="" className="logo" />}
            <div className="co-name">{s.company.name}</div>
            {companyLines(s).map((l, i) => (
              <div key={i} className="co-line">
                {l}
              </div>
            ))}
          </div>
          <div className="doc">
            <div className="doc-title">{s.quote.title || "QUOTATION"}</div>
            <table className="head">
              <tbody>
                {headRows(q).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="parties">
          <PartyBlock title="Bill to" c={q.invoiceTo} />
          <PartyBlock title="Deliver to" c={delivery} />
        </div>

        <table className="items">
          <colgroup>
            {cols.map((c) => (
              <col key={c.key} style={{ width: `${(c.share / shareSum) * 100}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={c.align}>
                  {c.head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calc.lines.map(({ line, amount }, i) => (
              <tr key={line.id}>
                {cols.map((c) =>
                  c.key === "photo" ? (
                    <td key={c.key} className="pic">
                      {line.photo && <img src={line.photo} alt={line.name} />}
                    </td>
                  ) : c.key === "item" ? (
                    <td key={c.key} className="left">
                      <div>{line.name}</div>
                      {line.variant && <div className="sub">{line.variant}</div>}
                    </td>
                  ) : (
                    <td key={c.key} className={c.align}>
                      {cellText(c.key, line, i, amount)}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>

        <table className="totals">
          <tbody>
            {totals.map(([k, v], i) => (
              <tr key={k} className={i === totals.length - 1 ? "grand" : ""}>
                <td>{k}</td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {blocks.map(([k, v]) => (
          <div key={k} className="block">
            <div className="lbl">{k}</div>
            <div className="txt">{v}</div>
          </div>
        ))}
        {s.quote.footer.trim() && <div className="foot">{s.quote.footer}</div>}
      </div>

      {sending && (
        <div className="no-print">
          <SendDialog q={q} s={s} files={files} flash={flash} onClose={() => setSending(false)} onSent={() => q.status !== "Sent" && saveQuote({ ...q, status: "Sent" })} />
        </div>
      )}
      {toast && (
        <div className="no-print">
          <Toast text={toast} />
        </div>
      )}
    </div>
  );
}

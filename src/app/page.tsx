"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { deleteQuote, getQuote, newDraft, queueImport, saveQuote, useQuotes, type PendingImport } from "@/lib/store";
import { calcQuote, cityOf, fmtDate, fmtMoney, sourceSnippet } from "@/lib/quote";
import { hasCompany, useSettings } from "@/lib/settings";
import { useProducts } from "@/lib/products";
import { loadSample } from "@/lib/sample";
import type { Quotation, QuoteSource } from "@/lib/types";
import { btnDanger, btnGhost, btnPrimary, card, IconChat, IconCheck, IconPencil, IconPhoto, IconSearch, IconWarn, inputCls, Menu, Modal, StatusChip, Tabs } from "@/components/ui";
import ImportZone from "@/components/ImportZone";
import NewQuoteButton from "@/components/NewQuoteButton";

type Filter = "All" | "Draft" | "Sent" | "Look";

/** A draft built from a message where some lines are not in the catalogue: someone should reply about those. */
const needsLook = (q: Quotation) => q.status === "Draft" && (q.source?.notCarried.length ?? 0) > 0;

const COLS = { gridTemplateColumns: "150px minmax(170px, 1fr) minmax(210px, 1.35fr) 124px 120px 116px 92px 44px" };

function toggleSent(id: string) {
  const q = getQuote(id);
  if (!q) return;
  saveQuote({ ...q, status: q.status === "Sent" ? "Draft" : "Sent" });
}

/** What the customer sent, in one line. Typed-in quotations say so. */
function Sent({ source }: { source?: QuoteSource }) {
  if (!source) {
    return (
      <span className="flex min-w-0 items-center gap-2 text-[13px] text-[var(--q-text-3)]">
        <IconPencil /> Typed in
      </span>
    );
  }
  const text = sourceSnippet(source.text) || (source.kind === "text" ? "Pasted order" : "Screenshot");
  return (
    <span className="flex min-w-0 items-center gap-2 text-[13px] text-[var(--q-text)]">
      <span className="text-[var(--q-accent)]">{source.kind === "photo" ? <IconPhoto /> : <IconChat />}</span>
      <span className="truncate">&ldquo;{text}&rdquo;</span>
    </span>
  );
}

function Matched({ source }: { source?: QuoteSource }) {
  if (!source) return <span className="text-[13px] font-medium text-[var(--q-text-3)]">Not imported</span>;
  const missing = source.notCarried.length > 0;
  return (
    <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${missing ? "text-[var(--q-danger)]" : "text-[var(--q-ok)]"}`} title={missing ? `Not in your product list: ${source.notCarried.join(", ")}` : "Every line matched"}>
      {missing ? <IconWarn /> : <IconCheck size={15} />}
      {source.matched} of {source.total}
    </span>
  );
}

/** A brand new install: three steps to a first quotation, or the sample data to try it at once. */
function GetStarted({ company, products }: { company: boolean; products: boolean }) {
  const step = (done: boolean, n: number, title: string, href: string, action: string) => (
    <li className="flex items-center gap-3 border-b border-[var(--q-row)] py-3 last:border-0">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${done ? "bg-[var(--q-ok-soft)] text-[var(--q-ok)]" : "bg-[var(--q-chip-bg)] text-[var(--q-text-2)]"}`}>
        {done ? <IconCheck size={13} /> : n}
      </span>
      <span className={`flex-1 text-[14px] ${done ? "text-[var(--q-text-3)] line-through" : "font-semibold text-[var(--q-text)]"}`}>{title}</span>
      {!done && action && (
        <Link href={href} className={`${btnGhost} h-9`}>
          {action}
        </Link>
      )}
    </li>
  );
  return (
    <section className={`${card} flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-8 sm:p-6`}>
      <div className="min-w-0 sm:w-[260px]">
        <h2 className="text-[17px] font-bold text-[var(--q-text)]">Get started</h2>
        
        <button className={`${btnPrimary} mt-3`} onClick={() => loadSample()}>
          Load sample data
        </button>
      </div>
      <ol className="min-w-0 flex-1">
        {step(company, 1, "Company details", "/settings", "Settings")}
        {step(products, 2, "Products and prices", "/products", "Products")}
        {step(false, 3, "First quotation: paste an order above", "/", "")}
      </ol>
    </section>
  );
}

export default function QuotationsPage() {
  const router = useRouter();
  const quotes = useQuotes();
  const settings = useSettings();
  const catalog = useProducts();
  const cur$ = settings.currency;
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<Filter>("All");
  const [search, setSearch] = useState("");
  const [toDelete, setToDelete] = useState<Quotation | null>(null);
  useEffect(() => setReady(true), []);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return quotes
      .filter((x) => (filter === "All" ? true : filter === "Look" ? needsLook(x) : x.status === filter))
      .filter(
        (x) =>
          !s ||
          x.number.toLowerCase().includes(s) ||
          x.invoiceTo.name.toLowerCase().includes(s) ||
          x.invoiceTo.contact.toLowerCase().includes(s) ||
          (x.source?.text || "").toLowerCase().includes(s),
      )
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.updatedAt.localeCompare(a.updatedAt)))
      .map((q) => ({ q, total: calcQuote(q).total }));
  }, [quotes, filter, search]);

  const counts = useMemo(() => {
    const c = { All: quotes.length, Draft: 0, Sent: 0, Look: 0 };
    for (const x of quotes) {
      c[x.status]++;
      if (needsLook(x)) c.Look++;
    }
    return c;
  }, [quotes]);

  function startImport(p: PendingImport) {
    const q = saveQuote(newDraft());
    queueImport(q.id, p);
    router.push(`/quotations/${q.id}`);
  }

  const menuFor = (q: Quotation) => [
    { label: "Open", onClick: () => router.push(`/quotations/${q.id}`) },
    { label: "Preview / print", onClick: () => router.push(`/quotations/${q.id}/print`) },
    { label: q.status === "Sent" ? "Mark as draft" : "Mark as sent", onClick: () => toggleSent(q.id) },
    { label: "Delete", onClick: () => setToDelete(q), danger: true },
  ];
  const place = (q: Quotation) => [q.invoiceTo.contact, cityOf(q.invoiceTo.address2)].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-bold tracking-[-0.5px] text-[var(--q-text)] sm:text-[28px]">Quotations</h1>
        <NewQuoteButton className={btnGhost}>Blank quotation</NewQuoteButton>
      </div>

      <ImportZone onImport={startImport} />

      {ready && quotes.length === 0 && <GetStarted company={hasCompany(settings)} products={catalog.length > 0} />}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs<Filter>
            value={filter}
            onChange={setFilter}
            items={[
              { key: "All", label: "All", count: ready ? counts.All : undefined },
              { key: "Draft", label: "Draft", count: ready ? counts.Draft : undefined },
              { key: "Sent", label: "Sent", count: ready ? counts.Sent : undefined },
              { key: "Look", label: "Needs a look", count: ready ? counts.Look : undefined, flag: true },
            ]}
          />
          <label className="relative block w-full sm:w-[300px]">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--q-text-3)]">
              <IconSearch />
            </span>
            <input type="search" className={`${inputCls} h-10 pl-9`} value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search customer, quote number or message" />
          </label>
        </div>

        <div className={`${card} hidden overflow-hidden lg:block`}>
          <div className="overflow-x-auto">
            <div className="min-w-[1016px]">
              <div className="grid h-11 items-center border-b border-[var(--q-text)] text-[10.5px] font-bold uppercase tracking-[0.7px] text-[var(--q-text-3)]" style={COLS}>
                <span className="px-4">Quote</span>
                <span className="px-4">Customer</span>
                <span className="px-4">What they sent</span>
                <span className="px-4">Matched</span>
                <span className="px-4">Date</span>
                <span className="px-4 text-right">Total ({cur$})</span>
                <span className="px-4">Status</span>
                <span />
              </div>
              {ready &&
                rows.map(({ q, total }) => (
                  <div
                    key={q.id}
                    className="grid h-[56px] cursor-pointer items-center border-b border-[var(--q-border)] last:border-0 hover:bg-[var(--q-surface-alt)]"
                    style={COLS}
                    onClick={() => router.push(`/quotations/${q.id}`)}
                  >
                    <span className="px-4">
                      <Link href={`/quotations/${q.id}`} className="q-mono text-[13px] font-semibold text-[var(--q-text)] hover:text-[var(--q-accent)] hover:underline" onClick={(e) => e.stopPropagation()}>
                        {q.number}
                      </Link>
                    </span>
                    <span className="flex min-w-0 flex-col px-4 leading-tight">
                      <span className="truncate font-semibold text-[var(--q-text)]">{q.invoiceTo.name || <span className="font-medium text-[var(--q-text-3)]">No customer yet</span>}</span>
                      <span className="mt-0.5 truncate text-[12.5px] text-[var(--q-text-3)]">{place(q)}</span>
                    </span>
                    <span className="min-w-0 px-4">
                      <Sent source={q.source} />
                    </span>
                    <span className="px-4">
                      <Matched source={q.source} />
                    </span>
                    <span className="q-mono whitespace-nowrap px-4 text-[12.5px] text-[var(--q-text-2)]">{fmtDate(q.date)}</span>
                    <span className="q-mono px-4 text-right text-[13.5px] font-semibold text-[var(--q-text)]">{fmtMoney(total)}</span>
                    <span className="px-4">
                      <StatusChip status={q.status} />
                    </span>
                    <span className="flex justify-end pr-2" onClick={(e) => e.stopPropagation()}>
                      <Menu items={menuFor(q)} />
                    </span>
                  </div>
                ))}
              {ready && rows.length === 0 && (
                <div className="px-4 py-12 text-center text-[13.5px] text-[var(--q-text-3)]">{quotes.length === 0 ? "No quotations yet. Paste an order above to make the first one." : "Nothing matches."}</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 lg:hidden">
          {ready &&
            rows.map(({ q, total }) => (
              <article key={q.id} className={`${card} flex cursor-pointer flex-col gap-2 p-4`} onClick={() => router.push(`/quotations/${q.id}`)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="q-mono text-[12.5px] font-medium text-[var(--q-text-2)]">{q.number}</div>
                    <div className="mt-0.5 truncate text-[15px] font-bold text-[var(--q-text)]">{q.invoiceTo.name || "No customer yet"}</div>
                    <div className="truncate text-[12.5px] text-[var(--q-text-3)]">{place(q)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <StatusChip status={q.status} />
                    <Menu items={menuFor(q)} />
                  </div>
                </div>
                <Sent source={q.source} />
                <div className="flex items-end justify-between gap-3 border-t border-[var(--q-row)] pt-2.5">
                  <Matched source={q.source} />
                  <span className="text-right">
                    <span className="q-mono block text-[11.5px] text-[var(--q-text-3)]">{fmtDate(q.date)}</span>
                    <span className="q-mono block text-[15px] font-semibold text-[var(--q-text)]">
                      {cur$} {fmtMoney(total)}
                    </span>
                  </span>
                </div>
              </article>
            ))}
          {ready && rows.length === 0 && <div className={`${card} px-3 py-10 text-center text-[13px] text-[var(--q-text-3)]`}>{quotes.length === 0 ? "No quotations yet." : "Nothing matches."}</div>}
        </div>
      </div>

      {toDelete && (
        <Modal
          title="Delete this quotation?"
          onClose={() => setToDelete(null)}
          footer={
            <>
              <button className={btnGhost} onClick={() => setToDelete(null)}>
                Keep it
              </button>
              <button
                className={btnDanger}
                onClick={() => {
                  deleteQuote(toDelete.id);
                  setToDelete(null);
                }}
              >
                Delete
              </button>
            </>
          }
        >
          <span className="q-mono text-[var(--q-text)]">{toDelete.number}</span> will be removed. This cannot be undone.
        </Modal>
      )}
    </div>
  );
}

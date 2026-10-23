"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { allQuotes, blankLine, getQuote, lineFromProduct, saveQuote, takeImport, type PendingImport } from "@/lib/store";
import { getProduct, priceFor, productLabel, products, useProducts } from "@/lib/products";
import { cleanLine, relist, runActions } from "@/lib/edit";
import { calcQuote, cityOf, fmtDate, fmtMoney, fmtQty, isUnnamedNumber, lineAmount, nextQuoteNumber, round3, validUntil } from "@/lib/quote";
import { companyLines } from "@/lib/paper";
import { getSettings, priceListName, saveSettings, useSettings, type QuoteColumns } from "@/lib/settings";
import { useSyncState } from "@/lib/collection";
import { CUSTOM_PRICE, type Customer, type Product, type QuoteLine, type Quotation, type QuoteSource } from "@/lib/types";
import { shrinkDataUrl } from "@/lib/image";
import { allCustomers, EMPTY_CUSTOMER, phoneKey, toCustomer } from "@/lib/customers";
import { loadSample } from "@/lib/sample";
import type { AssistAction, Applied } from "@/lib/assist";
import { btnAi, btnGhost, btnPrimary, IconChat, IconCheck, IconChevron, IconPlus, IconSend, IconSparkle, IconWarn, labelCls, Modal, StatusChip, Switch, Toast } from "@/components/ui";
import Assistant, { type ImportInfo, type Plan } from "@/components/Assistant";
import Lightbox, { type LightboxItem } from "@/components/Lightbox";
import { LineRow, LineRowPhone } from "@/components/editor/LineRow";
import ProductSearch from "@/components/editor/ProductSearch";
import { CustomerCard, DeliveryCard } from "@/components/editor/PartyCard";
import NumberField from "@/components/editor/NumberField";
import SendDialog, { useQuoteFiles } from "@/components/SendDialog";

const bigOfProduct = (p: Product): LightboxItem => ({ src: p.photo, title: productLabel(p), sub: p.description });
const bigOfLine = (l: QuoteLine): LightboxItem => ({ src: l.photo, title: [l.code, l.name].filter(Boolean).join(" "), sub: l.variant });

function SyncText({ sync }: { sync: "saved" | "saving" | "error" }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[12.5px] ${sync === "error" ? "font-semibold text-[var(--q-danger)]" : "text-[var(--q-text-3)]"}`}>
      {sync === "saved" ? (
        <>
          <IconCheck size={12} /> Saved
        </>
      ) : sync === "saving" ? (
        "Saving"
      ) : (
        "Not saved. Check the connection."
      )}
    </span>
  );
}

/** Where the lines came from: the customer's message, how many lines matched, and what we do not sell. */
function SourceBox({ source, onView }: { source: QuoteSource; onView: () => void }) {
  const missing = source.notCarried.length > 0;
  const what = source.kind === "screenshot" ? "From WhatsApp" : source.kind === "photo" ? "Product photo" : "Pasted message";
  return (
    <div className="flex flex-col gap-2.5">
      <button type="button" onClick={onView} className="flex items-center gap-3 rounded-[12px] text-left hover:bg-white/60" aria-label="View the customer's message">
        {source.image ? (
          <img src={source.image} alt="" className="h-[52px] w-[40px] shrink-0 rounded-[8px] border border-[var(--q-border-strong)] object-cover object-bottom" />
        ) : (
          <span className="flex h-[52px] w-[40px] shrink-0 items-center justify-center rounded-[8px] border border-[var(--q-border-strong)] bg-white text-[var(--q-accent)]">
            <IconChat size={18} />
          </span>
        )}
        <span className="min-w-0 flex-1 text-[13px] leading-snug">
          <span className="block font-bold text-[var(--q-text)]">{what}</span>
          {source.customer && <span className="block truncate text-[var(--q-text-2)]">{source.customer.name}</span>}
          <span className={`inline-flex items-center gap-1 font-semibold ${missing ? "text-[var(--q-danger)]" : "text-[var(--q-ok)]"}`}>
            {missing ? <IconWarn size={13} /> : <IconCheck size={12} />}
            {source.matched} of {source.total} matched
          </span>
        </span>
        <span className="shrink-0 text-[12.5px] font-semibold text-[var(--q-accent)]">View</span>
      </button>
      {missing && (
        <div className="rounded-[10px] border border-[var(--q-danger-border)] bg-[var(--q-danger-bg)] px-3 py-2 text-[12.5px]">
          <div className="font-bold text-[var(--q-danger)]">Not in your products</div>
          <ul className="mt-1 flex flex-col gap-0.5 text-[var(--q-text)]">
            {source.notCarried.map((t, i) => (
              <li key={i}>{t.replace(/^(\d+)\s+/, "$1 × ")}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A value on the paper you can change: label on the left, the cell on the right. */
const metaLabel = "whitespace-nowrap text-[13px] text-[var(--q-text-3)]";

/** A date written on the paper as "21 Sep 2026"; clicking it opens the date picker. */
function DateCell({ value, min, label, onChange }: { value: string; min?: string; label: string; onChange: (iso: string) => void }) {
  return (
    <span className="q-cell relative inline-flex w-[132px] items-center px-1.5 py-[3px]">
      <span className={`q-mono text-[13px] ${value ? "text-[var(--q-text)]" : "text-[var(--q-text-3)]"}`}>{value ? fmtDate(value) : "None"}</span>
      <input
        type="date"
        aria-label={label}
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            /* the picker opens on its own where showPicker is missing */
          }
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </span>
  );
}
const termBox = "q-cell w-full resize-none px-2 py-1.5 text-[13px] leading-snug text-[var(--q-text)] [field-sizing:content] min-h-[52px]";

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const settings = useSettings();
  const catalog = useProducts();
  const sync = useSyncState();
  const [q, setQ] = useState<Quotation | null>(null);
  const [missing, setMissing] = useState(false);
  const [toast, setToast] = useState("");
  const [pendingList, setPendingList] = useState<string | null>(null);
  const [assistOpen, setAssistOpen] = useState(false);
  const [big, setBig] = useState<LightboxItem | null>(null);
  const [autoSend, setAutoSend] = useState<PendingImport | null>(null);
  const [showMsg, setShowMsg] = useState(false);
  const [sending, setSending] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const aiAnchor = useRef<HTMLDivElement>(null);
  const qRef = useRef<Quotation | null>(null);
  qRef.current = q;
  const loaded = useRef(false);

  // load once from the store (client only), before the first paint so no empty frame flashes
  useLayoutEffect(() => {
    const found = getQuote(id);
    if (found) setQ(found);
    else setMissing(true);
    // an order dropped on the quotation list: open Add with AI and read it straight away
    const handed = found ? takeImport(id) : undefined;
    if (handed) {
      setAutoSend(handed);
      setAssistOpen(true);
    }
  }, [id]);

  // every change after the first load is saved (the store coalesces writes)
  useEffect(() => {
    if (!q) return;
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    saveQuote(q);
  }, [q]);

  const patch = useCallback((fn: (cur: Quotation) => Quotation) => setQ((cur) => (cur ? fn(cur) : cur)), []);
  const flash = useCallback((t: string) => {
    setToast(t);
    setTimeout(() => setToast(""), 2200);
  }, []);
  const files = useQuoteFiles(q, settings, flash);
  const zoomProduct = useCallback((p: Product) => p.photo && setBig(bigOfProduct(p)), []);
  const zoomLine = useCallback((l: QuoteLine) => l.photo && setBig(bigOfLine(l)), []);

  /** add a product at the quotation's price list */
  const addProduct = useCallback(
    (p: Product) => {
      const cur = qRef.current;
      if (!cur) return;
      const line = lineFromProduct(p, cur.priceList);
      patch((x) => ({ ...x, lines: [...x.lines, line] }));
      const listName = priceListName(getSettings(), cur.priceList);
      flash(line.priceList === CUSTOM_PRICE ? `${p.name} added. No ${listName} price, type one in.` : `${p.name} added`);
      setTimeout(() => searchRef.current?.focus(), 0);
    },
    [patch, flash],
  );
  const addTyped = useCallback(() => patch((x) => ({ ...x, lines: [...x.lines, blankLine()] })), [patch]);
  const onChange = useCallback(
    (lineId: string, fields: Partial<QuoteLine>) => patch((x) => ({ ...x, lines: x.lines.map((l) => (l.id === lineId ? { ...l, ...cleanLine(fields) } : l)) })),
    [patch],
  );
  const onPrice = useCallback((lineId: string, unitPrice: number) => onChange(lineId, { unitPrice, priceList: CUSTOM_PRICE }), [onChange]);
  const onRemove = useCallback((lineId: string) => patch((x) => ({ ...x, lines: x.lines.filter((l) => l.id !== lineId) })), [patch]);
  const onPickList = useCallback(
    (lineId: string, listId: string) => {
      const line = qRef.current?.lines.find((l) => l.id === lineId);
      const p = getProduct(line?.productId);
      const price = p ? priceFor(p, listId) : null;
      if (price === null) {
        flash(`No ${priceListName(getSettings(), listId)} price for this product. Type the price in.`);
        onChange(lineId, { priceList: CUSTOM_PRICE });
        return;
      }
      onChange(lineId, { priceList: listId, unitPrice: price });
    },
    [onChange, flash],
  );
  /** all product lines, one price list */
  const applyList = useCallback(
    (listId: string) => {
      const cur = qRef.current;
      if (!cur) return;
      const { next, skipped } = relist(cur, listId);
      setQ(next);
      setPendingList(null);
      const name = priceListName(getSettings(), listId);
      flash(skipped ? `All lines set to ${name}. ${skipped} had no ${name} price and kept their number.` : `All lines set to ${name}`);
    },
    [flash],
  );
  const onTermList = useCallback(
    (listId: string) => {
      const cur = qRef.current;
      if (!cur) return;
      if (cur.lines.every((l) => l.productId === null)) patch((x) => ({ ...x, priceList: listId }));
      else setPendingList(listId);
    },
    [patch],
  );
  /** A finished customer choice on a draft still numbered QT-NEW-... gives it the customer's code (QT-PWP-2609-01). */
  const onCustomer = useCallback(
    (c: Customer, final?: boolean) =>
      patch((x) => {
        const next = { ...x, invoiceTo: c };
        if (final && x.status === "Draft" && isUnnamedNumber(x.number) && c.name.trim()) {
          next.number = nextQuoteNumber(
            allQuotes().filter((o) => o.id !== x.id),
            getSettings().quote.prefix,
            c.name,
            x.date,
          );
        }
        return next;
      }),
    [patch],
  );
  const onDelivery = useCallback((c: Customer) => patch((x) => ({ ...x, deliveryTo: c })), [patch]);
  const onSame = useCallback((v: boolean) => patch((x) => ({ ...x, sameDelivery: v, deliveryTo: v ? x.deliveryTo : x.deliveryTo.name ? x.deliveryTo : x.invoiceTo })), [patch]);

  /** Add with AI shows what it found first (a dry run), and only adds it when the button is pressed. */
  const planActions = useCallback((actions: AssistAction[]): Plan => {
    const cur = qRef.current!;
    const { next, done } = runActions(cur, actions);
    const before = new Set(cur.lines.map((l) => l.id));
    const lines = next.lines.filter((l) => !before.has(l.id)).map((line) => ({ line, amount: lineAmount(line) }));
    return { done, lines, subtotal: lines.reduce((s, l) => s + l.amount, 0), priceList: done.priceList ?? priceListName(getSettings(), next.priceList) };
  }, []);
  const applyActions = useCallback((actions: AssistAction[]): Applied => {
    const cur = qRef.current;
    if (!cur || actions.length === 0) return { added: [], changed: [], removed: [] };
    const { next, done } = runActions(cur, actions);
    setQ(next);
    return done;
  }, []);
  const getContext = useCallback(() => {
    const cur = qRef.current!;
    const s = getSettings();
    return {
      priceList: priceListName(s, cur.priceList),
      priceLists: s.priceLists.map((l) => l.name),
      lines: cur.lines.filter((l) => l.productId).map((l) => ({ productId: l.productId!, qty: l.qty, unitPrice: l.unitPrice })),
      customers: allCustomers().map((c) => ({ id: c.id, name: c.name, contact: c.contact, tel: c.tel, town: cityOf(c.address2) })),
      catalog: products.all().map((p) => ({ id: p.id, code: p.code, name: p.name, variant: p.variant, category: p.category, unit: p.unit, description: p.description })),
    };
  }, []);
  const closeAssist = useCallback(() => setAssistOpen(false), []);
  const clearAutoSend = useCallback(() => setAutoSend(null), []);
  /** The first Add with AI that fills the quotation keeps the customer's message with it (a small copy of the picture). */
  const onImported = useCallback(
    async (info: ImportInfo) => {
      // who sent it: fill the customer when the quotation has none yet (a saved one if recognised, else what the message says)
      let who: QuoteSource["customer"];
      const cur = qRef.current;
      if (cur && !cur.invoiceTo.name.trim() && !cur.invoiceTo.contact.trim() && info.customer) {
        const book = allCustomers();
        let saved = info.customer.id ? book.find((c) => c.id === info.customer!.id) : undefined;
        const tel = phoneKey(info.customer.tel);
        if (!saved && tel.length >= 7) saved = book.find((c) => phoneKey(c.tel) === tel);
        if (saved) {
          onCustomer(toCustomer(saved), true);
          who = { name: saved.name, matched: true };
        } else if (info.customer.name || info.customer.contact) {
          const c = info.customer;
          onCustomer({ ...EMPTY_CUSTOMER, name: c.name, contact: c.contact, tel: c.tel, address1: c.address1, address2: c.address2, email: c.email, regNo: c.regNo }, true);
          who = { name: info.customer.name || info.customer.contact, matched: false };
        }
      }
      if (qRef.current?.source) {
        if (who) patch((x) => (x.source ? { ...x, source: { ...x.source, customer: who } } : x));
        return;
      }
      let image: string | undefined;
      if (info.images[0]) {
        try {
          image = await shrinkDataUrl(info.images[0]);
        } catch {
          image = undefined;
        }
      }
      const kind: QuoteSource["kind"] = info.images.length === 0 ? "text" : info.photoMatched && !info.sourceText ? "photo" : "screenshot";
      const source: QuoteSource = {
        kind,
        text: info.text || info.sourceText,
        image,
        matched: info.added,
        total: info.added + info.missed.length,
        notCarried: info.missed,
        customer: who,
        at: new Date().toISOString(),
      };
      patch((x) => (x.source ? x : { ...x, source }));
    },
    [patch, onCustomer],
  );
  const closeBig = useCallback(() => setBig(null), []);
  const setColumns = useCallback((c: Partial<QuoteColumns>) => saveSettings((s) => ({ ...s, quote: { ...s.quote, columns: { ...s.quote.columns, ...c } } })), []);

  const calc = useMemo(() => (q ? calcQuote(q) : null), [q]);
  const byId = useMemo(() => new Map(catalog.map((p) => [p.id, p])), [catalog]);

  if (missing) {
    return (
      <div className="text-[13.5px] text-[var(--q-text-2)]">
        Quotation not found.{" "}
        <Link href="/" className="font-semibold text-[var(--q-accent)] hover:underline">
          Back to quotations
        </Link>
      </div>
    );
  }
  if (!q || !calc) return <div aria-busy="true" className="min-h-[60vh]" />;

  const s = settings;
  const cur$ = s.currency;
  const cols: QuoteColumns = { ...s.quote.columns, discount: s.quote.columns.discount || q.lines.some((l) => l.discount > 0) };
  const showTax = s.tax.enabled || q.taxRate > 0;
  const hasLines = q.lines.length > 0;
  const listName = priceListName(s, q.priceList);
  const until = validUntil(q);
  const company = companyLines(s);
  const colCount = 5 + Number(cols.photo) + Number(cols.code) + Number(cols.unit) + Number(cols.discount);

  const rowProps = calc.lines.map(({ line, amount }, i) => ({
    key: line.id,
    index: i,
    line,
    product: line.productId ? byId.get(line.productId) : undefined,
    amount,
    priceLists: s.priceLists,
    quoteList: q.priceList,
    cols,
    onChange,
    onPrice,
    onPickList,
    onRemove,
    onZoom: zoomLine,
  }));

  const setUntil = (iso: string) => {
    if (!iso) return patch((x) => ({ ...x, validDays: 0 }));
    const days = Math.round((Date.parse(iso + "T00:00:00") - Date.parse(q.date + "T00:00:00")) / 86400000);
    patch((x) => ({ ...x, validDays: Math.max(0, days) }));
  };
  const openSend = () => (hasLines ? setSending(true) : flash("Add an item first"));

  /* the side panel: files, price list, columns, the customer's message. Desktop on the right; phone under the paper */
  const panel = (
    <>
      <div className="grid grid-cols-3 gap-2">
        <button className={`${btnGhost} px-2`} disabled={!hasLines || files.pdfBusy} onClick={() => void files.downloadPdf()}>
          {files.pdfBusy ? "PDF…" : "PDF"}
        </button>
        <button className={`${btnGhost} px-2`} disabled={!hasLines || files.xlsBusy} onClick={() => void files.downloadExcel()}>
          Excel
        </button>
        <Link
          href={`/quotations/${q.id}/print`}
          onClick={() => saveQuote(q)}
          className={`${btnGhost} px-2 ${hasLines ? "" : "pointer-events-none opacity-50"}`}
          aria-disabled={!hasLines}
        >
          Print
        </Link>
      </div>
      <div className="h-px bg-[rgba(14,42,122,0.1)]" />
      {s.priceLists.length > 1 && (
        <label className="block">
          <span className={labelCls}>Price list</span>
          <span className="relative block">
            <select
              className="h-10 w-full appearance-none rounded-[10px] border border-[var(--q-border-strong)] bg-white pl-3 pr-9 text-[14px] text-[var(--q-text)] outline-none focus:border-[var(--q-accent)] focus:ring-[3px] focus:ring-[var(--q-ring)]"
              value={q.priceList}
              onChange={(e) => onTermList(e.target.value)}
            >
              {s.priceLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--q-text-3)]">
              <IconChevron />
            </span>
          </span>
        </label>
      )}
      <div>
        <span className={labelCls}>Columns</span>
        {(
          [
            ["photo", "Photo"],
            ["code", "Code"],
            ["unit", "Unit"],
            ["discount", "Discount"],
          ] as [keyof QuoteColumns, string][]
        ).map(([k, label]) => (
          <div key={k} className="flex h-8 items-center justify-between text-[13.5px] text-[var(--q-text)]">
            {label}
            <Switch label={`${label} column`} on={s.quote.columns[k]} onChange={(v) => setColumns({ [k]: v })} />
          </div>
        ))}
      </div>
      {q.source && (
        <>
          <div className="h-px bg-[rgba(14,42,122,0.1)]" />
          <SourceBox source={q.source} onView={() => setShowMsg(true)} />
        </>
      )}
    </>
  );

  return (
    <div className="mx-auto max-w-[1260px] min-[1800px]:max-w-[1480px]">
      {/* phone: back, number, Send */}
      <header className="q-glass sticky top-0 z-30 -mx-3 -mt-4 mb-3 flex h-[60px] items-center gap-2 rounded-none border-x-0 border-t-0 px-2 shadow-none sm:-mx-4 lg:hidden">
        <Link href="/" aria-label="Back to quotations" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[var(--q-text)]">
          <IconChevron dir="left" size={20} />
        </Link>
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="q-mono truncate text-[14px] font-semibold">{q.number}</b>
          <span className="flex items-center gap-1.5 text-[12px] text-[var(--q-text-3)]">
            {q.status} · <SyncText sync={sync} />
          </span>
        </span>
        <button className={`${btnPrimary} shrink-0 px-3.5`} onClick={openSend} disabled={!hasLines}>
          <IconSend size={15} /> Send
        </button>
      </header>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
        {/* the quotation paper */}
        <article className="q-paper min-w-0 flex-1 rounded-[8px] px-4 py-5 sm:px-7 sm:py-7 lg:px-9 lg:py-9">
          <div className="flex flex-col-reverse gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="flex min-w-0 gap-3">
              {s.company.logo && <img src={s.company.logo} alt="" className="h-[46px] w-auto max-w-[120px] shrink-0 object-contain" />}
              {s.company.name.trim() ? (
                <div className="min-w-0 text-[12.5px] leading-[1.55] text-[var(--q-text-3)]">
                  <div className="text-[15px] font-bold text-[var(--q-text)]">{s.company.name}</div>
                  {company.map((l, i) => (
                    <div key={i} className="break-words">
                      {l}
                    </div>
                  ))}
                </div>
              ) : (
                <Link href="/settings" className="flex h-[46px] items-center gap-2 rounded-[10px] border-[1.5px] border-dashed border-[var(--q-ai-border)] bg-[var(--q-accent-soft)] px-3 text-[13px] font-semibold text-[var(--q-accent)]">
                  <IconPlus size={13} /> Add your company
                </Link>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <span className="q-grad-text text-[22px] font-extrabold leading-none tracking-[2px] sm:text-[30px]">{s.quote.title || "QUOTATION"}</span>
              <div className="grid grid-cols-[auto_auto] items-center gap-x-4 gap-y-1.5 self-start sm:self-end">
                <span className={metaLabel}>Quotation No.</span>
                <b className="q-mono px-1.5 text-[13px] font-semibold text-[var(--q-text)] break-all">{q.number}</b>
                <span className={metaLabel}>Date</span>
                <DateCell label="Date" value={q.date} onChange={(v) => v && patch((x) => ({ ...x, date: v }))} />
                <span className={metaLabel}>Valid until</span>
                <DateCell label="Valid until" value={until} min={q.date} onChange={setUntil} />
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 items-start gap-3 sm:grid-cols-2 sm:gap-5">
            <CustomerCard customer={q.invoiceTo} onChange={onCustomer} />
            <DeliveryCard same={q.sameDelivery} customer={q.deliveryTo} invoiceTo={q.invoiceTo} onSame={onSame} onChange={onDelivery} />
          </div>

          {/* items */}
          <div className="mt-6 flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <span className={`${labelCls} !mb-0 lg:flex-1`}>{s.priceLists.length > 1 ? `Items · ${listName} price` : "Items"}</span>
            {catalog.length === 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/products" className={btnGhost}>
                  Products
                </Link>
                <button className={btnGhost} onClick={() => loadSample()}>
                  Load sample data
                </button>
                <button className={btnGhost} onClick={addTyped}>
                  <IconPlus size={13} /> Typed-in item
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="min-w-0 sm:w-[260px]">
                  <ProductSearch ref={searchRef} priceList={q.priceList} currency={cur$} onAdd={addProduct} onZoom={zoomProduct} />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <button className={`${btnGhost} max-sm:h-11`} onClick={addTyped} title="An item that is not in the product list">
                    <IconPlus size={13} /> Typed-in item
                  </button>
                  <div ref={aiAnchor} className="relative">
                    <button
                      className={`${btnAi} w-full max-sm:h-11 ${assistOpen ? "!border-[var(--q-accent)] shadow-[0_0_0_3px_var(--q-ring)]" : ""}`}
                      aria-expanded={assistOpen}
                      onClick={() => setAssistOpen((o) => !o)}
                    >
                      <IconSparkle size={14} /> Add with AI
                    </button>
                    <Assistant
                      open={assistOpen}
                      anchor={aiAnchor}
                      currency={cur$}
                      onClose={closeAssist}
                      getContext={getContext}
                      onPlan={planActions}
                      onActions={applyActions}
                      onImported={onImported}
                      autoSend={autoSend}
                      onAutoSent={clearAutoSend}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* desktop: the full accounting table */}
          <table className="q-ledger mt-3 hidden lg:table">
            <colgroup>
              <col style={{ width: 36 }} />
              {cols.photo && <col style={{ width: 50 }} />}
              {cols.code && <col style={{ width: 82 }} />}
              <col />
              <col style={{ width: 70 }} />
              {cols.unit && <col style={{ width: 52 }} />}
              <col style={{ width: 98 }} />
              {cols.discount && <col style={{ width: 66 }} />}
              <col style={{ width: 102 }} />
              <col style={{ width: 34 }} />
            </colgroup>
            <thead>
              <tr>
                <th>No.</th>
                {cols.photo && <th>Photo</th>}
                {cols.code && <th>Code</th>}
                <th>Item</th>
                <th className="!text-right">Qty</th>
                {cols.unit && <th>Unit</th>}
                <th className="!text-right">Unit price</th>
                {cols.discount && <th className="!text-right">Disc %</th>}
                <th className="!text-right">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rowProps.map((p) => (
                <LineRow {...p} key={p.key} />
              ))}
              {!hasLines && (
                <tr>
                  <td colSpan={colCount} className="!py-5 text-[13px] text-[var(--q-text-3)]">
                    No items
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* phone: item (with quantity × price under it), amount */}
          <table className="q-ledger mt-3 lg:hidden">
            <colgroup>
              <col />
              <col style={{ width: 86 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Item</th>
                <th className="!text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rowProps.map((p) => (
                <LineRowPhone {...p} key={p.key} />
              ))}
              {!hasLines && (
                <tr>
                  <td colSpan={2} className="!py-5 text-[13px] text-[var(--q-text-3)]">
                    No items
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* terms on the left, totals on the right */}
          <div className="mt-6 flex flex-col-reverse gap-6 lg:flex-row lg:justify-between">
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-[520px]">
              <label className="block">
                <span className={labelCls}>Delivery</span>
                <textarea className={termBox} rows={2} value={q.delivery} onChange={(e) => patch((x) => ({ ...x, delivery: e.target.value }))} />
              </label>
              <label className="block">
                <span className={labelCls}>Payment</span>
                <textarea className={termBox} rows={2} value={q.payment} onChange={(e) => patch((x) => ({ ...x, payment: e.target.value }))} />
              </label>
              <label className="block sm:col-span-2">
                <span className={labelCls}>Notes</span>
                <textarea className={termBox} rows={2} value={q.notes} onChange={(e) => patch((x) => ({ ...x, notes: e.target.value }))} />
              </label>
              {s.quote.bank.trim() && (
                <div className="sm:col-span-2">
                  <span className={labelCls}>Payment details</span>
                  <div className="whitespace-pre-line text-[13px] leading-snug text-[var(--q-text)]">{s.quote.bank}</div>
                </div>
              )}
            </div>
            <div className="flex w-full flex-col gap-2 text-[14px] lg:w-[260px]">
              {hasLines && (
                <div className="text-[12.5px] text-[var(--q-text-3)]">
                  {q.lines.length} item{q.lines.length === 1 ? "" : "s"} · <span className="q-mono">{fmtQty(calc.qty)}</span> qty
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[var(--q-text-3)]">Subtotal</span>
                <span className="q-mono">{fmtMoney(calc.subtotal)}</span>
              </div>
              {showTax && (
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-[var(--q-text-3)]">
                    {s.tax.name || "Tax"}
                    <span className="w-[64px]">
                      <NumberField cell value={q.taxRate} step="0.5" ariaLabel="Tax percent" onCommit={(n) => patch((x) => ({ ...x, taxRate: round3(Math.min(100, n)) }))} />
                    </span>
                    %
                  </span>
                  <span className="q-mono">{fmtMoney(calc.tax)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t-2 border-[var(--q-text)] pt-2.5">
                <b>Total ({cur$})</b>
                <b className="q-mono text-[24px] font-semibold leading-none">{fmtMoney(calc.total)}</b>
              </div>
            </div>
          </div>
          {s.quote.footer.trim() && <div className="mt-8 whitespace-pre-line border-t border-[var(--q-border)] pt-3 text-center text-[12px] text-[var(--q-text-3)]">{s.quote.footer}</div>}
        </article>

        {/* desktop: the glass side panel */}
        <aside className="q-glass sticky top-6 hidden w-[300px] shrink-0 min-[1800px]:w-[330px] flex-col gap-4 rounded-[22px] p-[18px] lg:flex">
          <span className="flex items-center gap-2">
            <StatusChip status={q.status} />
            <SyncText sync={sync} />
          </span>
          <button className={`${btnPrimary} h-11 w-full`} onClick={openSend} disabled={!hasLines}>
            <IconSend /> Send on WhatsApp
          </button>
          {panel}
        </aside>

        {/* phone: the same panel under the paper */}
        <section className="q-glass flex flex-col gap-4 rounded-[18px] p-4 lg:hidden">{panel}</section>
      </div>

      {pendingList && (
        <Modal
          title={`Set all lines to ${priceListName(s, pendingList)}?`}
          onClose={() => setPendingList(null)}
          footer={
            <>
              <button className={btnGhost} onClick={() => setPendingList(null)}>
                Keep as is
              </button>
              <button className={btnPrimary} onClick={() => applyList(pendingList)}>
                Set all lines
              </button>
            </>
          }
        >
          Every product line takes its unit price from the {priceListName(s, pendingList)} list, even lines you set one by one. Lines with no price there keep their number.
        </Modal>
      )}
      {sending && <SendDialog q={q} s={s} files={files} flash={flash} onClose={() => setSending(false)} onSent={() => patch((x) => (x.status === "Sent" ? x : { ...x, status: "Sent" }))} />}
      {toast && <Toast text={toast} />}
      <Lightbox item={big} onClose={closeBig} />
      {showMsg && q.source && (
        <Modal title="Customer's message" onClose={() => setShowMsg(false)}>
          <div className="flex flex-col gap-3">
            {q.source.image && <img src={q.source.image} alt="What the customer sent" className="max-h-[52vh] w-full rounded-[12px] border border-[var(--q-border)] object-contain" />}
            {q.source.text && <div className="whitespace-pre-wrap rounded-[12px] bg-[var(--q-surface-alt)] px-3 py-2.5 text-[13.5px] leading-relaxed text-[var(--q-text)]">{q.source.text}</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}

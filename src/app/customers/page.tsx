"use client";

import { useEffect, useMemo, useState } from "react";
import { deleteCustomer, EMPTY_CUSTOMER, findSaved, saveCustomer, searchCustomers, toCustomer, useCustomers, type SavedCustomer } from "@/lib/customers";
import { useQuotes } from "@/lib/store";
import { cityOf, fmtDate } from "@/lib/quote";
import type { Customer } from "@/lib/types";
import { btnDanger, btnGhost, btnPrimary, card, IconPlus, IconSearch, inputCls, Menu, Modal } from "@/components/ui";
import { CustomerForm } from "@/components/editor/PartyCard";

const COLS = { gridTemplateColumns: "minmax(200px, 1.4fr) minmax(130px, 1fr) 140px minmax(120px, 0.8fr) 90px 130px 44px" };

type Editing = { id?: string; c: Customer };

export default function CustomersPage() {
  const book = useCustomers();
  const quotes = useQuotes();
  const [ready, setReady] = useState(false);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [toDelete, setToDelete] = useState<SavedCustomer | null>(null);
  useEffect(() => setReady(true), []);

  /** how many quotations each customer has, and the latest date, matched by company name */
  const history = useMemo(() => {
    const m = new Map<string, { n: number; last: string }>();
    for (const x of quotes) {
      const k = x.invoiceTo.name.trim().toLowerCase();
      if (!k) continue;
      const h = m.get(k) ?? { n: 0, last: "" };
      h.n++;
      if (x.date > h.last) h.last = x.date;
      m.set(k, h);
    }
    return m;
  }, [quotes]);

  const rows = useMemo(() => searchCustomers(book, q, 500), [book, q]);
  const hist = (c: Customer) => history.get(c.name.trim().toLowerCase());

  const clash = editing && editing.c.name.trim() ? findSaved(book, editing.c.name) : undefined;
  const duplicate = !!clash && clash.id !== editing?.id;

  const menuFor = (c: SavedCustomer) => [
    { label: "Edit", onClick: () => setEditing({ id: c.id, c: toCustomer(c) }) },
    { label: "Delete", onClick: () => setToDelete(c), danger: true },
  ];

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-bold tracking-[-0.5px] text-[var(--q-text)] sm:text-[28px]">Customers</h1>
        <button type="button" className={btnPrimary} onClick={() => setEditing({ c: { ...EMPTY_CUSTOMER } })}>
          <IconPlus size={14} /> New customer
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="q-mono text-[12.5px] text-[var(--q-text-3)]">{ready ? `${rows.length} of ${book.length}` : ""}</span>
        <label className="relative block w-full sm:w-[300px]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--q-text-3)]">
            <IconSearch />
          </span>
          <input type="search" className={`${inputCls} h-10 pl-9`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search name, contact, phone or town" />
        </label>
      </div>

      <div className={`${card} hidden overflow-hidden md:block`}>
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid h-11 items-center border-b border-[var(--q-text)] text-[10.5px] font-bold uppercase tracking-[0.7px] text-[var(--q-text-3)]" style={COLS}>
              <span className="px-4">Company</span>
              <span className="px-4">Contact</span>
              <span className="px-4">Phone</span>
              <span className="px-4">Town</span>
              <span className="px-4 text-right">Quotes</span>
              <span className="px-4">Last quote</span>
              <span />
            </div>
            {ready &&
              rows.map((c) => {
                const h = hist(c);
                return (
                  <div
                    key={c.id}
                    className="grid h-[56px] cursor-pointer items-center border-b border-[var(--q-border)] last:border-0 hover:bg-[var(--q-surface-alt)]"
                    style={COLS}
                    onClick={() => setEditing({ id: c.id, c: toCustomer(c) })}
                  >
                    <span className="flex min-w-0 flex-col px-4 leading-tight">
                      <span className="truncate font-semibold text-[var(--q-text)]">{c.name}</span>
                      <span className="mt-0.5 truncate text-[12.5px] text-[var(--q-text-3)]">{c.email}</span>
                    </span>
                    <span className="truncate px-4 text-[13.5px] text-[var(--q-text)]">{c.contact}</span>
                    <span className="q-mono truncate px-4 text-[12.5px] text-[var(--q-text-2)]">{c.tel}</span>
                    <span className="truncate px-4 text-[13.5px] text-[var(--q-text-2)]">{cityOf(c.address2)}</span>
                    <span className="q-mono px-4 text-right text-[13px] text-[var(--q-text)]">{h?.n ?? 0}</span>
                    <span className="q-mono whitespace-nowrap px-4 text-[12.5px] text-[var(--q-text-2)]">{h ? fmtDate(h.last) : <span className="text-[var(--q-text-3)]">None yet</span>}</span>
                    <span className="flex justify-end pr-2" onClick={(e) => e.stopPropagation()}>
                      <Menu items={menuFor(c)} />
                    </span>
                  </div>
                );
              })}
            {ready && rows.length === 0 && (
              <div className="px-4 py-12 text-center text-[13.5px] text-[var(--q-text-3)]">
                {book.length === 0 ? "No customers yet. Add one, or save one from a quotation." : "Nothing matches."}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 md:hidden">
        {ready &&
          rows.map((c) => {
            const h = hist(c);
            return (
              <article key={c.id} className={`${card} flex cursor-pointer flex-col gap-1.5 p-4`} onClick={() => setEditing({ id: c.id, c: toCustomer(c) })}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-bold text-[var(--q-text)]">{c.name}</div>
                    <div className="truncate text-[12.5px] text-[var(--q-text-3)]">{[c.contact, cityOf(c.address2)].filter(Boolean).join(" · ")}</div>
                  </div>
                  <span onClick={(e) => e.stopPropagation()}>
                    <Menu items={menuFor(c)} />
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="q-mono text-[var(--q-text-2)]">{c.tel}</span>
                  <span className="text-[var(--q-text-3)]">
                    {h ? `${h.n} quote${h.n === 1 ? "" : "s"}, last ${fmtDate(h.last)}` : "No quotes yet"}
                  </span>
                </div>
              </article>
            );
          })}
      </div>

      {editing && (
        <Modal
          title={editing.id ? "Edit customer" : "New customer"}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className={btnGhost} onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                className={btnPrimary}
                disabled={!editing.c.name.trim() || duplicate}
                onClick={() => {
                  saveCustomer(editing.c, editing.id);
                  setEditing(null);
                }}
              >
                Save
              </button>
            </>
          }
        >
          <CustomerForm c={editing.c} onChange={(c) => setEditing({ ...editing, c })} autoFocusName={!editing.id} />
          {duplicate && <p className="mt-2 text-[12.5px] text-[var(--q-danger)]">A customer called {clash?.name} is already saved. Edit that one instead, or change the name.</p>}
          {editing.id && (hist(editing.c)?.n ?? 0) > 0 && (
            <p className="mt-3 text-[12px] text-[var(--q-text-3)]">Changes apply to new quotations. Quotations already made keep the details they were made with.</p>
          )}
        </Modal>
      )}

      {toDelete && (
        <Modal
          title="Delete this customer?"
          onClose={() => setToDelete(null)}
          footer={
            <>
              <button className={btnGhost} onClick={() => setToDelete(null)}>
                Keep
              </button>
              <button
                className={btnDanger}
                onClick={() => {
                  deleteCustomer(toDelete.id);
                  setToDelete(null);
                }}
              >
                Delete
              </button>
            </>
          }
        >
          <span className="font-semibold text-[var(--q-text)]">{toDelete.name}</span> is removed from Customers. Quotations already made for them stay as they are.
        </Modal>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { searchCustomers, useCustomers, type SavedCustomer } from "@/lib/customers";
import { cityOf } from "@/lib/quote";
import { IconPlus, IconSearch, inputCls } from "./ui";

const initials = (name: string) =>
  name
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

/** Search the saved customers by name, contact, phone or town; pick one to fill the quotation, or start a new one.
    The list only shows once something is typed. */
export default function CustomerPicker({ onPick, onNew, autoFocus }: { onPick: (c: SavedCustomer) => void; onNew: (name: string) => void; autoFocus?: boolean }) {
  const book = useCustomers();
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const results = useMemo(() => searchCustomers(book, q, 6), [book, q]);
  useEffect(() => setHi(0), [q]);

  return (
    <div className="flex flex-col gap-2">
      <label className="block">
        <span className="mb-1 block text-[12.5px] font-semibold text-[var(--q-text)]">Find a customer</span>
        <span className="relative block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--q-text-3)]">
            <IconSearch />
          </span>
          <input
            type="search"
            autoFocus={autoFocus}
            autoComplete="off"
            className={`${inputCls} h-10 rounded-[9px] pl-9 text-[13.5px]`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHi((h) => Math.min(h + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHi((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (!q.trim()) return;
                if (results[hi]) onPick(results[hi]);
                else if (q.trim()) onNew(q.trim());
              }
            }}
          />
        </span>
        <span className="mt-1 block text-[11.5px] text-[var(--q-text-3)]">Company name, contact person, phone or town.</span>
      </label>

      {q.trim() && (
        <div className="overflow-hidden rounded-[10px] border border-[var(--q-border)]" role="listbox" aria-label="Saved customers">
          {results.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={i === hi}
              onMouseEnter={() => setHi(i)}
              onClick={() => onPick(c)}
              className={`flex w-full items-center gap-3 border-b border-[var(--q-row)] px-3 py-2 text-left last:border-0 ${i === hi ? "bg-[var(--q-surface-alt)]" : "bg-[var(--q-surface)]"}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--q-avatar-bg)] text-[11px] font-bold text-[var(--q-text-2)]">{initials(c.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-[var(--q-text)]">{c.name}</span>
                <span className="block truncate text-[12px] text-[var(--q-text-3)]">{[c.contact, cityOf(c.address2)].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="q-mono hidden shrink-0 text-[12px] text-[var(--q-text-2)] sm:block">{c.tel}</span>
            </button>
          ))}
          {results.length === 0 && <div className="px-3 py-3 text-[13px] text-[var(--q-text-3)]">No saved customer matches &ldquo;{q.trim()}&rdquo;.</div>}
          <button
            type="button"
            onClick={() => onNew(q.trim())}
            className="flex w-full items-center gap-2 border-t border-[var(--q-border)] bg-[var(--q-surface-alt)] px-3 py-2.5 text-left text-[13px] font-semibold text-[var(--q-text)] hover:bg-[var(--q-chip-bg)]"
          >
            <IconPlus size={13} />
            New customer &ldquo;{q.trim()}&rdquo;
          </button>
        </div>
      )}
    </div>
  );
}

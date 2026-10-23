"use client";

import { forwardRef, useEffect, useMemo, useState } from "react";
import { priceFor, productLabel, searchProducts, useProducts } from "@/lib/products";
import { fmtMoney } from "@/lib/quote";
import type { Product } from "@/lib/types";
import { IconPhoto, IconSearch, inputCls } from "@/components/ui";
import { Thumb } from "@/components/Lightbox";

type Props = {
  priceList: string;
  currency: string;
  onAdd: (p: Product) => void;
  onZoom: (p: Product) => void;
};

/** Type a code or a product word; pick with the arrow keys and Enter, or click. Adds at the quotation's price list;
    a different price for one line is picked from that line's price box in the table. */
const ProductSearch = forwardRef<HTMLInputElement, Props>(function ProductSearch({ priceList, currency, onAdd, onZoom }, ref) {
  const all = useProducts();
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const [focused, setFocused] = useState(false);
  const results = useMemo(() => searchProducts(all, query, 8), [all, query]);
  useEffect(() => setHi(0), [query]);
  const open = focused && query.trim().length > 0;

  function pick(p: Product) {
    onAdd(p);
    setQuery("");
  }

  return (
    <div className="relative">
      <label className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--q-text-3)]">
          <IconSearch />
        </span>
        <input
          ref={ref}
          className={`${inputCls} h-10 pl-9 pr-3`}
          value={query}
          autoComplete="off"
          aria-label="Search products"
          aria-expanded={open}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHi((h) => Math.min(h + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && results[hi]) {
              e.preventDefault();
              pick(results[hi]);
            } else if (e.key === "Escape") {
              setQuery("");
            }
          }}
        />
        {!query && <span className="pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-[var(--q-text-3)]">Add item</span>}
      </label>

      {open && (
        <div className="q-popover q-pop absolute left-0 top-full z-30 mt-1 max-h-[min(60vh,440px)] w-[min(460px,calc(100vw-40px))] overflow-y-auto overflow-x-hidden rounded-[12px]">
          {results.length === 0 && <div className="px-3 py-3 text-[12.5px] text-[var(--q-text-3)]">{all.length ? "No product matches." : "No products yet. Add them on the Products page."}</div>}
          {results.map((p, idx) => {
            const price = priceFor(p, priceList);
            const on = idx === hi;
            return (
              <div key={p.id} className={on ? "bg-[var(--q-surface-alt)]" : ""} onMouseEnter={() => setHi(idx)}>
                <div className="flex w-full items-center gap-3 px-3 py-2">
                  {p.photo ? (
                    <Thumb src={p.photo} alt={productLabel(p)} w={40} h={40} onOpen={() => onZoom(p)} />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-dashed border-[var(--q-border-strong)] text-[var(--q-text-3)]">
                      <IconPhoto size={14} />
                    </span>
                  )}
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-[var(--q-text)]">{productLabel(p)}</span>
                      <span className="block truncate text-[11.5px] text-[var(--q-text-3)]">{[p.category, p.unit].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="q-mono shrink-0 text-[13px] text-[var(--q-text)]">{price === null ? <span className="text-[var(--q-text-3)]">no price</span> : `${currency} ${fmtMoney(price)}`}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default ProductSearch;

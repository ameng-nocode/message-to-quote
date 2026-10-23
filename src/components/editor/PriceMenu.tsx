"use client";

import { priceFor } from "@/lib/products";
import { fmtMoney } from "@/lib/quote";
import type { LinePrice, PriceList, Product } from "@/lib/types";

/** The price lists for one product, shown under its price box. Click a row to take that price. */
export default function PriceMenu({ product, priceLists, current, onPick }: { product: Product; priceLists: PriceList[]; current: LinePrice; onPick: (listId: string) => void }) {
  return (
    <div className="q-popover q-pop absolute right-0 top-full z-20 mt-1 w-[224px] overflow-hidden rounded-[12px]">
      <div className="px-3 pb-1 pt-2.5 text-[10.5px] font-bold uppercase tracking-[0.9px] text-[var(--q-text-3)]">Price list</div>
      {priceLists.map((l) => {
        const v = priceFor(product, l.id);
        const on = current === l.id;
        return (
          <button
            key={l.id}
            type="button"
            disabled={v === null}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(l.id)}
            className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] hover:bg-[var(--q-surface-alt)] disabled:opacity-50 ${on ? "font-semibold text-[var(--q-accent)]" : "text-[var(--q-text-2)]"}`}
          >
            <span className="min-w-0 truncate">{l.name}</span>
            <span className="q-mono shrink-0">{v === null ? "no price" : fmtMoney(v)}</span>
          </button>
        );
      })}
      <div className="border-t border-[var(--q-border)] px-3 py-2 text-[12px] text-[var(--q-text-3)]">Or type your own price.</div>
    </div>
  );
}

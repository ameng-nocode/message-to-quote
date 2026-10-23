"use client";

import { memo, useRef, useState } from "react";
import { fmtMoney } from "@/lib/quote";
import type { QuoteColumns } from "@/lib/settings";
import { savePicture } from "@/lib/files";
import { imageFiles } from "@/lib/image";
import { CUSTOM_PRICE, type PriceList, type Product, type QuoteLine } from "@/lib/types";
import { IconPhoto, IconPlus, IconX } from "@/components/ui";
import { Thumb } from "@/components/Lightbox";
import { Spinner } from "@/components/NewQuoteButton";
import NumberField from "./NumberField";
import PriceMenu from "./PriceMenu";

export type LineRowProps = {
  index: number;
  line: QuoteLine;
  product: Product | undefined; // the live product, for its price lists; undefined for a typed-in item or a deleted product
  amount: number;
  priceLists: PriceList[];
  quoteList: string; // the quotation price list: a line on another list (or a typed price) says so under its price
  cols: QuoteColumns; // which optional columns the paper shows (Settings, or the side panel)
  onChange: (lineId: string, fields: Partial<QuoteLine>) => void;
  onPrice: (lineId: string, price: number) => void;
  onPickList: (lineId: string, listId: string) => void;
  onRemove: (lineId: string) => void;
  onZoom: (line: QuoteLine) => void;
};

const cellText = "q-cell w-full px-1.5 py-[5px] text-[13px] text-[var(--q-text)]";
/** Typed-in cells are not log-in fields: keep browser autofill and password-manager buttons out of them. */
const noFill = { autoComplete: "off", "data-lpignore": "true", "data-1p-ignore": "true", "data-bwignore": "true", "data-form-type": "other" } as const;

function PriceBox({ line, product, priceLists, quoteList, onPrice, onPickList }: Pick<LineRowProps, "line" | "product" | "priceLists" | "quoteList" | "onPrice" | "onPickList">) {
  const [open, setOpen] = useState(false);
  const from = line.priceList === CUSTOM_PRICE ? "typed" : (priceLists.find((l) => l.id === line.priceList)?.name ?? "typed");
  return (
    <div className="relative">
      <NumberField
        cell
        value={line.unitPrice}
        step="0.01"
        format={(n) => n.toFixed(2)}
        ariaLabel="Unit price"
        onCommit={(n) => onPrice(line.id, n)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {priceLists.length > 1 && line.productId !== null && line.priceList !== quoteList && <div className="mt-0.5 truncate text-right text-[10.5px] text-[var(--q-text-3)]">{from}</div>}
      {open && product && priceLists.length > 1 && (
        <PriceMenu
          product={product}
          priceLists={priceLists}
          current={line.priceList}
          onPick={(id) => {
            onPickList(line.id, id);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** Name and variant of the line (and the code, when the paper has no Code column). A typed-in item is written right here. */
function ItemCell({ line, cols, onChange }: Pick<LineRowProps, "line" | "cols" | "onChange">) {
  if (line.productId === null) {
    return (
      <div className="flex flex-col gap-1">
        <input {...noFill} className={`${cellText} font-medium`} value={line.name} aria-label="Item name" autoFocus={!line.name} onChange={(e) => onChange(line.id, { name: e.target.value })} />
        <div className={`grid gap-1 ${cols.unit ? "grid-cols-1" : "grid-cols-[1fr_64px]"}`}>
          <input {...noFill} className={`${cellText} text-[12px]`} value={line.variant} aria-label="Details" onChange={(e) => onChange(line.id, { variant: e.target.value })} />
          {!cols.unit && <input {...noFill} className={`${cellText} text-[12px]`} value={line.unit} aria-label="Unit" onChange={(e) => onChange(line.id, { unit: e.target.value })} />}
        </div>
      </div>
    );
  }
  const sub = [!cols.code && line.code, line.variant].filter(Boolean).join(" · ");
  return (
    <>
      <div className="text-[13px] font-medium leading-snug text-[var(--q-text)] break-words">{line.name}</div>
      {sub && <div className="mt-0.5 text-[12px] leading-snug text-[var(--q-text-3)] break-words">{sub}</div>}
    </>
  );
}

/** The picture cell. A product line shows the product's photo; a typed-in line takes a picture of its own (add, zoom, remove). */
function Pic({ line, size, onZoom, onChange }: { line: QuoteLine; size: number; onZoom: (l: QuoteLine) => void; onChange: LineRowProps["onChange"] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (line.productId !== null) {
    if (line.photo) return <Thumb src={line.photo} alt={line.name} w={size} h={size} onOpen={() => onZoom(line)} />;
    return (
      <span className="flex shrink-0 items-center justify-center rounded-[6px] border border-dashed border-[var(--q-border-strong)] text-[var(--q-text-3)]" style={{ width: size, height: size }}>
        <IconPhoto size={13} />
      </span>
    );
  }
  return (
    <span className="relative block shrink-0" style={{ width: size, height: size }}>
      {line.photo ? (
        <>
          <Thumb src={line.photo} alt={line.name} w={size} h={size} onOpen={() => onZoom(line)} />
          <button
            type="button"
            onClick={() => onChange(line.id, { photo: "" })}
            aria-label="Remove picture"
            className="absolute -right-1.5 -top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[var(--q-text)] text-white"
          >
            <IconX size={9} />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label="Add a picture"
          title="Add a picture"
          className="flex h-full w-full items-center justify-center rounded-[6px] border border-dashed border-[var(--q-ai-border)] bg-[var(--q-accent-soft)] text-[var(--q-accent)] hover:border-[var(--q-accent)]"
        >
          {busy ? <Spinner size={13} /> : <IconPlus size={13} />}
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = imageFiles(e.target.files)[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            onChange(line.id, { photo: await savePicture(f, "product") });
          } finally {
            setBusy(false);
          }
        }}
      />
    </span>
  );
}

function RemoveBtn({ line, onRemove }: Pick<LineRowProps, "line" | "onRemove">) {
  return (
    <button onClick={() => onRemove(line.id)} className="flex h-7 w-7 items-center justify-center rounded-[8px] text-[var(--q-text-3)] hover:bg-[var(--q-danger-bg)] hover:text-[var(--q-danger)]" aria-label="Remove line">
      <IconX />
    </button>
  );
}

/** One line of the quotation on the paper, computer width. Re-renders only when its own numbers change. */
export const LineRow = memo(function LineRow(p: LineRowProps) {
  const { index, line, amount, cols, onChange, onRemove, onZoom } = p;
  const typed = line.productId === null;
  return (
    <tr>
      <td className="q-mono text-[12px] text-[var(--q-text-3)]">{index + 1}</td>
      {cols.photo && (
        <td>
          <Pic line={line} size={34} onZoom={onZoom} onChange={onChange} />
        </td>
      )}
      {cols.code && (
        <td className="q-mono text-[12.5px] break-all">
          {typed ? <input {...noFill} className={`${cellText} q-mono text-[12px]`} value={line.code} aria-label="Code" onChange={(e) => onChange(line.id, { code: e.target.value })} /> : line.code}
        </td>
      )}
      <td>
        <ItemCell line={line} cols={cols} onChange={onChange} />
      </td>
      <td>
        <NumberField cell value={line.qty} ariaLabel="Quantity" onCommit={(n) => onChange(line.id, { qty: n })} />
      </td>
      {cols.unit && (
        <td className="text-[12.5px] text-[var(--q-text-3)]">
          {typed ? <input {...noFill} className={`${cellText} text-[12px]`} value={line.unit} aria-label="Unit" onChange={(e) => onChange(line.id, { unit: e.target.value })} /> : line.unit}
        </td>
      )}
      <td>
        <PriceBox line={line} product={p.product} priceLists={p.priceLists} quoteList={p.quoteList} onPrice={p.onPrice} onPickList={p.onPickList} />
      </td>
      {cols.discount && (
        <td>
          <NumberField cell value={line.discount} step="0.5" ariaLabel="Discount percent" onCommit={(n) => onChange(line.id, { discount: Math.min(100, n) })} />
        </td>
      )}
      <td className="q-mono text-right text-[13px] font-semibold text-[var(--q-text)]">{fmtMoney(amount)}</td>
      <td className="!px-1 text-center">
        <RemoveBtn line={line} onRemove={onRemove} />
      </td>
    </tr>
  );
});

/** The same line on a phone: the item on top, then quantity × price on one line; the amount on the right. */
export const LineRowPhone = memo(function LineRowPhone(p: LineRowProps) {
  const { line, amount, cols, onChange, onRemove, onZoom } = p;
  return (
    <tr>
      <td className="!align-top">
        <div className="flex gap-2.5">
          {cols.photo && <Pic line={line} size={36} onZoom={onZoom} onChange={onChange} />}
          <div className="min-w-0 flex-1">
            <ItemCell line={line} cols={{ ...cols, code: false, unit: false }} onChange={onChange} />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="w-[54px]">
            <NumberField cell value={line.qty} ariaLabel="Quantity" onCommit={(n) => onChange(line.id, { qty: n })} />
          </span>
          <span className="text-[12px] text-[var(--q-text-3)]">{line.unit ? `${line.unit} ×` : "×"}</span>
          <span className="w-[84px]">
            <PriceBox line={line} product={p.product} priceLists={p.priceLists} quoteList={p.quoteList} onPrice={p.onPrice} onPickList={p.onPickList} />
          </span>
          {cols.discount && (
            <span className="flex items-center gap-1">
              <span className="w-[56px]">
                <NumberField cell value={line.discount} step="0.5" ariaLabel="Discount percent" onCommit={(n) => onChange(line.id, { discount: Math.min(100, n) })} />
              </span>
              <span className="text-[12px] text-[var(--q-text-3)]">% off</span>
            </span>
          )}
        </div>
      </td>
      <td className="!align-top text-right">
        <div className="q-mono pt-0.5 text-[13.5px] font-semibold text-[var(--q-text)]">{fmtMoney(amount)}</div>
        <div className="mt-1 flex justify-end">
          <RemoveBtn line={line} onRemove={onRemove} />
        </div>
      </td>
    </tr>
  );
});

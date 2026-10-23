"use client";

import { useMemo, useRef, useState } from "react";
import { categoriesOf, EMPTY_PRODUCT, productLabel, products, saveProduct, searchProducts, useProducts } from "@/lib/products";
import { fmtMoney } from "@/lib/quote";
import { saveSettings, useSettings, type Settings } from "@/lib/settings";
import { savePicture } from "@/lib/files";
import { imageFiles } from "@/lib/image";
import { loadSample } from "@/lib/sample";
import { downloadTemplate, exportProducts, parsePrice, planImport, type ImportPlan } from "@/lib/productFile";
import type { Product } from "@/lib/types";
import { btnDanger, btnGhost, btnPrimary, card, Field, IconDownload, IconPhoto, IconPlus, IconSearch, IconUpload, inputCls, Menu, Modal, thCls, Toast } from "@/components/ui";
import Lightbox, { Thumb, type LightboxItem } from "@/components/Lightbox";

type Draft = Omit<Product, "id" | "createdAt" | "updatedAt"> & { id?: string; createdAt?: string };
const UNITS = ["pcs", "unit", "set", "box", "carton", "pack", "kg", "m", "hour", "day", "job"];

/** A price box that accepts "1,299.00" and keeps what is typed until the box is left. */
function PriceInput({ value, onChange, label }: { value: number | undefined; onChange: (v: number | undefined) => void; label: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      inputMode="decimal"
      aria-label={label}
      className={`${inputCls} q-mono text-right`}
      value={text ?? (value === undefined ? "" : value.toFixed(2))}
      onChange={(e) => {
        setText(e.target.value);
        const v = parsePrice(e.target.value);
        onChange(e.target.value.trim() === "" ? undefined : (v ?? undefined));
      }}
      onBlur={() => setText(null)}
    />
  );
}

function ProductForm({ d, setD, lists, cats }: { d: Draft; setD: (d: Draft) => void; lists: Settings["priceLists"]; cats: string[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {d.photo ? (
          <img src={d.photo} alt="" className="h-[72px] w-[72px] rounded-[10px] border border-[var(--q-border)] object-cover" />
        ) : (
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[10px] border border-dashed border-[var(--q-border-strong)] text-[var(--q-text-3)]">
            <IconPhoto size={20} />
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${btnGhost} h-9`} disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "Uploading" : d.photo ? "Change photo" : "Add photo"}
          </button>
          {d.photo && (
            <button type="button" className={`${btnGhost} h-9`} onClick={() => setD({ ...d, photo: "" })}>
              Remove
            </button>
          )}
        </div>
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
              setD({ ...d, photo: await savePicture(f, "product") });
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
      <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Name">
            <input className={inputCls} autoFocus={!d.id} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          </Field>
        </div>
        <Field label="Code (SKU)">
          <input className={`${inputCls} q-mono`} value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })} />
        </Field>
        <Field label="Variant" hint="Colour, size or flavour">
          <input className={inputCls} value={d.variant} onChange={(e) => setD({ ...d, variant: e.target.value })} />
        </Field>
        <Field label="Category">
          <input className={inputCls} list="q-cats" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} />
          <datalist id="q-cats">
            {cats.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Unit">
          <input className={inputCls} list="q-units" value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })} />
          <datalist id="q-units">
            {UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3">
        {lists.map((l, i) => (
          <Field key={l.id} label={i === 0 ? `${l.name} price` : l.name}>
            <PriceInput
              label={`${l.name} price`}
              value={i === 0 ? d.price : d.prices[l.id]}
              onChange={(v) => {
                if (i === 0) return setD({ ...d, price: v ?? 0 });
                const prices = { ...d.prices };
                if (v === undefined) delete prices[l.id];
                else prices[l.id] = v;
                setD({ ...d, prices });
              }}
            />
          </Field>
        ))}
      </div>
      <Field label="Description" hint="Shown to the AI to tell products apart. Not printed.">
        <textarea className={`${inputCls} min-h-[60px] resize-y`} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
      </Field>
    </div>
  );
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const s = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const counts = plan ? { new: plan.rows.filter((r) => r.status === "new").length, update: plan.rows.filter((r) => r.status === "update").length, error: plan.rows.filter((r) => r.status === "error").length } : null;
  const good = plan ? plan.rows.filter((r) => r.product) : [];

  return (
    <Modal
      wide
      title="Import products"
      onClose={onClose}
      footer={
        <>
          <button className={btnGhost} onClick={onClose}>
            Cancel
          </button>
          {plan && (
            <button
              className={btnPrimary}
              disabled={!good.length}
              onClick={() => {
                if (plan.newLists.length) saveSettings((x) => ({ ...x, priceLists: plan.priceLists }));
                products.putMany(good.map((r) => r.product!));
                onDone(`${good.length} products imported`);
              }}
            >
              Import {good.length} product{good.length === 1 ? "" : "s"}
            </button>
          )}
        </>
      }
    >
      {!plan && (
        <div className="flex flex-col gap-3">
          <p>
            An Excel (.xlsx) or CSV file, one product per row. Columns: <span className="q-mono text-[var(--q-text)]">code, name, variant, category, unit, price</span>, one column per price list, <span className="q-mono text-[var(--q-text)]">description, photo</span>. Only name and price are needed.
          </p>
          <p>A product already in the list (same code and variant, or same name when there is no code) is updated, not added twice. A price column with a new name becomes a new price list.</p>
          <div className="flex flex-wrap gap-2">
            <button className={btnPrimary} disabled={busy} onClick={() => fileRef.current?.click()}>
              <IconUpload /> {busy ? "Reading" : "Choose file"}
            </button>
            <button className={btnGhost} onClick={() => downloadTemplate(s)}>
              <IconDownload /> Template
            </button>
          </div>
          {err && <p className="text-[var(--q-danger)]">{err}</p>}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setErr("");
              setBusy(true);
              try {
                setPlan(await planImport(f, products.all(), s));
              } catch (x) {
                setErr(x instanceof Error ? x.message : "Could not read this file.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
      )}
      {plan && counts && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 text-[12.5px]">
            <span className="rounded-full bg-[var(--q-ok-soft)] px-2.5 py-1 font-semibold text-[var(--q-ok)]">{counts.new} new</span>
            <span className="rounded-full bg-[var(--q-chip-bg)] px-2.5 py-1 font-semibold text-[var(--q-text-2)]">{counts.update} updated</span>
            {counts.error > 0 && <span className="rounded-full bg-[var(--q-danger-bg)] px-2.5 py-1 font-semibold text-[var(--q-danger)]">{counts.error} skipped</span>}
          </div>
          {plan.newLists.length > 0 && <p>New price lists: <span className="font-semibold text-[var(--q-text)]">{plan.newLists.join(", ")}</span></p>}
          {plan.ignored.length > 0 && <p>Columns not used: {plan.ignored.join(", ")}</p>}
          <div className="max-h-[46vh] overflow-auto rounded-[12px] border border-[var(--q-border)]">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 border-b border-[var(--q-text)] bg-white">
                <tr>
                  <th className={thCls}>Row</th>
                  <th className={thCls}>Product</th>
                  <th className={`${thCls} text-right`}>{s.priceLists[0].name}</th>
                  <th className={thCls}></th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.slice(0, 300).map((r) => (
                  <tr key={r.line} className="border-t border-[var(--q-row)]">
                    <td className="px-3 py-1.5 q-mono text-[var(--q-text-3)]">{r.line}</td>
                    <td className="px-3 py-1.5 text-[var(--q-text)]">{r.product ? productLabel(r.product) : <span className="text-[var(--q-text-3)]">-</span>}</td>
                    <td className="px-3 py-1.5 text-right q-mono">{r.product ? fmtMoney(r.product.price) : ""}</td>
                    <td className={`px-3 py-1.5 text-[11.5px] font-semibold ${r.status === "error" ? "text-[var(--q-danger)]" : r.status === "new" ? "text-[var(--q-ok)]" : "text-[var(--q-text-3)]"}`}>
                      {r.status === "error" ? r.error : r.status === "new" ? "New" : "Update"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {plan.rows.length > 300 && <p>Showing the first 300 of {plan.rows.length} rows.</p>}
          <button className={`${btnGhost} h-9 self-start`} onClick={() => setPlan(null)}>
            Choose another file
          </button>
        </div>
      )}
    </Modal>
  );
}

export default function ProductsPage() {
  const all = useProducts();
  const s = useSettings();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("All");
  const [big, setBig] = useState<LightboxItem | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [toDelete, setToDelete] = useState<Product | null>(null);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState("");
  const cats = useMemo(() => categoriesOf(all), [all]);
  const rows = useMemo(() => {
    const base = q.trim() ? searchProducts(all, q, 5000) : [...all].sort((a, b) => a.category.localeCompare(b.category) || productLabel(a).localeCompare(productLabel(b)));
    return cat === "All" ? base : base.filter((p) => p.category === cat);
  }, [all, q, cat]);
  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(""), 2200);
  };
  const lists = s.priceLists;
  const menuFor = (p: Product) => [
    { label: "Edit", onClick: () => setEditing({ ...p }) },
    { label: "Duplicate", onClick: () => setEditing({ ...p, id: undefined, createdAt: undefined, sample: undefined, variant: p.variant ? `${p.variant} copy` : "copy" }) },
    { label: "Delete", onClick: () => setToDelete(p), danger: true },
  ];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-bold tracking-[-0.5px] text-[var(--q-text)] sm:text-[28px]">Products</h1>
        <div className="flex flex-wrap gap-2">
          <button className={btnGhost} onClick={() => setImporting(true)}>
            <IconUpload /> Import
          </button>
          {all.length > 0 && (
            <button className={btnGhost} onClick={() => exportProducts(rows, s)}>
              <IconDownload /> Export
            </button>
          )}
          <button className={btnPrimary} onClick={() => setEditing({ ...EMPTY_PRODUCT, category: cat === "All" ? "" : cat })}>
            <IconPlus size={14} /> New product
          </button>
        </div>
      </div>

      {all.length === 0 ? (
        <section className={`${card} flex flex-col items-start gap-3 p-6`}>
          <h2 className="text-[17px] font-bold text-[var(--q-text)]">No products yet</h2>
          <div className="flex flex-wrap gap-2">
            <button className={btnPrimary} onClick={() => setEditing({ ...EMPTY_PRODUCT })}>
              <IconPlus size={14} /> New product
            </button>
            <button className={btnGhost} onClick={() => setImporting(true)}>
              <IconUpload /> Import Excel or CSV
            </button>
            <button className={btnGhost} onClick={() => loadSample()}>
              Load sample data
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {["All", ...cats].map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`inline-flex min-h-8 max-w-full items-center whitespace-normal break-words rounded-full border px-3 py-1 text-[13px] font-semibold ${
                    cat === c ? "q-pri border-transparent text-white shadow-none" : "border-[var(--q-border-strong)] bg-[var(--q-surface)] text-[var(--q-text-2)] hover:border-[var(--q-ai-border)] hover:text-[var(--q-text)]"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <label className="relative block w-full shrink-0 sm:w-[300px]">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--q-text-3)]">
                <IconSearch />
              </span>
              <input type="search" className={`${inputCls} h-10 pl-9`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search code, name or variant" />
            </label>
          </div>

          <div className={`${card} overflow-x-auto`}>
            <table className="w-full text-[13px]" style={{ minWidth: 640 + lists.length * 110 }}>
              <thead className="border-b border-[var(--q-text)]">
                <tr>
                  <th className={`${thCls} w-[64px]`}>Photo</th>
                  <th className={thCls}>Product</th>
                  <th className={thCls}>Category</th>
                  <th className={thCls}>Unit</th>
                  {lists.map((l) => (
                    <th key={l.id} className={`${thCls} text-right`}>
                      {l.name} ({s.currency})
                    </th>
                  ))}
                  <th className={`${thCls} w-[44px]`}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="cursor-pointer border-b border-[var(--q-border)] last:border-0 hover:bg-[var(--q-surface-alt)]" onClick={() => setEditing({ ...p })}>
                    <td className="px-3 py-1.5">
                      {p.photo ? (
                        <Thumb src={p.photo} alt={productLabel(p)} w={44} h={44} onOpen={() => setBig({ src: p.photo, title: productLabel(p), sub: p.description })} />
                      ) : (
                        <span className="flex h-11 w-11 items-center justify-center rounded border border-dashed border-[var(--q-border-strong)] text-[var(--q-text-3)]">
                          <IconPhoto size={14} />
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="font-semibold text-[var(--q-text)]">{p.name}</div>
                      <div className="text-[11.5px] text-[var(--q-text-3)]">
                        <span className="q-mono">{p.code}</span>
                        {p.code && p.variant ? " · " : ""}
                        {p.variant}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-[var(--q-text-2)]">{p.category}</td>
                    <td className="px-3 py-1.5 text-[var(--q-text-2)]">{p.unit}</td>
                    {lists.map((l, i) => {
                      const v = i === 0 ? p.price : p.prices[l.id];
                      return (
                        <td key={l.id} className="px-3 py-1.5 text-right q-mono text-[var(--q-text)]">
                          {typeof v === "number" ? fmtMoney(v) : <span className="text-[var(--q-text-3)]">-</span>}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <Menu items={menuFor(p)} />
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5 + lists.length} className="px-3 py-10 text-center text-[var(--q-text-3)]">
                      Nothing matches.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <span className="q-mono text-[12px] text-[var(--q-text-3)]">
            {rows.length} of {all.length}
          </span>
        </>
      )}

      {editing && (
        <Modal
          wide
          title={editing.id ? "Edit product" : "New product"}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className={btnGhost} onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                className={btnPrimary}
                disabled={!editing.name.trim()}
                onClick={() => {
                  saveProduct({ ...editing, name: editing.name.trim(), code: editing.code.trim(), variant: editing.variant.trim(), category: editing.category.trim(), unit: editing.unit.trim() });
                  setEditing(null);
                  flash(editing.id ? "Product saved" : "Product added");
                }}
              >
                Save
              </button>
            </>
          }
        >
          <ProductForm d={editing} setD={setEditing} lists={lists} cats={cats} />
        </Modal>
      )}

      {toDelete && (
        <Modal
          title="Delete this product?"
          onClose={() => setToDelete(null)}
          footer={
            <>
              <button className={btnGhost} onClick={() => setToDelete(null)}>
                Keep
              </button>
              <button
                className={btnDanger}
                onClick={() => {
                  products.remove(toDelete.id);
                  setToDelete(null);
                }}
              >
                Delete
              </button>
            </>
          }
        >
          <span className="font-semibold text-[var(--q-text)]">{productLabel(toDelete)}</span> is removed from Products. Quotations already made keep their lines.
        </Modal>
      )}

      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onDone={(m) => {
            setImporting(false);
            flash(m);
          }}
        />
      )}
      {toast && <Toast text={toast} />}
      <Lightbox item={big} onClose={() => setBig(null)} />
    </div>
  );
}

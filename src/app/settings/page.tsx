"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { uid, useSyncState } from "@/lib/collection";
import { saveSettings, useSettings, WA_FIELDS, type QuoteColumns, type Settings } from "@/lib/settings";
import { dropPriceList, useProducts } from "@/lib/products";
import { useQuotes } from "@/lib/store";
import { round3 } from "@/lib/quote";
import { savePicture } from "@/lib/files";
import { imageFiles } from "@/lib/image";
import { hasSample, loadSample, removeSample } from "@/lib/sample";
import { STANDARD_LIST } from "@/lib/types";
import { btnDanger, btnGhost, btnLink, card, Field, IconCheck, IconPlus, IconX, inputCls, labelCls, Modal, Switch } from "@/components/ui";
import NumberField from "@/components/editor/NumberField";
import TeamSection from "@/components/TeamSection";
import { SUPABASE_ON } from "@/lib/supabase";

const SECTIONS = [
  { id: "company", label: "Company" },
  { id: "quotation", label: "Quotation" },
  { id: "prices", label: "Price lists" },
  { id: "whatsapp", label: "WhatsApp" },
  ...(SUPABASE_ON ? [{ id: "team", label: "Team" }] : []),
  { id: "data", label: SUPABASE_ON ? "Sample data" : "Data" },
];

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`${card} scroll-mt-6 p-5 sm:p-6`}>
      <h2 className="text-[16px] font-bold text-[var(--q-text)]">{title}</h2>
      {hint && <p className="mt-1 text-[13px] text-[var(--q-text-3)]">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const area = `${inputCls} min-h-[72px] resize-y`;

export default function SettingsPage() {
  const s = useSettings();
  const sync = useSyncState();
  const catalog = useProducts();
  const quotes = useQuotes();
  const logoRef = useRef<HTMLInputElement>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [newList, setNewList] = useState("");
  const [dropList, setDropList] = useState<{ id: string; name: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const set = (fn: (x: Settings) => Settings) => saveSettings(fn);
  const company = (patch: Partial<Settings["company"]>) => set((x) => ({ ...x, company: { ...x.company, ...patch } }));
  const quote = (patch: Partial<Settings["quote"]>) => set((x) => ({ ...x, quote: { ...x.quote, ...patch } }));
  const cols = (patch: Partial<QuoteColumns>) => set((x) => ({ ...x, quote: { ...x.quote, columns: { ...x.quote.columns, ...patch } } }));
  const tax = (patch: Partial<Settings["tax"]>) => set((x) => ({ ...x, tax: { ...x.tax, ...patch } }));
  const wa = (patch: Partial<Settings["whatsapp"]>) => set((x) => ({ ...x, whatsapp: { ...x.whatsapp, ...patch } }));
  const used = (listId: string) => catalog.filter((p) => listId in p.prices).length;
  const sample = hasSample();
  const latest = [...quotes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 lg:flex-row lg:items-start">
      <nav aria-label="Settings sections" className="flex shrink-0 gap-1 overflow-x-auto lg:sticky lg:top-6 lg:w-[190px] lg:flex-col">
        <h1 className="mr-3 self-center text-[22px] font-bold tracking-[-0.5px] text-[var(--q-text)] lg:mb-3 lg:mr-0 lg:self-start lg:text-[28px]">Settings</h1>
        {SECTIONS.map((x) => (
          <a key={x.id} href={`#${x.id}`} className="whitespace-nowrap rounded-[10px] px-3 py-2 text-[14px] font-semibold text-[var(--q-nav-text)] hover:bg-white/80 hover:text-[var(--q-accent)]">
            {x.label}
          </a>
        ))}
        <span className={`mt-2 hidden items-center gap-1 px-3 text-[12px] lg:inline-flex ${sync === "error" ? "font-semibold text-[var(--q-danger)]" : "text-[var(--q-text-3)]"}`}>
          {sync === "saved" ? (
            <>
              <IconCheck size={12} /> Saved
            </>
          ) : sync === "saving" ? (
            "Saving"
          ) : (
            "Not saved"
          )}
        </span>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <Section id="company" title="Company">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              {s.company.logo ? (
                <img src={s.company.logo} alt="Logo" className="h-16 max-w-[160px] rounded-[8px] border border-[var(--q-border)] bg-white object-contain p-1" />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-[12px] border-[1.5px] border-dashed border-[var(--q-ai-border)] bg-[var(--q-accent-soft)] text-[11.5px] font-bold text-[var(--q-text-3)]">Logo</span>
              )}
              <div className="flex flex-wrap gap-2">
                <button className={`${btnGhost} h-9`} disabled={logoBusy} onClick={() => logoRef.current?.click()}>
                  {logoBusy ? "Uploading" : s.company.logo ? "Change logo" : "Upload logo"}
                </button>
                {s.company.logo && (
                  <button className={`${btnGhost} h-9`} onClick={() => company({ logo: "" })}>
                    Remove
                  </button>
                )}
              </div>
              <input
                ref={logoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = imageFiles(e.target.files)[0];
                  e.target.value = "";
                  if (!f) return;
                  setLogoBusy(true);
                  try {
                    company({ logo: await savePicture(f, "logo") });
                  } finally {
                    setLogoBusy(false);
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Company name">
                  <input className={inputCls} value={s.company.name} onChange={(e) => company({ name: e.target.value })} />
                </Field>
              </div>
              <Field label="Company no">
                <input className={inputCls} value={s.company.regNo} onChange={(e) => company({ regNo: e.target.value })} />
              </Field>
              <Field label="Phone">
                <input className={inputCls} type="tel" value={s.company.phone} onChange={(e) => company({ phone: e.target.value })} />
              </Field>
              <Field label="Email">
                <input className={inputCls} type="email" value={s.company.email} onChange={(e) => company({ email: e.target.value })} />
              </Field>
              <Field label="Website">
                <input className={inputCls} value={s.company.website} onChange={(e) => company({ website: e.target.value })} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Address">
                  <textarea className={area} value={s.company.address} onChange={(e) => company({ address: e.target.value })} />
                </Field>
              </div>
            </div>
          </div>
        </Section>

        <Section id="quotation" title="Quotation">
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-4">
              <Field label="Title">
                <input className={inputCls} value={s.quote.title} onChange={(e) => quote({ title: e.target.value })} />
              </Field>
              <Field label="Number prefix" hint={`${(s.quote.prefix || "QT").toUpperCase()}-ABC-2610-01`}>
                <input className={`${inputCls} q-mono`} value={s.quote.prefix} onChange={(e) => quote({ prefix: e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) })} />
              </Field>
              <Field label="Currency">
                <input className={inputCls} value={s.currency} onChange={(e) => set((x) => ({ ...x, currency: e.target.value.slice(0, 6) }))} />
              </Field>
              <Field label="Valid (days)">
                <NumberField value={s.quote.validDays} ariaLabel="Valid for how many days" onCommit={(n) => quote({ validDays: Math.round(n) })} />
              </Field>
            </div>

            <div>
              <span className={labelCls}>Columns on the paper</span>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-[var(--q-text)]">
                {(
                  [
                    ["photo", "Photo"],
                    ["code", "Code"],
                    ["unit", "Unit"],
                    ["discount", "Discount"],
                  ] as [keyof QuoteColumns, string][]
                ).map(([k, label]) => (
                  <span key={k} className="flex items-center gap-2.5">
                    <Switch label={`${label} column`} on={s.quote.columns[k]} onChange={(v) => cols({ [k]: v })} />
                    {label}
                  </span>
                ))}
              </div>
              <span className="mt-1.5 block text-[12px] text-[var(--q-text-3)]">Item, quantity, unit price and amount always show.</span>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-4">
              <span className="col-span-2 flex items-center gap-2.5 self-end pb-2.5 text-[13.5px] text-[var(--q-text)] sm:col-span-2">
                <Switch label="Add tax to new quotations" on={s.tax.enabled} onChange={(v) => tax({ enabled: v })} />
                Add tax to new quotations
              </span>
              <Field label="Tax name">
                <input className={inputCls} disabled={!s.tax.enabled} value={s.tax.name} onChange={(e) => tax({ name: e.target.value })} />
              </Field>
              <Field label="Rate %">
                <NumberField value={s.tax.rate} step="0.5" ariaLabel="Tax rate" onCommit={(n) => tax({ rate: round3(Math.min(100, n)) })} />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
              <Field label="Delivery (default)">
                <input className={inputCls} value={s.quote.delivery} onChange={(e) => quote({ delivery: e.target.value })} />
              </Field>
              <Field label="Payment (default)">
                <input className={inputCls} value={s.quote.payment} onChange={(e) => quote({ payment: e.target.value })} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Notes (default)">
                  <textarea className={area} value={s.quote.notes} onChange={(e) => quote({ notes: e.target.value })} />
                </Field>
              </div>
              <Field label="Payment details" hint="Bank name, account name and number. Under the totals.">
                <textarea className={area} value={s.quote.bank} onChange={(e) => quote({ bank: e.target.value })} />
              </Field>
              <Field label="Footer" hint="Small print at the bottom of every page.">
                <textarea className={area} value={s.quote.footer} onChange={(e) => quote({ footer: e.target.value })} />
              </Field>
            </div>
            {latest && (
              <Link href={`/quotations/${latest.id}/print`} className={`${btnLink} self-start`}>
                See it on your latest quotation ({latest.number})
              </Link>
            )}
          </div>
        </Section>

        <Section id="prices" title="Price lists">
          <ul className="flex flex-col divide-y divide-[var(--q-border)] rounded-[12px] border border-[var(--q-border)]">
            {s.priceLists.map((l, i) => (
              <li key={l.id} className="flex items-center gap-3 px-3 py-2">
                <input
                  className={`${inputCls} max-w-[260px]`}
                  aria-label="Price list name"
                  value={l.name}
                  onChange={(e) => set((x) => ({ ...x, priceLists: x.priceLists.map((p) => (p.id === l.id ? { ...p, name: e.target.value } : p)) }))}
                />
                <span className="flex-1 text-[12px] text-[var(--q-text-3)]">{i === 0 ? "Standard price" : `${used(l.id)} product${used(l.id) === 1 ? "" : "s"} priced`}</span>
                {l.id !== STANDARD_LIST && (
                  <button className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--q-text-3)] hover:bg-[var(--q-danger-bg)] hover:text-[var(--q-danger)]" aria-label={`Delete ${l.name}`} onClick={() => setDropList(l)}>
                    <IconX />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newList.trim();
              if (!name || s.priceLists.some((l) => l.name.trim().toLowerCase() === name.toLowerCase())) return;
              set((x) => ({ ...x, priceLists: [...x.priceLists, { id: uid(), name }] }));
              setNewList("");
            }}
          >
            <input className={`${inputCls} max-w-[260px]`} aria-label="New price list name" value={newList} onChange={(e) => setNewList(e.target.value)} />
            <button type="submit" className={btnGhost} disabled={!newList.trim()}>
              <IconPlus size={13} /> Add price list
            </button>
          </form>
        </Section>

        <Section id="whatsapp" title="WhatsApp">
          <div className="flex flex-col gap-2.5">
            <Field label="Country code" hint="Added to local numbers that start with 0. 60 = Malaysia, 65 = Singapore.">
              <input className={`${inputCls} q-mono max-w-[120px]`} value={s.whatsapp.countryCode} onChange={(e) => wa({ countryCode: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
            </Field>
            <Field label="Message" hint={`You can use ${WA_FIELDS.join(" ")}`}>
              <textarea className={`${inputCls} min-h-[180px] resize-y`} value={s.whatsapp.message} onChange={(e) => wa({ message: e.target.value })} />
            </Field>
          </div>
        </Section>

        {SUPABASE_ON && (
          <Section id="team" title="Team">
            <TeamSection />
          </Section>
        )}

        <Section id="data" title={SUPABASE_ON ? "Sample data" : "Data"} hint="Sample data: an invented phone shop wholesaler with 50 products, 7 customers and 9 quotations, to try Add with AI on.">
          {!SUPABASE_ON && (
            <p className="mb-3 rounded-[12px] border border-[var(--q-border)] bg-[var(--q-accent-soft)] px-3 py-2.5 text-[13px] text-[var(--q-text-2)]">
              Browser mode: everything is kept in this browser only, with no login. Connect Supabase (see the README) for login, a team, and the same data on every device.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {sample ? (
              <button className={btnDanger} onClick={() => setConfirmRemove(true)}>
                Remove sample data
              </button>
            ) : (
              <button className={btnGhost} onClick={() => loadSample()}>
                Load sample data
              </button>
            )}
          </div>
        </Section>
      </div>

      {dropList && (
        <Modal
          title={`Delete ${dropList.name}?`}
          onClose={() => setDropList(null)}
          footer={
            <>
              <button className={btnGhost} onClick={() => setDropList(null)}>
                Keep
              </button>
              <button
                className={btnDanger}
                onClick={() => {
                  set((x) => ({ ...x, priceLists: x.priceLists.filter((p) => p.id !== dropList.id) }));
                  dropPriceList(dropList.id);
                  setDropList(null);
                }}
              >
                Delete
              </button>
            </>
          }
        >
          The {dropList.name} price is removed from {used(dropList.id)} product{used(dropList.id) === 1 ? "" : "s"}. Quotations already made keep their prices.
        </Modal>
      )}
      {confirmRemove && (
        <Modal
          title="Remove the sample data?"
          onClose={() => setConfirmRemove(false)}
          footer={
            <>
              <button className={btnGhost} onClick={() => setConfirmRemove(false)}>
                Keep
              </button>
              <button
                className={btnDanger}
                onClick={() => {
                  removeSample();
                  setConfirmRemove(false);
                }}
              >
                Remove
              </button>
            </>
          }
        >
          The sample products, customers and quotations are removed, even ones you changed. Your own data, company details and price lists stay.
        </Modal>
      )}
    </div>
  );
}

"use client";

import { memo, useEffect, useState } from "react";
import type { Customer } from "@/lib/types";
import { EMPTY_CUSTOMER, findSaved, sameDetails, saveCustomer, toCustomer, useCustomers } from "@/lib/customers";
import { btnLink, btnPrimary, Field, IconCheck, inputCls, labelCls } from "@/components/ui";

/** A box on the quotation paper: Bill to, Deliver to. */
const box = "rounded-[12px] border border-[var(--q-border)] bg-[var(--q-surface)] p-3.5";
import CustomerPicker from "@/components/CustomerPicker";

const FIELDS: { key: keyof Customer; label: string; wide?: boolean; type?: string }[] = [
  { key: "name", label: "Company", wide: true },
  { key: "contact", label: "Attn (person)" },
  { key: "tel", label: "Tel / WhatsApp", type: "tel" },
  { key: "address1", label: "Address line 1", wide: true },
  { key: "address2", label: "Address line 2", wide: true },
  { key: "regNo", label: "Company no" },
  { key: "email", label: "Email", type: "email" },
];

export function CustomerForm({ c, onChange, autoFocusName }: { c: Customer; onChange: (c: Customer) => void; autoFocusName?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
      {FIELDS.map((f) => (
        <div key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
          <Field label={f.label}>
            <input
              className={inputCls}
              type={f.type || "text"}
              autoFocus={autoFocusName && f.key === "name"}
              value={c[f.key]}
              onChange={(e) => onChange({ ...c, [f.key]: e.target.value })}
            />
          </Field>
        </div>
      ))}
    </div>
  );
}

function Summary({ c }: { c: Customer }) {
  if (!c.name && !c.contact && !c.tel) return <p className="text-[13px] text-[var(--q-text-3)]">No customer yet</p>;
  return (
    <div className="text-[13px] leading-[1.55] text-[var(--q-text-2)]">
      <div className="text-[14px] font-bold text-[var(--q-text)]">{c.name}</div>
      {(c.contact || c.tel) && (
        <div>
          {c.contact}
          {c.contact && c.tel ? " · " : ""}
          <span className="q-mono">{c.tel}</span>
        </div>
      )}
      {c.email && <div className="break-all">{c.email}</div>}
      {(c.address1 || c.address2) && (
        <div className="mt-1.5">
          {c.address1 && <div>{c.address1}</div>}
          {c.address2 && <div>{c.address2}</div>}
        </div>
      )}
      {c.regNo && <div className="mt-1.5 text-[11.5px] text-[var(--q-text-3)]">Company no <span className="q-mono">{c.regNo}</span></div>}
    </div>
  );
}

type Mode = "view" | "pick" | "edit";

/** Customer block. Empty: opens on "Find a customer". Picked or typed: reads as text, with Change and Edit.
    A customer not yet in Customers (or changed from the saved one) can be saved in one click, so next time it is a name search.
    `onChange(c, true)` marks a finished choice (picked, or Done on the form); plain typing sends `final` false. */
export const CustomerCard = memo(function CustomerCard({
  customer,
  onChange,
  plain,
}: {
  customer: Customer;
  onChange: (c: Customer, final?: boolean) => void;
  plain?: boolean;
}) {
  const empty = !customer.name.trim() && !customer.contact.trim() && !customer.tel.trim();
  const [mode, setMode] = useState<Mode>(empty ? "pick" : "view");
  const [saveIt, setSaveIt] = useState(true);
  const [justSaved, setJustSaved] = useState(false);
  const book = useCustomers();
  const saved = findSaved(book, customer.name);
  const changed = !!saved && !sameDetails(saved, customer);
  // filled from outside (Add with AI recognised the sender): leave "Find a customer" and show who it is
  const filled = !!(customer.name.trim() || customer.contact.trim());
  useEffect(() => {
    if (filled && mode === "pick") setMode("view");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filled]);

  function save() {
    if (!customer.name.trim()) return;
    saveCustomer(customer);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2200);
  }

  const title = !plain && <h2 className={`${labelCls} !mb-0`}>Bill to</h2>;
  const actions = (
    <span className="flex shrink-0 items-center gap-1">
      <button className={btnLink} onClick={() => setMode("pick")}>
        Change
      </button>
      <span className="text-[var(--q-text-3)]">·</span>
      <button className={btnLink} onClick={() => setMode("edit")}>
        Edit
      </button>
    </span>
  );

  return (
    <section className={box}>
      {mode === "pick" && (
        <>
          <div className={`mb-2.5 flex items-center ${plain ? "justify-end" : "justify-between"}`}>
            {title}
            {!empty && (
              <button className={btnLink} onClick={() => setMode("view")}>
                Cancel
              </button>
            )}
          </div>
          <CustomerPicker
            onPick={(c) => {
              onChange(toCustomer(c), true);
              setMode("view");
            }}
            onNew={(name) => {
              onChange({ ...EMPTY_CUSTOMER, name });
              setSaveIt(true);
              setMode("edit");
            }}
          />
        </>
      )}

      {mode === "edit" && (
        <>
          {!plain && <div className="mb-2.5">{title}</div>}
          <CustomerForm c={customer} onChange={(c) => onChange(c)} autoFocusName={!customer.name} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {customer.name.trim() && (!saved || changed) ? (
              <label className="flex items-center gap-2 text-[12.5px] text-[var(--q-text-2)]">
                <input type="checkbox" className="h-4 w-4 accent-[var(--q-accent)]" checked={saveIt} onChange={(e) => setSaveIt(e.target.checked)} />
                {saved ? "Update the saved customer too" : "Save to Customers"}
              </label>
            ) : (
              <span />
            )}
            <button
              className={btnPrimary}
              onClick={() => {
                if (saveIt && customer.name.trim() && (!saved || changed)) save();
                onChange(customer, true);
                setMode("view");
              }}
            >
              Done
            </button>
          </div>
        </>
      )}

      {mode === "view" && (
        <>
          {/* desktop: actions in the header next to the title; phone fold (no title): on the status line at the bottom */}
          {!plain && (
            <div className="mb-2.5 flex items-center justify-between gap-1">
              {title}
              {actions}
            </div>
          )}
          <Summary c={customer} />
          {(customer.name.trim() || plain) && (
            <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[var(--q-border)] pt-2 text-[12.5px]">
              {!customer.name.trim() ? (
                <span />
              ) : justSaved ? (
                <span className="inline-flex items-center gap-1 font-semibold text-[var(--q-ok)]">
                  <IconCheck size={12} /> Saved to Customers
                </span>
              ) : !saved ? (
                <span className="text-[var(--q-text-3)]">
                  New customer ·{" "}
                  <button className="font-semibold text-[var(--q-accent)] hover:underline" onClick={save}>
                    Save
                  </button>
                </span>
              ) : changed ? (
                <span className="text-[var(--q-text-3)]">
                  Changed ·{" "}
                  <button className="font-semibold text-[var(--q-accent)] hover:underline" onClick={save}>
                    Update saved
                  </button>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[var(--q-text-3)]">
                  <IconCheck size={12} /> In Customers
                </span>
              )}
              {plain && actions}
            </div>
          )}
        </>
      )}
    </section>
  );
});

/** Delivery block: same as the invoice address by default, its own address when unticked. */
export const DeliveryCard = memo(function DeliveryCard({
  same,
  customer,
  invoiceTo,
  onSame,
  onChange,
  plain,
}: {
  same: boolean;
  customer: Customer;
  invoiceTo: Customer;
  onSame: (v: boolean) => void;
  onChange: (c: Customer) => void;
  plain?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const showEdit = !same && !editing;
  return (
    <section className={box}>
      {(!plain || showEdit) && (
        <div className={`mb-2.5 flex items-center gap-2 ${plain ? "justify-end" : "justify-between"}`}>
          {!plain && <h2 className={`${labelCls} !mb-0`}>Deliver to</h2>}
          {showEdit && (
            <button className={btnLink} onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>
      )}
      <label className="flex items-center gap-2 text-[13px] text-[var(--q-text-2)]">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--q-accent)]"
          checked={same}
          onChange={(e) => {
            onSame(e.target.checked);
            if (!e.target.checked) setEditing(true);
          }}
        />
        Same as Bill to
      </label>
      {!same && (
        <div className="mt-3">
          {editing ? (
            <>
              <CustomerForm c={customer} onChange={onChange} />
              <div className="mt-3 flex justify-end">
                <button className={btnPrimary} onClick={() => setEditing(false)}>
                  Done
                </button>
              </div>
            </>
          ) : (
            <Summary c={customer.name || customer.address1 ? customer : invoiceTo} />
          )}
        </div>
      )}
    </section>
  );
});

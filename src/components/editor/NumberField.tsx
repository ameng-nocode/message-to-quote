"use client";

import { useState } from "react";
import { inputCls } from "@/components/ui";

/** Number box that lets you type freely ("12." or an empty box) and only commits finished, valid numbers.
    `cell` draws it as a value written on the quotation paper instead of a form box. */
export default function NumberField({
  value,
  onCommit,
  min = 0,
  step,
  className = "",
  onFocus,
  onBlur,
  title,
  ariaLabel,
  format,
  cell,
}: {
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  step?: string;
  className?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  title?: string;
  ariaLabel?: string;
  /** how the number reads when the box is not being edited, e.g. two decimals for money */
  format?: (n: number) => string;
  cell?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (format ? format(value) : String(value));
  const n = Number(draft);
  const bad = draft !== null && draft.trim() !== "" && (!Number.isFinite(n) || n < min);
  const base = cell ? "q-cell w-full px-1.5 py-[5px] text-[13px] text-[var(--q-text)]" : inputCls;
  return (
    <input
      type="number"
      inputMode="decimal"
      min={min}
      step={step}
      title={bad ? `Must be ${min} or more` : title}
      aria-label={ariaLabel}
      aria-invalid={bad || undefined}
      className={`${base} q-mono text-right ${bad ? "!border-[var(--q-danger)]" : ""} ${className}`}
      value={shown}
      onFocus={onFocus}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const v = Number(raw);
        if (raw.trim() !== "" && Number.isFinite(v) && v >= min) onCommit(v);
      }}
      onBlur={() => {
        setDraft(null);
        onBlur?.();
      }}
    />
  );
}

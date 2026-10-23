"use client";

import { useEffect, useRef, useState } from "react";

export const mono = "q-mono";

/** The one main action of a screen: the cobalt gradient. */
export const btnPrimary =
  "q-pri inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] px-4 text-[14px] font-semibold text-white disabled:opacity-45 disabled:shadow-none";
/** The AI's own actions (Add with AI, read an order): sky with cobalt text and the sparkle. */
export const btnAi =
  "q-ai-btn inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] px-4 text-[14px] font-semibold disabled:opacity-50";
export const btnGhost =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-[var(--q-border-strong)] bg-[var(--q-surface)] px-4 text-[14px] font-semibold text-[var(--q-text)] hover:border-[var(--q-ai-border)] hover:bg-[var(--q-surface-alt)] disabled:opacity-50";
export const btnDanger =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-[var(--q-danger-border)] bg-[var(--q-danger-bg)] px-4 text-[13.5px] font-semibold text-[var(--q-danger)] hover:brightness-95";
export const btnLink = "inline-flex h-7 items-center text-[12.5px] font-semibold text-[var(--q-accent)] hover:underline";
export const inputCls =
  "w-full rounded-[10px] border border-[var(--q-border-strong)] bg-[var(--q-surface)] px-3 py-[9px] text-[14px] text-[var(--q-text)] outline-none focus:border-[var(--q-accent)] focus:ring-[3px] focus:ring-[var(--q-ring)] disabled:bg-[var(--q-surface-alt)] disabled:text-[var(--q-text-2)]";
export const card =
  "rounded-[18px] border border-[var(--q-border)] bg-[var(--q-surface)] shadow-[0_1px_2px_rgba(14,42,122,0.05),0_20px_40px_-26px_rgba(14,42,122,0.35)]";
export const thCls = "px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.7px] text-[var(--q-text-3)] whitespace-nowrap";
export const labelCls = "mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.9px] text-[var(--q-text-3)]";

/* icons: 16px stroke set, inherit currentColor */
const ic = "shrink-0";
export const IconSearch = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={ic} aria-hidden="true">
    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
export const IconSparkle = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={ic} aria-hidden="true">
    <path d="M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8l4.9-1.6L8 1.5z" fill="currentColor" />
  </svg>
);
export const IconPlus = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={ic} aria-hidden="true">
    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
export const IconChevron = ({ size = 14, dir = "down" }: { size?: number; dir?: "down" | "up" | "left" | "right" }) => {
  const rot = { down: 0, left: 90, up: 180, right: -90 }[dir];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={ic} style={{ transform: `rotate(${rot}deg)` }} aria-hidden="true">
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};
export const IconMore = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={ic} aria-hidden="true">
    <circle cx="3" cy="8" r="1.4" />
    <circle cx="8" cy="8" r="1.4" />
    <circle cx="13" cy="8" r="1.4" />
  </svg>
);
export const IconCheck = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={ic} aria-hidden="true">
    <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const IconX = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={ic} aria-hidden="true">
    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
export const IconPhoto = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={ic} aria-hidden="true">
    <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="6" cy="6.5" r="1.2" fill="currentColor" />
    <path d="m3 12 3.5-3.5 2.5 2.5 2-2L13 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" | "muted" | "outline" }) {
  const cls =
    tone === "accent"
      ? "bg-[var(--q-accent-soft)] text-[var(--q-accent)]"
      : tone === "muted"
        ? "bg-[var(--q-chip-bg)] text-[var(--q-text-3)]"
        : tone === "outline"
          ? "border border-[var(--q-border-strong)] bg-[var(--q-surface)] text-[var(--q-text-2)]"
          : "bg-[var(--q-chip-bg)] text-[var(--q-text-chip)]";
  return <span className={`inline-flex min-h-[22px] max-w-full items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold break-words ${cls}`}>{children}</span>;
}

/** On / off switch, for settings that apply straight away. */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-[34px] shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--q-ring)] ${on ? "bg-[var(--q-accent)]" : "bg-[var(--q-switch-off)]"}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-[left] ${on ? "left-4" : "left-0.5"}`} />
    </button>
  );
}

/** stroke icons in the 24px grid, for the list and the rail */
const s24 = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const IconChat = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={ic} aria-hidden="true" {...s24}>
    <path d="M20 11.5a8 8 0 0 1-11.7 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.5z" />
  </svg>
);
export const IconPencil = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={ic} aria-hidden="true" {...s24}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </svg>
);
export const IconWarn = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={ic} aria-hidden="true" {...s24}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16.5v.5" />
  </svg>
);
export const IconClipboard = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={ic} aria-hidden="true" {...s24}>
    <rect x="6" y="4" width="12" height="17" rx="2" />
    <path d="M9 4h6v3H9z" />
  </svg>
);
export const IconDoc = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={ic} aria-hidden="true" {...s24}>
    <path d="M7 3h7l5 5v13H7z" />
    <path d="M14 3v5h5" />
  </svg>
);
export const IconPerson = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={ic} aria-hidden="true" {...s24}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </svg>
);
export const IconBox = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={ic} aria-hidden="true" {...s24}>
    <path d="M3 7.5l9-4.5 9 4.5v9l-9 4.5-9-4.5z" />
    <path d="M3 7.5l9 4.5 9-4.5M12 12v9" />
  </svg>
);

export const IconGear = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={ic} aria-hidden="true" {...s24}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);
export const IconUpload = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={ic} aria-hidden="true" {...s24}>
    <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
  </svg>
);
export const IconDownload = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={ic} aria-hidden="true" {...s24}>
    <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />
  </svg>
);

export const IconSend = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={ic} aria-hidden="true" {...s24} strokeWidth={2}>
    <path d="m22 2-7 20-4-9-9-4z" />
    <path d="M22 2 11 13" />
  </svg>
);

/** Draft = still with us (deep cobalt, it needs sending); Sent = with the customer (sky). */
export function StatusChip({ status }: { status: "Draft" | "Sent" }) {
  return (
    <span
      className={`inline-flex h-[26px] shrink-0 items-center rounded-full px-2.5 text-[12.5px] font-semibold ${
        status === "Sent" ? "border border-[var(--q-border-strong)] bg-[var(--q-accent-soft)] text-[var(--q-accent)]" : "bg-[var(--q-deep)] text-white"
      }`}
    >
      {status}
    </span>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-[var(--q-text-3)]">{hint}</span>}
    </label>
  );
}

/** Segmented filter with counts. A count can be flagged when it means "needs you". */
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { key: T; label: string; count?: number; flag?: boolean }[] }) {
  return (
    <div className="q-glass flex max-w-full gap-0.5 overflow-x-auto rounded-[12px] p-1 shadow-none" role="tablist">
      {items.map((it) => {
        const on = it.key === value;
        return (
          <button
            key={it.key}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(it.key)}
            className={`flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-[9px] px-3.5 text-[13.5px] ${
              on ? "bg-[var(--q-surface)] font-bold text-[var(--q-accent)] shadow-[0_1px_3px_rgba(14,42,122,0.15)]" : "font-semibold text-[var(--q-text-2)] hover:text-[var(--q-text)]"
            }`}
          >
            {it.label}
            {typeof it.count === "number" && (
              <span className={`q-mono text-[11.5px] ${it.flag && it.count > 0 ? "font-semibold text-[var(--q-accent)]" : "text-[var(--q-text-3)]"}`}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Kebab menu. Closes on outside click and Escape. */
export function Menu({ items, label = "More actions" }: { items: { label: string; onClick: () => void; danger?: boolean }[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--q-text-2)] hover:bg-[var(--q-chip-bg)] hover:text-[var(--q-text)]"
      >
        <IconMore />
      </button>
      {open && (
        <div className="q-popover q-pop absolute right-0 top-full z-30 mt-1 w-[176px] overflow-hidden rounded-[12px] py-1" onClick={(e) => e.stopPropagation()}>
          {items.map((it) => (
            <button
              key={it.label}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={`flex w-full items-center px-3 py-2 text-left text-[13px] hover:bg-[var(--q-surface-alt)] ${it.danger ? "text-[var(--q-danger)]" : "text-[var(--q-text)]"}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Phones and tablets scroll #q-main (the page itself never scrolls there, so Chrome's address bar never slides and the
   bottom bar never moves). While an overlay is open that scroller is locked, so the page behind it stays still. */
let locks = 0;
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    const main = document.getElementById("q-main");
    if (!main || !window.matchMedia("(max-width: 1023.98px)").matches) return;
    if (locks++ === 0) main.style.overflow = "hidden";
    return () => {
      if (--locks === 0) main.style.overflow = "";
    };
  }, [active]);
}

/** Focus a field only with a mouse. On a phone, focusing pops the keyboard before the person has chosen to type. */
export function focusIfMouse(el: HTMLElement | null | undefined) {
  if (el && window.matchMedia("(pointer: fine)").matches) el.focus();
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-[#0D1B3E]/35 p-4 backdrop-blur-[2px] ${wide ? "pt-12" : "pt-28"}`} onClick={onClose}>
      <div className={`q-popover w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-[18px]`} onClick={(e) => e.stopPropagation()}>
        <div className="flex h-[54px] items-center justify-between border-b border-[var(--q-border)] px-5">
          <h2 className="text-[15px] font-bold text-[var(--q-text)]">{title}</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--q-text-3)] hover:bg-[var(--q-chip-bg)] hover:text-[var(--q-text)]" aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="px-5 py-4 text-[13.5px] text-[var(--q-text-2)]">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--q-border)] px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Toast({ text }: { text: string }) {
  return (
    <div className="q-toast fixed bottom-6 left-1/2 z-[70] w-max max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-[10px] bg-[var(--q-text)] px-4 py-2.5 text-center text-[13px] font-medium text-white shadow-[0_12px_30px_-12px_rgba(14,42,122,0.6)]">
      {text}
    </div>
  );
}

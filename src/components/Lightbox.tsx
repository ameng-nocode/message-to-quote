"use client";

import { useEffect } from "react";
import { IconX, useScrollLock } from "./ui";

export type LightboxItem = { src: string; title: string; sub?: string };

/** Big picture view. Click anywhere or press Escape to close. */
export default function Lightbox({ item, onClose }: { item: LightboxItem | null; onClose: () => void }) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  useScrollLock(Boolean(item));
  if (!item) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0F172A]/75 p-3 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-[min(1000px,100%)] overflow-hidden rounded-lg bg-white" onClick={(e) => e.stopPropagation()}>
        <img src={item.src} alt={item.title} className="mx-auto block h-auto max-h-[min(70vh,100%)] w-auto max-w-full object-contain" />
        <div className="flex items-start justify-between gap-3 border-t border-[var(--q-border)] px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[var(--q-text)] break-words">{item.title}</div>
            {item.sub && <div className="q-mono text-[11px] text-[var(--q-text-3)] break-words">{item.sub}</div>}
          </div>
          <button onClick={onClose} className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] text-[var(--q-text-2)] hover:bg-[var(--q-chip-bg)] hover:text-[var(--q-text)]">
            <IconX /> Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** Small picture that opens the lightbox. Always the 240px thumb, lazy, with a fixed box so rows never jump. */
export function Thumb({ src, alt, w, h, onOpen, className = "" }: { src: string; alt: string; w: number; h: number; onOpen: () => void; className?: string }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={`block shrink-0 cursor-zoom-in overflow-hidden rounded border border-[var(--q-border)] outline-none hover:border-[var(--q-border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--q-ring)] ${className}`}
      style={{ width: w, height: h }}
      title="Enlarge"
    >
      <img src={src} alt={alt} width={w} height={h} loading="lazy" decoding="async" className="q-thumb block h-full w-full object-cover" />
    </button>
  );
}

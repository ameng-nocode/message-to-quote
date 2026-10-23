"use client";

import { useRef, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { newDraft, saveQuote } from "@/lib/store";
import { IconPlus } from "./ui";

/** Makes a blank draft and opens it straight away, no in-between page. Shows a spinner in place of the plus while the editor loads. */
export default function NewQuoteButton({ className, children, iconSize = 14 }: { className: string; children: ReactNode; iconSize?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const busy = useRef(false);
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      aria-busy={pending}
      onClick={() => {
        if (busy.current) return;
        busy.current = true;
        const q = saveQuote(newDraft());
        start(() => router.push(`/quotations/${q.id}`));
      }}
    >
      {pending ? <Spinner size={iconSize} /> : <IconPlus size={iconSize} />} {children}
    </button>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="shrink-0 animate-spin" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

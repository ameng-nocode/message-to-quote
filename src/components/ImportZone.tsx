"use client";

import { useEffect, useRef, useState } from "react";
import { imageFiles, shrinkFile } from "@/lib/image";
import type { PendingImport } from "@/lib/store";
import { btnAi, btnGhost, btnPrimary, IconClipboard, IconPhoto, IconSparkle, IconX, Modal } from "./ui";

/** The front door of the app: a customer's order goes in here, a quotation comes out.
    A picture (dropped, chosen, or Ctrl+V) imports at once; text opens the paste box so it can be checked first. */
export default function ImportZone({ onImport }: { onImport: (p: PendingImport) => void }) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<PendingImport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const draftFileRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef<PendingImport | null>(null);
  draftRef.current = draft;

  async function importImages(files: File[], text = "") {
    const list = files.slice(0, 4);
    if (!list.length) return;
    setBusy(true);
    try {
      onImport({ text, images: await Promise.all(list.map((f) => shrinkFile(f))) });
    } finally {
      setBusy(false);
    }
  }

  async function addToDraft(files: File[]) {
    const cur = draftRef.current;
    if (!cur) return;
    const room = 4 - cur.images.length;
    if (room <= 0) return;
    const shrunk = await Promise.all(files.slice(0, room).map((f) => shrinkFile(f)));
    setDraft((d) => (d ? { ...d, images: [...d.images, ...shrunk].slice(0, 4) } : d));
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (draftRef.current) return; // the paste box handles its own pastes
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const files = imageFiles(e.clipboardData?.files);
      if (files.length) {
        e.preventDefault();
        void importImages(files);
        return;
      }
      const text = e.clipboardData?.getData("text")?.trim();
      if (text) {
        e.preventDefault();
        setDraft({ text, images: [] });
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div
        className={`relative flex flex-col gap-4 rounded-[18px] border-[1.5px] border-dashed p-5 shadow-[0_20px_44px_-26px_rgba(14,42,122,0.35)] sm:flex-row sm:items-center sm:gap-5 sm:px-6 sm:py-[22px] ${
          dragging ? "border-[var(--q-accent)] bg-[var(--q-accent-soft)]" : "border-[var(--q-ai-border)] bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(226,234,254,0.85))]"
        }`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!dragging) setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const files = imageFiles(e.dataTransfer?.files);
          if (files.length) {
            void importImages(files);
            return;
          }
          const text = e.dataTransfer?.getData("text")?.trim();
          if (text) setDraft({ text, images: [] });
        }}
      >
        <div className="flex items-center gap-4 sm:contents">
          <span className="q-pri flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-[14px] text-white">
            <IconSparkle size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-bold leading-snug tracking-[-0.2px] text-[var(--q-text)] sm:text-[18px]">
              <span className="hidden sm:inline">Drop a WhatsApp screenshot, or paste the order</span>
              <span className="sm:hidden">Import the customer&apos;s order</span>
            </p>
            <p className="mt-1 text-[13.5px] leading-snug text-[var(--q-text-2)] sm:text-[14px]">
              WhatsApp chat, product photo or typed order
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <button type="button" className={`${btnGhost} max-sm:h-11`} disabled={busy} onClick={() => fileRef.current?.click()}>
            <IconPhoto size={16} /> Choose image
          </button>
          <button type="button" className={`${btnAi} max-sm:h-11`} disabled={busy} onClick={() => setDraft({ text: "", images: [] })}>
            <IconClipboard size={16} /> Paste order
          </button>
        </div>
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center rounded-[18px] bg-white/90 text-[14px] font-semibold text-[var(--q-accent)]">
            Reading the picture
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void importImages(imageFiles(e.target.files));
            e.target.value = "";
          }}
        />
      </div>

      {draft && (
        <Modal
          title="Paste the order"
          onClose={() => setDraft(null)}
          footer={
            <>
              <button type="button" className={btnGhost} onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={!draft.text.trim() && draft.images.length === 0}
                onClick={() => {
                  const p = { text: draft.text.trim(), images: draft.images };
                  setDraft(null);
                  onImport(p);
                }}
              >
                <IconSparkle size={13} /> Build quotation
              </button>
            </>
          }
        >
          <label className="block">
            <span className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.9px] text-[var(--q-text-3)]">Customer&apos;s message</span>
            <textarea
              autoFocus
              rows={7}
              className="w-full resize-y rounded-[10px] border border-[var(--q-border-strong)] bg-[var(--q-surface)] px-3 py-2 text-[13.5px] leading-relaxed text-[var(--q-text)] outline-none focus:border-[var(--q-accent)] focus:ring-[3px] focus:ring-[var(--q-ring)]"
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              onPaste={(e) => {
                const files = imageFiles(e.clipboardData?.files);
                if (files.length) {
                  e.preventDefault();
                  void addToDraft(files);
                }
              }}
            />
            <span className="mt-1 block text-[12px] text-[var(--q-text-3)]">Paste it as it came: codes, product names, quantities, any language.</span>
          </label>
          {draft.images.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {draft.images.map((src, i) => (
                <span key={i} className="relative">
                  <img src={src} alt={`Attached picture ${i + 1}`} className="h-[64px] w-[64px] rounded-[9px] border border-[var(--q-border)] object-cover" />
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, images: draft.images.filter((_, j) => j !== i) })}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--q-text)] text-white"
                    aria-label={`Remove picture ${i + 1}`}
                  >
                    <IconX size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <button
            type="button"
            className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-[8px] px-1 text-[13px] font-semibold text-[var(--q-accent)] hover:underline disabled:opacity-50"
            disabled={draft.images.length >= 4}
            onClick={() => draftFileRef.current?.click()}
          >
            <IconPhoto size={15} /> Add a screenshot or photo
          </button>
          <input
            ref={draftFileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void addToDraft(imageFiles(e.target.files));
              e.target.value = "";
            }}
          />
        </Modal>
      )}
    </>
  );
}

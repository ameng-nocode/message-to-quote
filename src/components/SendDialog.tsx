"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Settings } from "@/lib/settings";
import type { Quotation } from "@/lib/types";
import { canShareFiles, quoteToPdf, saveBlob } from "@/lib/pdf";
import { downloadXlsx } from "@/lib/xlsx";
import { waMessage, waNumber } from "@/lib/send";
import { btnGhost, btnPrimary, Field, IconCheck, inputCls, labelCls, Modal } from "./ui";

/** The quotation's PDF, built once and kept until the quotation or the settings change. */
export function useQuoteFiles(q: Quotation | null | undefined, s: Settings, flash: (t: string) => void) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [xlsBusy, setXlsBusy] = useState(false);
  const qRef = useRef(q);
  qRef.current = q;
  useEffect(() => setBlob(null), [q, s]);

  const ensurePdf = useCallback(async (): Promise<Blob | null> => {
    if (blob) return blob;
    const cur = qRef.current;
    if (!cur) return null;
    setPdfBusy(true);
    try {
      const b = await quoteToPdf(cur, s);
      setBlob(b);
      return b;
    } catch (e) {
      console.error(e);
      flash("Could not build the PDF. Use Print instead.");
      return null;
    } finally {
      setPdfBusy(false);
    }
  }, [blob, s, flash]);

  const downloadPdf = useCallback(async () => {
    const b = await ensurePdf();
    if (b && qRef.current) saveBlob(b, `${qRef.current.number}.pdf`);
  }, [ensurePdf]);

  const downloadExcel = useCallback(async () => {
    if (!qRef.current) return;
    setXlsBusy(true);
    try {
      await downloadXlsx(qRef.current, s);
    } finally {
      setXlsBusy(false);
    }
  }, [s]);

  return { blob, pdfBusy, xlsBusy, ensurePdf, downloadPdf, downloadExcel };
}

export type QuoteFiles = ReturnType<typeof useQuoteFiles>;

/** Send via WhatsApp: the number and message to check, then the chat opens with the message typed and the PDF to attach.
    On a phone that can share files, the PDF goes straight into WhatsApp. */
export default function SendDialog({
  q,
  s,
  files,
  onSent,
  onClose,
  flash,
}: {
  q: Quotation;
  s: Settings;
  files: QuoteFiles;
  onSent: () => void;
  onClose: () => void;
  flash: (t: string) => void;
}) {
  const [wa, setWa] = useState(() => ({ phone: waNumber(q.invoiceTo.tel, s.whatsapp.countryCode), text: waMessage(q, s) }));
  const [shareOk, setShareOk] = useState(false);
  const [copied, setCopied] = useState(false);
  const { blob, pdfBusy, ensurePdf } = files;

  useEffect(() => setShareOk(canShareFiles() && window.matchMedia("(pointer: coarse)").matches), []);
  useEffect(() => {
    void ensurePdf();
    // build the PDF once, when the window opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openChat() {
    const name = `${q.number}.pdf`;
    window.open(`https://wa.me/${wa.phone}?text=${encodeURIComponent(wa.text)}`, "_blank", "noopener");
    onSent();
    onClose();
    void (async () => {
      const b = blob ?? (await ensurePdf());
      if (b) saveBlob(b, name);
      flash(b ? `${name} downloaded. Attach it in the chat.` : "WhatsApp opened.");
    })();
  }

  return (
    <Modal
      title="Send via WhatsApp"
      onClose={onClose}
      footer={
        <>
          <button className={`${btnGhost} max-sm:hidden`} onClick={onClose}>
            Cancel
          </button>
          {shareOk && (
            <button className={`${btnGhost} max-sm:w-full`} onClick={openChat}>
              Open WhatsApp chat
            </button>
          )}
          <button
            className={`${btnPrimary} max-sm:order-first max-sm:h-12 max-sm:w-full`}
            disabled={pdfBusy}
            onClick={async () => {
              if (!shareOk) return openChat();
              const b = blob ?? (await ensurePdf());
              const file = b ? new File([b], `${q.number}.pdf`, { type: "application/pdf" }) : null;
              if (file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
                try {
                  await navigator.share({ files: [file], text: wa.text, title: q.number });
                  onSent();
                  onClose();
                  return;
                } catch (e) {
                  if ((e as DOMException)?.name === "AbortError") return; // the share sheet was closed
                }
              }
              openChat();
            }}
          >
            {pdfBusy ? "Preparing PDF" : shareOk ? "Send PDF to WhatsApp" : "Open WhatsApp chat"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Field label="Customer WhatsApp number" hint="From the Bill to phone. Country code first, no plus sign.">
          <input className={`${inputCls} q-mono`} value={wa.phone} onChange={(e) => setWa({ ...wa, phone: e.target.value.replace(/\D/g, "") })} />
        </Field>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className={`${labelCls} !mb-0`}>Message</span>
            <button
              type="button"
              className={`${btnGhost} h-8 px-3 text-[12.5px]`}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(wa.text);
                } catch {
                  const t = document.createElement("textarea");
                  t.value = wa.text;
                  document.body.appendChild(t);
                  t.select();
                  document.execCommand("copy");
                  t.remove();
                }
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? (
                <>
                  <IconCheck size={12} /> Copied
                </>
              ) : (
                "Copy message"
              )}
            </button>
          </div>
          <textarea className={`${inputCls} min-h-[180px] resize-y text-[13.5px]`} value={wa.text} onChange={(e) => setWa({ ...wa, text: e.target.value })} />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--q-border)] bg-[var(--q-surface-alt)] px-3 py-2.5 text-[12.5px]">
          <span className="min-w-0">
            <span className="block font-semibold text-[var(--q-text)]">{pdfBusy ? "Building the PDF" : `${q.number}.pdf`}</span>
            <span className="block text-[var(--q-text-3)]">{blob ? `Ready, ${Math.max(1, Math.round(blob.size / 1024))} KB` : "Attach this to the chat"}</span>
          </span>
          <button
            type="button"
            className={`${btnGhost} h-8 px-3 text-[12.5px]`}
            disabled={pdfBusy}
            onClick={async () => {
              const b = blob ?? (await ensurePdf());
              if (b) saveBlob(b, `${q.number}.pdf`);
            }}
          >
            Download PDF
          </button>
        </div>
        <div className="text-[12px] text-[var(--q-text-3)]">Sending marks this quotation as Sent.</div>
      </div>
    </Modal>
  );
}

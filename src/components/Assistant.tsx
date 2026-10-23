"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { getProduct, productLabel, products } from "@/lib/products";
import { fmtMoney, fmtQty } from "@/lib/quote";
import { hasSample, SAMPLE_ORDER } from "@/lib/sample";
import type { Applied, AssistAction, AssistContext, AssistCustomer, AssistMatch, AssistResult, AssistUnmatched } from "@/lib/assist";
import type { QuoteLine } from "@/lib/types";
import { productThumbs, shrinkFile as shrink } from "@/lib/image";
import { accessToken } from "@/lib/supabase";
import { btnGhost, btnPrimary, focusIfMouse, IconCheck, IconPlus, IconUpload, IconWarn, IconX, labelCls, useScrollLock } from "./ui";

/** What a set of AI actions would do to the quotation, worked out without changing it. */
export type Plan = {
  done: Applied;
  lines: { line: QuoteLine; amount: number }[]; // the new lines, priced as they would go in
  subtotal: number; // of the new lines
  priceList: string; // name
};

/** What one Add with AI read and what went on the quotation, so the quotation can remember the customer's message. */
export type ImportInfo = {
  text: string; // what was typed or pasted
  images: string[];
  sourceText: string; // the order as the AI read it off a screenshot
  added: number;
  missed: string[]; // lines asked for that are not in the product list
  photoMatched: boolean; // a product photo (not a chat screenshot) was matched
  customer?: AssistCustomer; // who sent it, when the message shows it
};

/** One AI answer waiting for "Add": the actions can still be changed (drop a line, take a closest product, swap a photo match). */
type Review = {
  text: string;
  images: string[];
  sourceText: string;
  actions: AssistAction[];
  unmatched: AssistUnmatched[];
  matches: AssistMatch[];
  customer?: AssistCustomer;
};

/** Things to try on the sample products, once an order is on the quotation. */
const EXAMPLES = ["change CS-RG61 to 120", "remove the power bank", "use dealer prices"];

const label = (id: string) => {
  const p = getProduct(id);
  return p ? productLabel(p) : id;
};

/** "Reading your message", then "Matching products" after a few seconds, so a long AI call never looks stuck. */
function Working({ withPhoto }: { withPhoto: boolean }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const steps = withPhoto ? ["Looking at the photo", "Comparing it with your products", "Almost there"] : ["Reading the message", "Matching products and prices", "Almost there"];
  const text = t < 3 ? steps[0] : t < 9 ? steps[1] : steps[2];
  return (
    <div className="flex items-center gap-2.5 rounded-[12px] bg-[var(--q-accent-soft)] px-3 py-3 text-[13px] font-semibold text-[var(--q-accent)]" role="status">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--q-accent)]" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </span>
      {text}
      {t >= 3 && <span className="q-mono ml-auto text-[11.5px] font-normal text-[var(--q-text-3)]">{t}s</span>}
    </div>
  );
}

function Pic({ id, size = 30 }: { id: string; size?: number }) {
  const p = getProduct(id);
  return p?.photo ? (
    <img src={p.photo} alt="" width={size} height={size} className="shrink-0 rounded-[6px] border border-[var(--q-border)] bg-white object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="shrink-0 rounded-[6px] border border-dashed border-[var(--q-border-strong)]" style={{ width: size, height: size }} />
  );
}

/** What went on the quotation last time, in one line. */
function doneText(d: Applied): string {
  const parts = [
    d.added.length && `Added ${d.added.length} item${d.added.length === 1 ? "" : "s"}`,
    d.changed.length && `changed ${d.changed.length}`,
    d.removed.length && `removed ${d.removed.length}`,
    d.priceList && `${d.priceList} prices`,
  ].filter(Boolean) as string[];
  const t = parts.join(", ");
  return t ? t[0].toUpperCase() + t.slice(1) : "Nothing changed";
}

export default function Assistant({
  open,
  anchor,
  currency,
  onClose,
  getContext,
  onPlan,
  onActions,
  onImported,
  autoSend,
  onAutoSent,
}: {
  open: boolean;
  /** the button and its box: clicks there do not count as "outside" */
  anchor: RefObject<HTMLElement | null>;
  currency: string;
  onClose: () => void;
  getContext: () => Omit<AssistContext, "history" | "thumbs">;
  onPlan: (actions: AssistAction[]) => Plan;
  onActions: (actions: AssistAction[]) => Applied;
  onImported?: (info: ImportInfo) => void;
  /** An order handed over from the quotation list: read once, as soon as the panel opens. */
  autoSend?: { text: string; images: string[] } | null;
  onAutoSent?: () => void;
}) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyShots, setBusyShots] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [last, setLast] = useState<Applied | null>(null);
  const [note, setNote] = useState("");
  const history = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<string[]>([]);
  imagesRef.current = images;
  const [maxH, setMaxH] = useState<number | null>(null);

  // computer: the popover hangs under its button and must end on screen, so its Add button is always in view.
  // Too little room under the button: scroll the page up first.
  useLayoutEffect(() => {
    if (!open) return;
    const fit = () => {
      const el = anchor.current;
      if (!el || !window.matchMedia("(min-width: 1024px)").matches) return setMaxH(null);
      let r = el.getBoundingClientRect();
      const want = 640;
      const room = window.innerHeight - r.bottom - 24;
      if (room < want && r.top > 90) {
        window.scrollBy({ top: Math.min(r.top - 80, want - room) });
        r = el.getBoundingClientRect();
      }
      setMaxH(Math.max(320, window.innerHeight - r.bottom - 24));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => focusIfMouse(inputRef.current), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // computer: a click outside the popover closes it (the phone sheet has its own backdrop)
    const away = (e: PointerEvent) => {
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      if (anchor.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", away);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", away);
    };
  }, [open, onClose, anchor]);

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    const room = 4 - imagesRef.current.length;
    if (room <= 0) return;
    const shrunk = await Promise.all(list.slice(0, room).map((f) => shrink(f)));
    setImages((x) => [...x, ...shrunk].slice(0, 4));
    focusIfMouse(inputRef.current);
  }

  // Ctrl+V anywhere while the panel is open (the text box has its own handler, skip it here)
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      if (e.target === inputRef.current) return;
      const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // an order handed over from the list goes out once, the moment the panel is open
  const autoDone = useRef(false);
  useEffect(() => {
    if (!open || !autoSend || autoDone.current) return;
    autoDone.current = true;
    onAutoSent?.();
    void send(autoSend.text, autoSend.images);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoSend]);

  async function send(message: string, imgs: string[] = images) {
    const m = message.trim();
    if ((!m && imgs.length === 0) || busy) return;
    setBusy(true);
    setBusyShots(imgs);
    setNote("");
    setReview(null);
    try {
      const token = await accessToken();
      const res = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        // product pictures only go along when there is a photo to compare them with
        body: JSON.stringify({ message: m, images: imgs, context: { ...getContext(), history: history.current.slice(-6), thumbs: imgs.length ? await productThumbs(products.all()) : undefined } }),
      });
      const data = (await res.json()) as AssistResult & { error?: string };
      if (!res.ok || data.error) {
        setNote(data.error || "Something went wrong. Try again.");
        return;
      }
      history.current.push({ role: "user", content: m || "Photo" }, { role: "assistant", content: data.reply || "" });
      setText("");
      setImages([]);
      const who = data.customer && (data.customer.id || data.customer.name || data.customer.contact || data.customer.tel) ? data.customer : undefined;
      const matches = data.matches || [];
      const adds = data.actions.some((a) => a.type === "add");
      // a small change ("change CS-RG61 to 120") or a question back: no list to check, it goes straight on
      if (!adds && data.unmatched.length === 0 && matches.length === 0 && !who) {
        if (data.actions.length) setLast(onActions(data.actions));
        else setNote(data.reply || "Nothing to change.");
        return;
      }
      setReview({ text: m, images: imgs, sourceText: data.source_text || "", actions: data.actions, unmatched: data.unmatched, matches, customer: who });
    } catch {
      setNote("Could not reach the AI service. Check the internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  const plan = useMemo(() => (review ? onPlan(review.actions) : null), [review, onPlan]);

  /** the add actions that would really add a line, in order, next to the line each one makes */
  const rows = useMemo(() => {
    if (!review || !plan) return [];
    const out: { i: number; productId: string; line: QuoteLine; amount: number }[] = [];
    let k = 0;
    review.actions.forEach((a, i) => {
      if (a.type !== "add" || !getProduct(a.productId)) return;
      const l = plan.lines[k++];
      if (l) out.push({ i, productId: a.productId, ...l });
    });
    return out;
  }, [review, plan]);

  function edit(fn: (r: Review) => Review) {
    setReview((r) => (r ? fn(r) : r));
  }
  const dropAction = (i: number) => edit((r) => ({ ...r, actions: r.actions.filter((_, j) => j !== i) }));
  const takeSuggestion = (j: number, id: string) =>
    edit((r) => ({ ...r, actions: [...r.actions, { type: "add", productId: id, qty: r.unmatched[j].qty }], unmatched: r.unmatched.filter((_, x) => x !== j) }));
  const swapPhoto = (k: number, to: string) =>
    edit((r) => {
      const mt = r.matches[k];
      let swapped = false;
      const actions = r.actions.map((a) => {
        if (!swapped && mt.productId && a.type === "add" && a.productId === mt.productId) {
          swapped = true;
          return { ...a, productId: to };
        }
        return a;
      });
      if (!swapped) actions.push({ type: "add", productId: to, qty: mt.qty || 1 });
      return { ...r, actions, matches: r.matches.map((x, j) => (j === k ? { ...x, productId: to, alternatives: x.alternatives.filter((a) => a !== to) } : x)) };
    });

  function confirm() {
    if (!review) return;
    const applied = onActions(review.actions);
    const missed = [
      ...review.unmatched.map((u) => (u.qty > 1 ? `${u.qty} ${u.text}` : u.text)),
      ...(review.sourceText ? [] : review.matches.filter((x) => !x.productId).map((x) => `Photo ${x.photo}`)),
    ];
    if (applied.added.length > 0 || missed.length > 0 || review.customer)
      onImported?.({
        text: review.text,
        images: review.images,
        sourceText: review.sourceText,
        added: applied.added.length,
        missed,
        photoMatched: review.matches.some((x) => x.productId),
        customer: review.customer,
      });
    setLast(applied);
    setReview(null);
  }

  useScrollLock(open);
  if (!open) return null;

  const missingPhotos = review && !review.sourceText ? review.matches.filter((x) => !x.productId) : [];
  const askedFor = rows.length + (review?.unmatched.length ?? 0) + missingPhotos.length;
  const allMatched = review ? review.unmatched.length === 0 && missingPhotos.length === 0 : true;
  const nAdd = plan?.done.added.length ?? 0;
  const nOther = plan ? plan.done.changed.length + plan.done.removed.length + (plan.done.priceList ? 1 : 0) : 0;
  const shots = review?.images ?? [];

  return (
    <>
      <button type="button" aria-label="Close Add with AI" className="fixed inset-0 z-40 bg-[#0D1B3E]/35 lg:hidden" onClick={onClose} />
      <section
        role="dialog"
        aria-label="Add with AI"
        style={maxH ? { maxHeight: maxH } : undefined}
        className="q-popover q-ai-pop fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-[22px] text-left lg:absolute lg:inset-x-auto lg:bottom-auto lg:right-0 lg:top-[calc(100%+10px)] lg:z-40 lg:max-h-[min(700px,calc(100vh-150px))] lg:w-[400px] lg:rounded-[18px]"
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
          if (e.dataTransfer?.files?.length) void addFiles(e.dataTransfer.files);
        }}
      >
        <span aria-hidden="true" className="absolute -top-[7px] right-[56px] hidden h-3 w-3 rotate-45 border-l border-t border-[var(--q-border-strong)] bg-white lg:block" />
        {dragging && (
          <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-[14px] border-2 border-dashed border-[var(--q-accent)] bg-[var(--q-accent-soft)]/95 text-[14px] font-semibold text-[var(--q-accent)]">
            Drop the screenshot here
          </div>
        )}

        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          <b className="flex-1 text-[15px] text-[var(--q-text)]">Add with AI</b>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--q-text-3)] hover:bg-[var(--q-chip-bg)] hover:text-[var(--q-text)]" aria-label="Close">
            <IconX size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4">
          {busy && (
            <>
              {busyShots.length > 0 && (
                <div className="flex gap-1.5">
                  {busyShots.map((src, i) => (
                    <img key={i} src={src} alt="" className="h-[52px] w-[40px] rounded-[7px] border border-[var(--q-border-strong)] object-cover object-bottom" />
                  ))}
                </div>
              )}
              <Working withPhoto={busyShots.length > 0} />
            </>
          )}

          {!busy && review && plan && (
            <>
              <div className="flex items-center gap-2.5 rounded-[12px] border-[1.5px] border-dashed border-[var(--q-ai-border)] bg-[linear-gradient(135deg,#F7F9FF,#EEF3FF)] px-2 py-1.5">
                {shots.length > 0 ? (
                  shots.slice(0, 3).map((src, i) => <img key={i} src={src} alt="" className="h-[40px] w-[32px] rounded-[7px] border border-[var(--q-border-strong)] object-cover object-bottom" />)
                ) : (
                  <span className="flex h-[40px] w-[32px] items-center justify-center rounded-[7px] border border-[var(--q-border-strong)] bg-white text-[var(--q-accent)]">
                    <IconPlus size={12} />
                  </span>
                )}
                <span className="min-w-0 flex-1 text-[13px] leading-tight">
                  <b className="block text-[var(--q-text)]">{shots.length ? (review.sourceText ? "WhatsApp screenshot" : "Product photo") : "Message"}</b>
                  <span className="block truncate text-[var(--q-text-3)]">{shots.length ? `${shots.length} photo${shots.length === 1 ? "" : "s"}` : review.text}</span>
                </span>
                <button className="px-1 text-[13px] font-semibold text-[var(--q-accent)] hover:underline" onClick={() => setReview(null)}>
                  Change
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[13px]">
                <div className="min-w-0 rounded-[10px] border border-[var(--q-border)] px-2.5 py-2">
                  <span className={`${labelCls} !mb-0.5`}>Customer</span>
                  {review.customer ? (
                    <>
                      <b className="block break-words text-[var(--q-text)]">{review.customer.name || review.customer.contact}</b>
                      <span className={`text-[12px] font-semibold ${review.customer.id ? "text-[var(--q-ok)]" : "text-[var(--q-accent)]"}`}>{review.customer.id ? "In Customers" : "New customer"}</span>
                    </>
                  ) : (
                    <span className="text-[var(--q-text-3)]">Not in the message</span>
                  )}
                </div>
                <div className="min-w-0 rounded-[10px] border border-[var(--q-border)] px-2.5 py-2">
                  <span className={`${labelCls} !mb-0.5`}>Price list</span>
                  <b className="block break-words text-[var(--q-text)]">{plan.priceList}</b>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className={`${labelCls} !mb-0`}>Items</span>
                {askedFor > 0 && (
                  <span
                    className={`inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[11.5px] font-bold ${allMatched ? "bg-[var(--q-ok-soft)] text-[var(--q-ok)]" : "bg-[var(--q-danger-bg)] text-[var(--q-danger)]"}`}
                  >
                    {allMatched ? <IconCheck size={11} /> : <IconWarn size={12} />}
                    {rows.length} of {askedFor} matched
                  </span>
                )}
              </div>

              <div className="-mt-1 flex flex-col">
                {rows.map((r) => {
                  const k = review.matches.findIndex((m) => m.productId === r.productId);
                  const mt = k >= 0 ? review.matches[k] : undefined;
                  return (
                    <div key={r.i} className="group border-b border-[var(--q-border)] py-2 last:border-0">
                      <div className="flex items-center gap-2.5">
                        <Pic id={r.productId} />
                        <span className="min-w-0 flex-1 leading-[1.3]">
                          <b className="block text-[13px] font-semibold text-[var(--q-text)]">{r.line.name}</b>
                          <span className="q-mono text-[11.5px] text-[var(--q-text-3)]">
                            {[r.line.variant || r.line.code, `${fmtQty(r.line.qty)} × ${fmtMoney(r.line.unitPrice)}`].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="q-mono shrink-0 text-[13px] font-semibold text-[var(--q-text)]">{fmtMoney(r.amount)}</span>
                        <button
                          onClick={() => dropAction(r.i)}
                          aria-label={`Leave out ${r.line.name}`}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-[var(--q-text-3)] hover:bg-[var(--q-danger-bg)] hover:text-[var(--q-danger)]"
                        >
                          <IconX size={13} />
                        </button>
                      </div>
                      {mt && mt.alternatives.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-10">
                          <span className="text-[11.5px] text-[var(--q-text-3)]">Not this one?</span>
                          {mt.alternatives.map((id) => (
                            <button key={id} onClick={() => swapPhoto(k, id)} className="flex items-center gap-1 rounded-[7px] border border-[var(--q-border-strong)] bg-white px-1.5 py-0.5 text-[11.5px] text-[var(--q-text)] hover:border-[var(--q-accent)]">
                              <Pic id={id} size={16} />
                              {label(id)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {plan.done.changed.map((c, i) => (
                  <div key={`c${i}`} className="flex items-center gap-2.5 border-b border-[var(--q-border)] py-2 last:border-0">
                    <Pic id={c.productId} />
                    <span className="min-w-0 flex-1 text-[13px] leading-[1.3] text-[var(--q-text)]">{label(c.productId)}</span>
                    <span className="q-mono shrink-0 text-[12.5px] text-[var(--q-accent)]">Qty → {fmtQty(c.qty)}</span>
                  </div>
                ))}
                {plan.done.removed.map((id, i) => (
                  <div key={`r${i}`} className="flex items-center gap-2.5 border-b border-[var(--q-border)] py-2 last:border-0">
                    <Pic id={id} />
                    <span className="min-w-0 flex-1 text-[13px] leading-[1.3] text-[var(--q-text-3)] line-through">{label(id)}</span>
                    <span className="shrink-0 text-[12px] font-semibold text-[var(--q-danger)]">Remove</span>
                  </div>
                ))}

                {review.unmatched.map((u, j) => (
                  <div key={`u${j}`} className="border-b border-[var(--q-border)] py-2 last:border-0">
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[6px] bg-[var(--q-danger-bg)] text-[var(--q-danger)]">
                        <IconWarn size={15} />
                      </span>
                      <span className="min-w-0 flex-1 leading-[1.3]">
                        <b className="block text-[13px] font-semibold text-[var(--q-text)] break-words">{u.text}</b>
                        <span className="text-[11.5px] font-semibold text-[var(--q-danger)]">Needs a look · {fmtQty(u.qty)} asked</span>
                      </span>
                    </div>
                    {u.suggestions.length > 0 && (
                      <div className="mt-1.5 flex flex-col gap-1 pl-10">
                        <span className="text-[11.5px] text-[var(--q-text-3)]">Closest we have</span>
                        {u.suggestions.map((id) =>
                          getProduct(id) ? (
                            <button key={id} onClick={() => takeSuggestion(j, id)} className="flex items-center gap-1.5 rounded-[8px] border border-[var(--q-border-strong)] bg-white px-2 py-1 text-left text-[12px] text-[var(--q-text)] hover:border-[var(--q-accent)]">
                              <IconPlus size={11} />
                              <span className="min-w-0 flex-1">{label(id)}</span>
                            </button>
                          ) : null,
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {missingPhotos.map((mt) => {
                  const k = review.matches.indexOf(mt);
                  return (
                    <div key={`p${k}`} className="border-b border-[var(--q-border)] py-2 last:border-0">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[6px] bg-[var(--q-danger-bg)] text-[var(--q-danger)]">
                          <IconWarn size={15} />
                        </span>
                        <span className="min-w-0 flex-1 text-[13px] leading-[1.3]">
                          <b className="block font-semibold text-[var(--q-text)]">Photo {mt.photo}</b>
                          <span className="text-[11.5px] font-semibold text-[var(--q-danger)]">Needs a look · no match</span>
                        </span>
                      </div>
                      {mt.alternatives.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-10">
                          <span className="text-[11.5px] text-[var(--q-text-3)]">Maybe</span>
                          {mt.alternatives.map((id) => (
                            <button key={id} onClick={() => swapPhoto(k, id)} className="flex items-center gap-1 rounded-[7px] border border-[var(--q-border-strong)] bg-white px-1.5 py-0.5 text-[11.5px] text-[var(--q-text)] hover:border-[var(--q-accent)]">
                              <Pic id={id} size={16} />
                              {label(id)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {askedFor === 0 && nOther === 0 && <div className="py-2 text-[13px] text-[var(--q-text-3)]">Nothing found to add</div>}
              </div>
            </>
          )}

          {!busy && !review && (
            <>
              {last && (
                <div className="flex items-center gap-2 rounded-[12px] bg-[var(--q-ok-soft)] px-3 py-2.5 text-[13px] font-semibold text-[var(--q-ok)]">
                  <IconCheck size={13} />
                  {doneText(last)}
                </div>
              )}
              {note && <div className="whitespace-pre-wrap rounded-[12px] bg-[var(--q-accent-soft)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--q-text)]">{note}</div>}

              {images.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {images.map((src, i) => (
                    <span key={i} className="relative">
                      <img src={src} alt="" className="h-[84px] w-[64px] rounded-[10px] border border-[var(--q-border-strong)] object-cover object-bottom" />
                      <button
                        onClick={() => setImages((x) => x.filter((_, j) => j !== i))}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--q-text)] text-white"
                        aria-label="Remove photo"
                      >
                        <IconX size={10} />
                      </button>
                    </span>
                  ))}
                  {images.length < 4 && (
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex h-[84px] w-[64px] items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-[var(--q-ai-border)] bg-[var(--q-accent-soft)] text-[var(--q-accent)]"
                      aria-label="Add another photo"
                    >
                      <IconPlus size={16} />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex min-h-[112px] flex-col items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-[var(--q-ai-border)] bg-[linear-gradient(135deg,#FFFFFF,#EEF3FF)] px-3 text-[13.5px] font-semibold text-[var(--q-accent)] hover:border-[var(--q-accent)]"
                >
                  <IconUpload size={22} />
                  Drop, paste or choose screenshots
                  <span className="text-[12px] font-normal text-[var(--q-text-3)]">WhatsApp chat or product photo</span>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />

              <label className="block">
                <span className="mb-1.5 flex items-center justify-between">
                  <span className={`${labelCls} !mb-0`}>{last ? "Change something" : "Message"}</span>
                  {!last && <span className="text-[11.5px] text-[var(--q-text-3)]">Optional</span>}
                </span>
                <textarea
                  ref={inputRef}
                  rows={3}
                  aria-label={last ? "Change something" : "Order message"}
                  className="w-full resize-none rounded-[10px] border border-[var(--q-border-strong)] bg-white px-3 py-2 text-[13.5px] text-[var(--q-text)] outline-none focus:border-[var(--q-accent)] focus:ring-[3px] focus:ring-[var(--q-ring)]"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onPaste={(e) => {
                    const files = Array.from(e.clipboardData?.files || []);
                    if (files.length) {
                      e.preventDefault();
                      void addFiles(files);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(text);
                    }
                  }}
                />
              </label>
              {hasSample() && (
                <div className="flex flex-wrap gap-1.5">
                  {!last ? (
                    <button
                      onClick={() => {
                        setText(SAMPLE_ORDER);
                        focusIfMouse(inputRef.current);
                      }}
                      className="rounded-full border border-[var(--q-ai-border)] bg-[var(--q-accent-soft)] px-2.5 py-1 text-[12px] font-semibold text-[var(--q-accent)]"
                    >
                      Use sample order
                    </button>
                  ) : (
                    EXAMPLES.map((e) => (
                      <button key={e} onClick={() => void send(e, [])} className="rounded-full border border-[var(--q-border-strong)] bg-white px-2.5 py-1 text-[12px] text-[var(--q-text-2)] hover:border-[var(--q-accent)]">
                        {e}
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {!busy && (
          <div className="border-t border-[var(--q-border)] px-4 py-3">
            {review && plan ? (
              <>
                {nAdd > 0 && (
                  <div className="mb-2.5 flex items-baseline justify-between">
                    <b className="text-[13.5px] text-[var(--q-text)]">Subtotal ({currency})</b>
                    <b className="q-mono text-[18px] font-semibold text-[var(--q-text)]">{fmtMoney(plan.subtotal)}</b>
                  </div>
                )}
                <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
                  <button className={`${btnGhost} max-lg:h-12`} onClick={() => setReview(null)}>
                    Cancel
                  </button>
                  <button className={`${btnPrimary} max-lg:h-12`} disabled={nAdd === 0 && nOther === 0} onClick={confirm}>
                    {nAdd > 0 ? `Add ${nAdd} item${nAdd === 1 ? "" : "s"}` : "Apply changes"}
                  </button>
                </div>
              </>
            ) : (
              <button className={`${btnPrimary} w-full max-lg:h-12`} disabled={!text.trim() && images.length === 0} onClick={() => void send(text)}>
                {last ? "Send" : "Read order"}
              </button>
            )}
          </div>
        )}
      </section>
    </>
  );
}

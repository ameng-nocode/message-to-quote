import { NextResponse } from "next/server";
import type { AssistAction, AssistCustomer, AssistMatch, AssistRequest, AssistResult, CatalogItem } from "@/lib/assist";
import { cleanQty, round2 } from "@/lib/quote";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Providers are tried in order; any one key is enough. When one has no credit or is rate limited (401/402/403/429/5xx), the next one answers.
    Change the order with ASSIST_PROVIDERS="gemini,openai,openrouter" and a model with ASSIST_MODEL_OPENAI and friends. */
type Provider = { name: string; endpoint: string; keyName: string; model: string; openaiDetail: boolean; extra: Record<string, unknown> };
const ALL: Record<string, Provider> = {
  openai: { name: "openai", endpoint: "https://api.openai.com/v1/chat/completions", keyName: "OPENAI_API_KEY", model: process.env.ASSIST_MODEL_OPENAI || "gpt-4.1-mini", openaiDetail: true, extra: {} },
  gemini: {
    name: "gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keyName: "GEMINI_API_KEY",
    model: process.env.ASSIST_MODEL_GEMINI || "gemini-2.5-flash",
    openaiDetail: false,
    // Gemini 2.5 "thinks" inside the same token budget as the answer; keep thinking short or long orders come back cut off
    extra: { reasoning_effort: "low" },
  },
  openrouter: {
    name: "openrouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    keyName: "OPENROUTER_API_KEY",
    model: process.env.ASSIST_MODEL_OPENROUTER || "google/gemini-2.5-flash",
    openaiDetail: false,
    extra: { reasoning: { effort: "low" } },
  },
};
const ORDER = (process.env.ASSIST_PROVIDERS || "openai,gemini,openrouter")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => ALL[s]);

const apiKey = (keyName: string) => (process.env[keyName] || "").trim() || null;

/** Cap each person: this many AI calls per hour, per signed-in account in Supabase mode, per IP in browser mode (per server instance). */
const LIMIT_PER_HOUR = Number(process.env.ASSIST_LIMIT_PER_HOUR || 40);
const hits = new Map<string, number[]>();
function overLimit(who: string): boolean {
  const now = Date.now();
  const list = (hits.get(who) || []).filter((t) => now - t < 3_600_000);
  if (list.length >= LIMIT_PER_HOUR) {
    hits.set(who, list);
    return true;
  }
  list.push(now);
  hits.set(who, list);
  if (hits.size > 5000) hits.clear();
  return false;
}

const MAX_PRODUCTS = 3000;
const cut = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
// sizes as "6.1 inch", never with the " mark: a stray " inside a JSON string breaks the answer
const inch = (s: string) => s.replace(/(\d)"/g, "$1 inch");

function cleanCatalog(raw: unknown): CatalogItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_PRODUCTS).flatMap((p) => {
    const id = cut(p?.id, 80);
    if (!id) return [];
    return [{ id, code: cut(p.code, 60), name: cut(p.name, 160), variant: cut(p.variant, 80), category: cut(p.category, 80), unit: cut(p.unit, 20), description: cut(p.description, 200) }];
  });
}

function rules(catalog: CatalogItem[], priceLists: string[]) {
  const lines = catalog.map((p) => inch([p.id, p.code, p.name, p.variant, p.category, p.unit, p.description].join(" | "))).join("\n");
  return `You help the sales team of a business build a quotation from what a customer sent. The user types or pastes the order in plain words: product codes, product names, variants (colour, size, flavour and so on), quantities, sometimes prices, in any language. The user may also attach photos: a product photo, or a screenshot of a chat or a written order. Turn all of it into actions on the quotation.

Product list (id | code | name | variant | category | unit | description):
${lines || "(the product list is empty)"}

Rules for text:
- Match each requested item to ONE product id. Match on the code first (case, spaces and dashes do not matter), then on the product name, then on the variant words. If a product exists in several variants and the user gives no variant, pick the first one listed and say which one you picked in the reply.
- Plain names ("clear case", "power bank", "cleaning service") map to the product of that kind. When a needed detail like size is missing, pick the closest and say so.
- If nothing in the product list matches, do not invent an id and do not swap in a different product. Put it in "unmatched" with up to 3 closest product ids as suggestions ("text" is the item as asked, without the quantity; the quantity goes in "qty"). A brand or model the product list does not have is unmatched, even if a similar generic product exists.
- Quantities: "x 96", "96 pcs", "96 units", "96 sets", "qty 96", "96 of", "96pcs" all mean qty 96. Quantities can have decimals for things sold by weight, length or time ("2.5kg", "1.5 hours"). If no quantity is given, use 1 and say so.
- Prices: only set unitPrice when the user states a price for that item. Otherwise leave it out. The app fills the price from the price list.
- Use "set_qty" to change the quantity of an item already on the quotation, "remove" to delete an item, and "set_price_list" when the user or customer asks for a price type. The price lists are: ${priceLists.join(", ")}. "wholesale price", "dealer price", "harga wholesale", "批发价" and so on map to those names; use the name exactly as written here. Never use a price list that is not in this list. Do not mention the price list unless it was asked for.

Rules for photos:
- A photo may be a screenshot of a chat (WhatsApp and the like) or a written order instead of a product photo. Then read the order off it and treat that text exactly like typed text: every rule above applies. Give such a photo NO entry in "matches". Copy the customer's order, as written on the screenshot (their lines only, not the seller's replies), into "source_text", at most 600 characters. A product photo inside the chat is still a product photo.
- Each uploaded product photo is a product the user wants. Find the product that is the same. First look for a code or product name printed on the photo. If there is none, compare the photo with the product pictures: same kind of product, same shape, same colour.
- For every product photo give ONE best match in "matches" with a confidence from 0 to 1, plus up to 3 alternatives. Add an "add" action for the best match with the quantity the user gave for that photo (1 if none). If nothing looks like the photo, set productId to null and confidence 0, and do not add anything for it.
- If the user gives one quantity and one photo, that quantity belongs to the photo. If several photos and several quantities, pair them in order. A quantity written on the photo itself next to the product counts too. Text typed by the user wins over text on the photo.

Who sent the order:
- When the message or screenshot is a customer's order, work out who sent it from the chat header name, a phone number shown for an unsaved contact, a signature, or a company name or town in the text. The saved customers are listed with the user's message. If the sender is clearly one of them (the same company, or the same person with a matching company, town or phone number), put that id in "customer.id". Otherwise "customer.id" is null and fill "customer.name" (the company, only if one is named), "customer.contact" (the person, without "Attn"), "customer.tel" (a phone number, only if one is shown), "customer.address1" (street, building or unit), "customer.address2" (postcode, town and state), "customer.email" and "customer.regNo" (the company registration number), each only if the message shows it. Fix obvious capitalisation in names and addresses (abc sdn bhd -> ABC Sdn Bhd) but never change the words or numbers. When nothing points to a sender, for example the user is only changing the quotation, leave them all empty. Never invent a name.

The reply is 1 to 3 short plain sentences: what you added or changed, which product each photo matched and how sure you are, and what you could not find. No markdown, no lists. Keep every "note" under 15 words. Write sizes as 6.1 inch, never with the " mark, so the JSON stays valid.

Return ONLY a JSON object, no code fences:
{"reply": string, "source_text": string, "customer": {"id": string|null, "name": string, "contact": string, "tel": string, "address1": string, "address2": string, "email": string, "regNo": string}, "actions": [ {"type":"add","productId":string,"qty":number,"unitPrice"?:number} | {"type":"set_qty","productId":string,"qty":number} | {"type":"remove","productId":string} | {"type":"set_price_list","priceList":string} ], "unmatched": [ {"text":string,"qty":number,"suggestions":string[]} ], "matches": [ {"photo":number,"productId":string|null,"confidence":number,"qty":number,"alternatives":string[],"note":string} ]}`;
}

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };
type Msg = { role: string; content: string | Part[] };
type Ctx = AssistRequest["context"];

function buildMessages(msg: string, images: string[], context: Ctx, catalog: CatalogItem[], withDetail: boolean): Msg[] {
  const linesText =
    !(context.lines || []).length
      ? "The quotation has no lines yet."
      : "Lines already on the quotation:\n" + (context.lines || []).map((l, i) => `${i + 1}. ${cut(l.productId, 80)} qty ${Number(l.qty) || 0} unit price ${Number(l.unitPrice) || 0}`).join("\n");
  const img = (url: string, detail: "low" | "high"): Part => ({ type: "image_url", image_url: withDetail ? { url, detail } : { url } });
  const saved = (context.customers || []).slice(0, 300);
  const customersText = saved.length
    ? "Saved customers (id | company | contact | phone | town):\n" + saved.map((c) => [c.id, c.name, c.contact, c.tel, c.town].map((v) => cut(v, 120)).join(" | ")).join("\n")
    : "No saved customers yet.";
  const userParts: Part[] = [{ type: "text", text: `Current price list: ${cut(context.priceList, 60)}\n${linesText}\n\n${customersText}\n\nUser says:\n${msg || "(no text, only photos)"}` }];
  if (images.length) {
    images.forEach((url, i) => {
      userParts.push({ type: "text", text: `Uploaded photo ${i + 1}:` });
      userParts.push(img(url, "high"));
    });
    const byId = new Map(catalog.map((p) => [p.id, p]));
    const thumbs = (context.thumbs || []).filter((t) => byId.has(t.id) && /^data:image\/(jpeg|png|webp);base64,/.test(t.src) && t.src.length < 60_000).slice(0, 300);
    if (thumbs.length) {
      userParts.push({ type: "text", text: "Product pictures follow. Each one is labelled with its id." });
      for (const t of thumbs) {
        const p = byId.get(t.id)!;
        userParts.push({ type: "text", text: `id ${p.id} (${[p.code, p.name, p.variant].filter(Boolean).join(", ")}):` });
        userParts.push(img(t.src, "low"));
      }
    }
  }
  return [
    { role: "system", content: rules(catalog, context.priceLists) },
    ...(context.history || []).slice(-6).map((h) => ({ role: h.role === "assistant" ? "assistant" : "user", content: String(h.content || "").slice(0, 2000) })),
    { role: "user", content: userParts },
  ];
}

/** Ask the providers in turn. Returns the raw answer text and who answered, or the last error. */
async function ask(messages: (withDetail: boolean) => Msg[]): Promise<{ raw: string; provider: string } | { error: string; status: number }> {
  let last: { error: string; status: number } = { error: "No AI key on the server. Add OPENAI_API_KEY, GEMINI_API_KEY or OPENROUTER_API_KEY to .env and restart.", status: 500 };
  for (const name of ORDER) {
    const prov = ALL[name];
    const key = apiKey(prov.keyName);
    if (!key) continue;
    const headers: Record<string, string> = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
    if (name === "openrouter") headers["X-Title"] = "message-to-quote";
    try {
      const r = await fetch(prov.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: prov.model, temperature: 0, max_tokens: 8000, response_format: { type: "json_object" }, ...prov.extra, messages: messages(prov.openaiDetail) }),
      });
      if (r.ok) {
        const data = await r.json();
        const raw: string = typeof data?.choices?.[0]?.message?.content === "string" ? data.choices[0].message.content : "";
        const finish = data?.choices?.[0]?.finish_reason;
        if (finish && finish !== "stop") console.error(`assist: ${name} finish_reason ${finish}, ${raw.length} chars`);
        if (raw) return { raw, provider: name };
        last = { error: "Empty answer from the AI service.", status: 502 };
        continue;
      }
      const t = await r.text();
      console.error(`assist: ${name} said ${r.status}`, t.slice(0, 300));
      last = { error: `AI service said ${r.status}. Try again in a moment.`, status: 502 };
      // no credit, bad key, or rate limited: the next provider gets a go. Anything else is our request's fault, stop.
      if (![401, 402, 403, 429, 500, 502, 503, 529].includes(r.status)) break;
    } catch (e) {
      console.error(`assist: ${name} unreachable`, String(e).slice(0, 200));
      last = { error: "Could not reach the AI service.", status: 502 };
    }
  }
  return last;
}

/** The model's JSON, tolerating code fences and a stray inch mark (6.7" Brown), else null. */
function readAnswer(raw: string): AssistResult | null {
  const bare = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const inner = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  const repaired = inner.replace(/(\d)"(?=\s*[A-Za-z(])/g, "$1 inch");
  for (const candidate of [bare, inner, repaired]) {
    try {
      return JSON.parse(candidate) as AssistResult;
    } catch {
      /* try the next shape */
    }
  }
  return null;
}

/** Supabase mode: only signed-in members of the company may use the AI key. Browser mode has no accounts, so anyone who can open the app can. */
const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
/** Supabase mode: the caller must be a signed-in member. Gives back who it is (for the hourly limit), or null.
    The database checks the token's signature in is_member, so the account id read from it afterwards can be trusted. */
async function member(req: Request): Promise<string | null> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/is_member`, { method: "POST", headers: { apikey: SB_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
    if (!r.ok || (await r.json()) !== true) return null;
    const claims = JSON.parse(Buffer.from(token.split(".")[1] || "", "base64url").toString("utf8")) as { sub?: string };
    return claims.sub ? `user:${claims.sub}` : null;
  } catch {
    return null;
  }
}

/** Browser mode has no login. On a server anyone can open, Add with AI would spend the owner's AI credit for anyone,
    so there it only answers when ALLOW_PUBLIC_AI=1 is set. On this computer or the local network it always answers. */
function localHost(req: Request): boolean {
  const host = (req.headers.get("host") || "").toLowerCase().replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

const MAX_BODY = 8_000_000; // bytes: 4 phone screenshots, shrunk by the browser first, are far below this
const MAX_IMAGE = 3_000_000; // characters of one picture's data URL

export async function POST(req: Request) {
  let who: string;
  if (SB_URL && SB_KEY) {
    const id = await member(req);
    if (!id) return NextResponse.json({ error: "Sign in again: your session has ended." }, { status: 401 });
    who = id;
  } else {
    if (!localHost(req) && process.env.ALLOW_PUBLIC_AI !== "1")
      return NextResponse.json({ error: "This app has no login, so Add with AI only works on the computer it runs on. Set up Supabase login to use it online." }, { status: 403 });
    who = `ip:${(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local"}`;
  }
  if (overLimit(who)) return NextResponse.json({ error: "You have used the AI a lot this hour. Try again a bit later." }, { status: 429 });
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY) return NextResponse.json({ error: "Those photos are too big. Send fewer at once." }, { status: 413 });

  const body = (await req.json().catch(() => null)) as AssistRequest | null;
  if (!body?.context) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { message, context } = body;
  const images = (body.images || []).filter((u) => typeof u === "string" && u.startsWith("data:image/"));
  const msg = (message || "").trim();
  if (!msg && images.length === 0) return NextResponse.json({ error: "Type something or attach a photo." }, { status: 400 });
  if (images.length > 4) return NextResponse.json({ error: "Up to 4 photos at a time." }, { status: 400 });
  if (images.some((u) => u.length > MAX_IMAGE)) return NextResponse.json({ error: "One photo is too big. Try a smaller screenshot." }, { status: 413 });
  if (msg.length > 4000) return NextResponse.json({ error: "That message is too long. Send it in parts." }, { status: 400 });

  const catalog = cleanCatalog(context.catalog);
  if (!catalog.length) return NextResponse.json({ error: "Your product list is empty. Add products first (Products page), then try again." }, { status: 400 });
  const IDS = new Set(catalog.map((p) => p.id));
  const lists = (Array.isArray(context.priceLists) ? context.priceLists : []).map((n) => cut(n, 60)).filter(Boolean).slice(0, 30);
  context.priceLists = lists;

  // One more try when the answer reads an order off a picture but lists nothing at all (no products, nothing unmatched):
  // that is the model skipping the work, not an empty order.
  let parsed: AssistResult | null = null;
  let raw = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await ask((withDetail) => buildMessages(msg, images, context, catalog, withDetail));
    if ("error" in answer) return NextResponse.json({ error: answer.error }, { status: answer.status });
    raw = answer.raw;
    parsed = readAnswer(raw);
    const empty = parsed && !(parsed.actions || []).length && !(parsed.unmatched || []).length && !(parsed.matches || []).some((m) => m.productId);
    if (!(attempt === 0 && images.length > 0 && parsed && empty && String(parsed.source_text || "").trim())) break;
    console.error("assist: order read but nothing listed, asking again");
  }
  if (!parsed) {
    console.error("assist: unreadable answer", raw.slice(0, 500));
    return NextResponse.json({ error: "Could not read the AI answer. Try again, or send fewer photos at once." }, { status: 502 });
  }

  // keep only actions that point at real products / price lists
  const listByKey = new Map(lists.map((n) => [n.toLowerCase(), n]));
  const actions: AssistAction[] = [];
  for (const a of parsed.actions || []) {
    if (a.type === "set_price_list") {
      const name = listByKey.get(String(a.priceList || "").trim().toLowerCase());
      if (name) actions.push({ type: "set_price_list", priceList: name });
    } else if (IDS.has(a.productId)) {
      if (a.type === "add") actions.push({ type: "add", productId: a.productId, qty: cleanQty(a.qty, 1), ...(typeof a.unitPrice === "number" && Number.isFinite(a.unitPrice) && a.unitPrice >= 0 ? { unitPrice: round2(a.unitPrice) } : {}) });
      else if (a.type === "set_qty") actions.push({ type: "set_qty", productId: a.productId, qty: cleanQty(a.qty, 0) });
      else if (a.type === "remove") actions.push({ type: "remove", productId: a.productId });
    }
  }
  const unmatched = (parsed.unmatched || []).map((u) => {
    const qty = cleanQty(u.qty, 1);
    // the model sometimes repeats the quantity inside the text ("30 iPhone case", "iPhone case x 30"): keep the name only
    const text = String(u.text || "")
      .replace(/^\s*(\d+)\s*(?:x|×|pcs|pc|units?)?\s+/i, (m, n) => (Number(n) === qty ? "" : m))
      .replace(/\s*(?:x|×)\s*(\d+)\s*(?:pcs|pc|units?)?\s*$/i, (m, n) => (Number(n) === qty ? "" : m))
      .trim()
      .slice(0, 200);
    return { text, qty, suggestions: (u.suggestions || []).filter((id) => IDS.has(id)).slice(0, 3) };
  });
  const source_text = String(parsed.source_text || "").slice(0, 600);
  const matches: AssistMatch[] = (parsed.matches || []).slice(0, images.length).map((m) => ({
    photo: Math.max(1, Math.round(Number(m.photo) || 1)),
    productId: m.productId && IDS.has(m.productId) ? m.productId : null,
    confidence: Math.min(1, Math.max(0, Number(m.confidence) || 0)),
    qty: cleanQty(m.qty, 1),
    alternatives: (m.alternatives || []).filter((id) => IDS.has(id) && id !== m.productId).slice(0, 3),
    note: String(m.note || "").slice(0, 140),
  }));

  // a chat screenshot is the order, not a product: never report it as an unmatched photo
  const matchesKept = source_text ? matches.filter((m) => m.productId) : matches;
  // the sender: an id only if it is one of the customers we sent, the rest trimmed plain text
  const c = (parsed.customer || {}) as Partial<AssistCustomer>;
  const known = c.id ? (context.customers || []).find((x) => x.id === c.id) : undefined;
  // a recognised customer is named from the saved record, so the answer never shows an id without a name
  const customer: AssistCustomer = {
    id: known ? known.id : null,
    name: known ? known.name : cut(c.name, 120),
    contact: known ? known.contact : cut(c.contact, 80),
    tel: known ? known.tel : cut(c.tel, 40),
    // a saved customer keeps its saved address; these are only used for someone new
    address1: known ? "" : cut(c.address1, 160),
    address2: known ? "" : cut(c.address2, 160),
    email: known ? "" : cut(c.email, 120),
    regNo: known ? "" : cut(c.regNo, 40),
  };
  return NextResponse.json({ reply: String(parsed.reply || "").slice(0, 600), actions, unmatched, matches: matchesKept, source_text, customer } satisfies AssistResult);
}

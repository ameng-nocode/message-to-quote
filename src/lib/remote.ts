"use client";

import { uid, type Persist } from "./collection";
import type { SavedCustomer } from "./customers";
import { shrinkFile } from "./image";
import type { Settings, SettingsPersist } from "./settings";
import { sb } from "./supabase";
import type { Product, Quotation, QuoteLine } from "./types";

/* The Supabase side of every list: rows in, rows out. One table column per field, no JSON blobs. */

/* ---------- pictures: kept in the private "pictures" bucket, shown through signed links ---------- */

const BUCKET = "pictures";
const WEEK = 60 * 60 * 24 * 7;
const SIGNED = new RegExp(`/storage/v1/object/sign/${BUCKET}/([^?]+)`);

/** What goes in the database: "sb:<path>" for our own pictures, anything else as it is. */
function picToDb(url: string): string {
  const m = SIGNED.exec(url || "");
  return m ? `sb:${decodeURIComponent(m[1])}` : url || "";
}

/** Signed links for every "sb:" picture in one go. */
async function signAll(values: string[]): Promise<Map<string, string>> {
  const paths = [...new Set(values.filter((v) => v?.startsWith("sb:")).map((v) => v.slice(3)))];
  const out = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 500) {
    const { data, error } = await sb().storage.from(BUCKET).createSignedUrls(paths.slice(i, i + 500), WEEK);
    if (error) throw error;
    for (const d of data || []) if (d.signedUrl && d.path) out.set(`sb:${d.path}`, d.signedUrl);
  }
  return out;
}
const picFromDb = (v: string, signed: Map<string, string>) => (v?.startsWith("sb:") ? (signed.get(v) ?? "") : v || "");

export async function uploadPicture(file: File, kind: "product" | "logo"): Promise<string> {
  const dataUrl = await shrinkFile(file, kind === "logo" ? 800 : 900, 0.86);
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${kind}/${uid()}.jpg`;
  const { error } = await sb().storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  const { data, error: e2 } = await sb().storage.from(BUCKET).createSignedUrl(path, WEEK);
  if (e2 || !data) throw e2 || new Error("No link for the picture");
  return data.signedUrl;
}

/* ---------- helpers ---------- */

type Row = Record<string, unknown>;

/** Every row of a table. Supabase hands out at most 1000 rows per request, so this pages through. */
async function selectAll(table: string, order: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb().from(table).select("*").order(order).range(from, from + 999);
    if (error) throw error;
    out.push(...(data as Row[]));
    if (!data || data.length < 1000) return out;
  }
}

function chunks<T>(list: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function check<T extends { error: unknown }>(p: PromiseLike<T>): Promise<T> {
  const r = await p;
  if (r.error) throw r.error;
  return r;
}

/** PostgREST "not in" list: ("a","b") */
const inList = (ids: string[]) => `(${ids.map((x) => `"${x.replace(/"/g, '""')}"`).join(",")})`;

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const n = (v: unknown) => Number(v) || 0;

/* ---------- products ---------- */

export const remoteProducts: Persist<Product> = {
  async load() {
    const [rows, prices] = await Promise.all([selectAll("products", "name"), selectAll("product_prices", "product_id")]);
    const byProduct = new Map<string, Record<string, number>>();
    for (const p of prices) {
      const m = byProduct.get(s(p.product_id)) ?? {};
      m[s(p.price_list_id)] = n(p.price);
      byProduct.set(s(p.product_id), m);
    }
    const signed = await signAll(rows.map((r) => s(r.photo)));
    return rows.map((r) => ({
      id: s(r.id),
      code: s(r.code),
      name: s(r.name),
      variant: s(r.variant),
      category: s(r.category),
      unit: s(r.unit),
      price: n(r.price),
      prices: byProduct.get(s(r.id)) ?? {},
      photo: picFromDb(s(r.photo), signed),
      description: s(r.description),
      sample: Boolean(r.is_sample) || undefined,
      createdAt: s(r.created_at),
      updatedAt: s(r.updated_at),
    }));
  },
  async save(list) {
    for (const part of chunks(list)) {
      await check(
        sb()
          .from("products")
          .upsert(
            part.map((p) => ({
              id: p.id,
              code: p.code,
              name: p.name,
              variant: p.variant,
              category: p.category,
              unit: p.unit,
              price: p.price,
              photo: picToDb(p.photo),
              description: p.description,
              is_sample: Boolean(p.sample),
              created_at: p.createdAt || new Date().toISOString(),
              updated_at: p.updatedAt || new Date().toISOString(),
            })),
          ),
      );
      // the prices are replaced as a whole for these products
      await check(
        sb()
          .from("product_prices")
          .delete()
          .in(
            "product_id",
            part.map((p) => p.id),
          ),
      );
      const prices = part.flatMap((p) => Object.entries(p.prices).map(([listId, price]) => ({ product_id: p.id, price_list_id: listId, price })));
      if (prices.length) await check(sb().from("product_prices").insert(prices));
    }
  },
  async remove(ids) {
    for (const part of chunks(ids)) await check(sb().from("products").delete().in("id", part));
  },
};

/* ---------- customers ---------- */

export const remoteCustomers: Persist<SavedCustomer> = {
  async load() {
    const rows = await selectAll("customers", "name");
    return rows.map((r) => ({
      id: s(r.id),
      name: s(r.name),
      contact: s(r.contact),
      tel: s(r.tel),
      email: s(r.email),
      address1: s(r.address1),
      address2: s(r.address2),
      regNo: s(r.reg_no),
      sample: Boolean(r.is_sample) || undefined,
      updatedAt: s(r.updated_at),
    }));
  },
  async save(list) {
    for (const part of chunks(list))
      await check(
        sb()
          .from("customers")
          .upsert(
            part.map((c) => ({
              id: c.id,
              name: c.name,
              contact: c.contact,
              tel: c.tel,
              email: c.email,
              address1: c.address1,
              address2: c.address2,
              reg_no: c.regNo,
              is_sample: Boolean(c.sample),
              updated_at: c.updatedAt || new Date().toISOString(),
            })),
          ),
      );
  },
  async remove(ids) {
    for (const part of chunks(ids)) await check(sb().from("customers").delete().in("id", part));
  },
};

/* ---------- quotations ---------- */

const party = (r: Row, p: "bill" | "ship") => ({
  name: s(r[`${p}_name`]),
  contact: s(r[`${p}_contact`]),
  tel: s(r[`${p}_tel`]),
  email: s(r[`${p}_email`]),
  address1: s(r[`${p}_address1`]),
  address2: s(r[`${p}_address2`]),
  regNo: s(r[`${p}_reg_no`]),
});
const partyRow = (c: Quotation["invoiceTo"], p: "bill" | "ship") => ({
  [`${p}_name`]: c.name,
  [`${p}_contact`]: c.contact,
  [`${p}_tel`]: c.tel,
  [`${p}_email`]: c.email,
  [`${p}_address1`]: c.address1,
  [`${p}_address2`]: c.address2,
  [`${p}_reg_no`]: c.regNo,
});

export const remoteQuotations: Persist<Quotation> = {
  async load() {
    const [rows, lines] = await Promise.all([selectAll("quotations", "date"), selectAll("quote_lines", "position")]);
    const signed = await signAll(lines.map((l) => s(l.photo)));
    const byQuote = new Map<string, QuoteLine[]>();
    for (const l of lines) {
      const list = byQuote.get(s(l.quotation_id)) ?? [];
      list.push({
        id: s(l.id),
        productId: l.product_id ? s(l.product_id) : null,
        code: s(l.code),
        name: s(l.name),
        variant: s(l.variant),
        unit: s(l.unit),
        photo: picFromDb(s(l.photo), signed),
        qty: n(l.qty),
        unitPrice: n(l.unit_price),
        discount: n(l.discount),
        priceList: s(l.price_list) || "custom",
      });
      byQuote.set(s(l.quotation_id), list);
    }
    return rows
      .map((r) => ({
        id: s(r.id),
        number: s(r.number),
        status: (s(r.status) === "Sent" ? "Sent" : "Draft") as Quotation["status"],
        date: s(r.date).slice(0, 10),
        validDays: n(r.valid_days),
        invoiceTo: party(r, "bill"),
        deliveryTo: party(r, "ship"),
        sameDelivery: Boolean(r.same_delivery),
        priceList: s(r.price_list_id) || "standard",
        delivery: s(r.delivery),
        payment: s(r.payment),
        notes: s(r.notes),
        taxRate: n(r.tax_rate),
        lines: byQuote.get(s(r.id)) ?? [],
        source: r.source_kind
          ? {
              kind: s(r.source_kind) as "screenshot" | "photo" | "text",
              text: s(r.source_text),
              image: s(r.source_image) || undefined,
              matched: n(r.source_matched),
              total: n(r.source_total),
              notCarried: (r.source_not_carried as string[] | null) ?? [],
              customer: r.source_customer_name ? { name: s(r.source_customer_name), matched: Boolean(r.source_customer_matched) } : undefined,
              at: s(r.source_at),
            }
          : undefined,
        sample: Boolean(r.is_sample) || undefined,
        createdAt: s(r.created_at),
        updatedAt: s(r.updated_at),
      }))
      .reverse();
  },
  async save(list) {
    for (const part of chunks(list, 50)) {
      await check(
        sb()
          .from("quotations")
          .upsert(
            part.map((q) => ({
              id: q.id,
              number: q.number,
              status: q.status,
              date: q.date,
              valid_days: q.validDays,
              ...partyRow(q.invoiceTo, "bill"),
              same_delivery: q.sameDelivery,
              ...partyRow(q.deliveryTo, "ship"),
              price_list_id: q.priceList,
              delivery: q.delivery,
              payment: q.payment,
              notes: q.notes,
              tax_rate: q.taxRate,
              source_kind: q.source?.kind ?? null,
              source_text: q.source?.text ?? null,
              source_image: q.source?.image ?? null,
              source_matched: q.source?.matched ?? null,
              source_total: q.source?.total ?? null,
              source_not_carried: q.source?.notCarried ?? null,
              source_customer_name: q.source?.customer?.name ?? null,
              source_customer_matched: q.source?.customer?.matched ?? null,
              source_at: q.source?.at || null,
              is_sample: Boolean(q.sample),
              created_at: q.createdAt || new Date().toISOString(),
              updated_at: q.updatedAt || new Date().toISOString(),
            })),
          ),
      );
      const lines = part.flatMap((q) =>
        q.lines.map((l, i) => ({
          id: l.id,
          quotation_id: q.id,
          position: i,
          product_id: l.productId,
          code: l.code,
          name: l.name,
          variant: l.variant,
          unit: l.unit,
          photo: picToDb(l.photo),
          qty: l.qty,
          unit_price: l.unitPrice,
          discount: l.discount,
          price_list: l.priceList,
        })),
      );
      if (lines.length) await check(sb().from("quote_lines").upsert(lines));
      // lines taken off a quotation
      for (const q of part) {
        const keep = q.lines.map((l) => l.id);
        const del = sb().from("quote_lines").delete().eq("quotation_id", q.id);
        await check(keep.length ? del.not("id", "in", inList(keep)) : del);
      }
    }
  },
  async remove(ids) {
    for (const part of chunks(ids)) await check(sb().from("quotations").delete().in("id", part));
  },
};

/* ---------- settings ---------- */

export const remoteSettings: SettingsPersist = {
  async load() {
    const [{ data: row, error }, lists] = await Promise.all([sb().from("settings").select("*").eq("id", 1).maybeSingle(), selectAll("price_lists", "position")]);
    if (error) throw error;
    const priceLists = lists.map((l) => ({ id: s(l.id), name: s(l.name) }));
    if (!row) return priceLists.length ? { priceLists } : null;
    const signed = await signAll([s(row.company_logo)]);
    return {
      company: {
        name: s(row.company_name),
        regNo: s(row.company_reg_no),
        address: s(row.company_address),
        phone: s(row.company_phone),
        email: s(row.company_email),
        website: s(row.company_website),
        logo: picFromDb(s(row.company_logo), signed),
      },
      currency: s(row.currency),
      quote: {
        title: s(row.quote_title),
        prefix: s(row.quote_prefix),
        validDays: n(row.valid_days),
        delivery: s(row.default_delivery),
        payment: s(row.default_payment),
        notes: s(row.default_notes),
        bank: s(row.bank_details),
        footer: s(row.footer),
        columns: { photo: Boolean(row.show_photo), code: Boolean(row.show_code), unit: Boolean(row.show_unit), discount: Boolean(row.show_discount) },
      },
      tax: { enabled: Boolean(row.tax_enabled), name: s(row.tax_name), rate: n(row.tax_rate) },
      whatsapp: { countryCode: s(row.wa_country_code), message: s(row.wa_message) },
      ...(priceLists.length ? { priceLists } : {}),
    } satisfies Partial<Settings>;
  },
  async save(x) {
    await check(
      sb()
        .from("settings")
        .upsert({
          id: 1,
          company_name: x.company.name,
          company_reg_no: x.company.regNo,
          company_address: x.company.address,
          company_phone: x.company.phone,
          company_email: x.company.email,
          company_website: x.company.website,
          company_logo: picToDb(x.company.logo),
          currency: x.currency,
          quote_title: x.quote.title,
          quote_prefix: x.quote.prefix,
          valid_days: x.quote.validDays,
          default_delivery: x.quote.delivery,
          default_payment: x.quote.payment,
          default_notes: x.quote.notes,
          bank_details: x.quote.bank,
          footer: x.quote.footer,
          show_photo: x.quote.columns.photo,
          show_code: x.quote.columns.code,
          show_unit: x.quote.columns.unit,
          show_discount: x.quote.columns.discount,
          tax_enabled: x.tax.enabled,
          tax_name: x.tax.name,
          tax_rate: x.tax.rate,
          wa_country_code: x.whatsapp.countryCode,
          wa_message: x.whatsapp.message,
          updated_at: new Date().toISOString(),
        }),
    );
    await check(
      sb()
        .from("price_lists")
        .upsert(x.priceLists.map((l, i) => ({ id: l.id, name: l.name, position: i }))),
    );
    await check(
      sb()
        .from("price_lists")
        .delete()
        .not(
          "id",
          "in",
          inList(x.priceLists.map((l) => l.id)),
        ),
    );
  },
};

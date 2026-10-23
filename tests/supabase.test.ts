import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SavedCustomer } from "@/lib/customers";
import type { Settings } from "@/lib/settings";
import type { Product, Quotation } from "@/lib/types";

/* Supabase mode: every field goes into the database and comes back the same.
   Skipped unless you point it at a Supabase project you can write test rows to (a local one is best):

     SUPABASE_TEST=1 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key> npm test

   It signs in with SUPABASE_TEST_EMAIL / SUPABASE_TEST_PASSWORD (a team member), or, on an empty project,
   creates the owner account itself. Its rows have ids starting "test-" and are deleted at the end;
   the settings it changes are put back. */

const ON = process.env.SUPABASE_TEST === "1" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const stamp = Date.now();
const id = (what: string) => `test-${what}-${stamp}`;
/** The database writes times as "+00:00"; the app writes "Z". Same moment either way. */
const sameTimes = <T extends { createdAt?: string; updatedAt?: string }>(x: T) => ({
  ...x,
  ...(x.createdAt ? { createdAt: new Date(x.createdAt).toISOString() } : {}),
  ...(x.updatedAt ? { updatedAt: new Date(x.updatedAt).toISOString() } : {}),
});

describe.skipIf(!ON)("Supabase saves and loads every field", () => {
  let remote: typeof import("@/lib/remote");
  let before: Partial<Settings> | null = null;

  beforeAll(async () => {
    const { sb } = await import("@/lib/supabase");
    remote = await import("@/lib/remote");
    const email = process.env.SUPABASE_TEST_EMAIL || `owner-${stamp}@example.com`;
    const password = process.env.SUPABASE_TEST_PASSWORD || `Test-${stamp}-pw`;
    const signIn = await sb().auth.signInWithPassword({ email, password });
    if (signIn.error) {
      const up = await sb().auth.signUp({ email, password });
      if (up.error) throw up.error;
    }
    const { data } = await sb().rpc("is_member");
    if (!data) throw new Error("The test account is not on the team. Use SUPABASE_TEST_EMAIL / SUPABASE_TEST_PASSWORD of a member.");
    before = await remote.remoteSettings.load();
  });

  afterAll(async () => {
    if (!remote) return;
    await remote.remoteQuotations.remove([id("quote")]);
    await remote.remoteProducts.remove([id("product")]);
    await remote.remoteCustomers.remove([id("customer")]);
    if (before?.company) await remote.remoteSettings.save(before as Settings);
  });

  it("a product with its prices in every list", async () => {
    const p: Product = {
      id: id("product"),
      code: "T-1",
      name: "Test tape",
      variant: "Clear, 2 inch",
      category: "Office",
      unit: "roll",
      price: 3.5,
      prices: { "list-a": 2.75, "list-b": 2.2 },
      photo: "https://example.com/tape.jpg",
      description: "48 mm x 100 m",
      createdAt: new Date(stamp).toISOString(),
      updatedAt: new Date(stamp).toISOString(),
    };
    await remote.remoteProducts.save([p]);
    const back = (await remote.remoteProducts.load()).find((x) => x.id === p.id);
    expect(sameTimes(back!)).toEqual(p);
    // a price taken out of a list is gone after the next save
    await remote.remoteProducts.save([{ ...p, prices: { "list-a": 2.75 } }]);
    expect((await remote.remoteProducts.load()).find((x) => x.id === p.id)!.prices).toEqual({ "list-a": 2.75 });
  });

  it("a customer", async () => {
    const c: SavedCustomer = {
      id: id("customer"),
      name: "Test Trading",
      contact: "Ms Tan",
      tel: "012-000 9999",
      email: "test@example.com",
      address1: "No. 1, Jalan Ujian",
      address2: "50000 Kuala Lumpur",
      regNo: "123456-A",
      updatedAt: new Date(stamp).toISOString(),
    };
    await remote.remoteCustomers.save([c]);
    const back = (await remote.remoteCustomers.load()).find((x) => x.id === c.id);
    expect(sameTimes(back!)).toEqual(c);
  });

  it("a quotation with every field, decimals, a typed-in line and the customer's message", async () => {
    const party = (name: string) => ({ name, contact: "Mr Lee", tel: "012-000 8888", email: "lee@example.com", address1: "Lot 5", address2: "10200 George Town, Penang", regNo: "998877-X" });
    const q: Quotation = {
      id: id("quote"),
      number: "QT-TT-2610-01",
      status: "Sent",
      date: "2026-10-22",
      validDays: 14,
      invoiceTo: party("Test Trading"),
      deliveryTo: party("Test Trading Warehouse"),
      sameDelivery: false,
      priceList: "list-a",
      delivery: "Within 3 days",
      payment: "Cash on delivery",
      notes: "Line one\nLine two",
      taxRate: 8.25,
      lines: [
        { id: id("line-1"), productId: id("product"), code: "T-1", name: "Test tape", variant: "Clear", unit: "roll", photo: "https://example.com/tape.jpg", qty: 2.5, unitPrice: 1.26, discount: 12.5, priceList: "list-a" },
        { id: id("line-2"), productId: null, code: "", name: "Delivery", variant: "Penang island", unit: "trip", photo: "", qty: 1, unitPrice: 30, discount: 0, priceList: "custom" },
      ],
      source: { kind: "screenshot", text: "pls quote 2.5 roll tape", image: "https://example.com/chat.jpg", matched: 1, total: 2, notCarried: ["10 boxes"], customer: { name: "Test Trading", matched: true }, at: new Date(stamp).toISOString() },
      createdAt: new Date(stamp).toISOString(),
      updatedAt: new Date(stamp).toISOString(),
    };
    await remote.remoteQuotations.save([q]);
    const back = (await remote.remoteQuotations.load()).find((x) => x.id === q.id)!;
    expect({ ...sameTimes(back), source: { ...back.source!, at: new Date(back.source!.at).toISOString() } }).toEqual(q);

    // a line taken off the quotation is gone after the next save
    await remote.remoteQuotations.save([{ ...q, lines: [q.lines[1]] }]);
    expect((await remote.remoteQuotations.load()).find((x) => x.id === q.id)!.lines.map((l) => l.id)).toEqual([id("line-2")]);
  });

  it("settings and price lists", async () => {
    const s: Settings = {
      company: { name: "Test Co", regNo: "1-X", address: "Line 1\nLine 2", phone: "+60 3-000", email: "a@example.com", website: "example.com", logo: "https://example.com/logo.png" },
      currency: "S$",
      quote: { title: "QUOTE", prefix: "TQ", validDays: 30, delivery: "d", payment: "p", notes: "n", bank: "b", footer: "f", columns: { photo: false, code: true, unit: false, discount: true } },
      tax: { enabled: true, name: "GST", rate: 9 },
      whatsapp: { countryCode: "65", message: "Hi {customer}" },
      priceLists: [
        { id: "standard", name: "Standard" },
        { id: id("list"), name: "Test list" },
      ],
    };
    await remote.remoteSettings.save(s);
    expect(await remote.remoteSettings.load()).toEqual(s);
  });
});

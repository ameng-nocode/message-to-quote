import { beforeAll, describe, expect, it } from "vitest";
import { calcQuote, cleanQty, isUnnamedNumber, lineAmount, nextQuoteNumber, round2, round3, validUntil } from "@/lib/quote";
import { getProduct, priceFor, saveProduct, EMPTY_PRODUCT } from "@/lib/products";
import { getSettings, priceListByName, saveSettings } from "@/lib/settings";
import { blankLine, lineFromProduct, newDraft, quotations } from "@/lib/store";
import { cleanLine, relist, runActions } from "@/lib/edit";
import { loadSample } from "@/lib/sample";
import { paperColumns, totalRows } from "@/lib/paper";
import { parseCsv, parsePrice, planImport } from "@/lib/productFile";
import { customers, findSaved, phoneKey } from "@/lib/customers";
import { waMessage, waNumber } from "@/lib/send";
import { CUSTOM_PRICE, STANDARD_LIST, type QuoteLine, type Quotation } from "@/lib/types";

/* The rules every quotation depends on. Run with `npm test` after any change to src/lib. */

const line = (qty: number, unitPrice: number, discount = 0): QuoteLine => ({ ...blankLine(), qty, unitPrice, discount });
const quote = (lines: QuoteLine[], taxRate = 0): Quotation => ({ ...newDraft(), lines, taxRate });
const listId = (name: string) => priceListByName(getSettings(), name)!.id;

beforeAll(() => {
  loadSample();
});

describe("money rounding", () => {
  it("rounds half up to the cent, even where binary numbers fall short", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(1.0049)).toBe(1);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round3(0.0005)).toBe(0.001);
  });

  it("line amount = qty x unit price, less the discount", () => {
    expect(lineAmount(line(60, 18))).toBe(1080);
    expect(lineAmount(line(3, 19.99))).toBe(59.97);
    expect(lineAmount(line(1, 1.05, 10))).toBe(0.95);
    expect(lineAmount(line(2.5, 12.4))).toBe(31);
    expect(lineAmount(line(0.333, 3))).toBe(1);
    expect(lineAmount(line(10, 5, 150))).toBe(0); // a discount stops at 100%
    expect(lineAmount(line(10, 5, -20))).toBe(50); // and never adds
  });

  it("subtotal adds the rounded line amounts; tax is on the subtotal; total = subtotal + tax", () => {
    const c = calcQuote(quote([line(1, 1.05, 10), line(3, 19.99)], 8));
    expect(c.subtotal).toBe(60.92);
    expect(c.tax).toBe(4.87);
    expect(c.total).toBe(65.79);
    expect(calcQuote(quote([line(1, 99.99)], 6)).total).toBe(105.99);
    expect(calcQuote(quote([line(10, 69)], 8))).toMatchObject({ subtotal: 690, tax: 55.2, total: 745.2 });
    expect(calcQuote(quote([line(10, 69)], 0)).tax).toBe(0);
    expect(calcQuote(quote([line(2, 5), line(3.5, 1)])).qty).toBe(5.5);
  });

  it("numbers typed into a line are kept to the cent (money) and 3 places (qty, discount)", () => {
    expect(cleanLine({ unitPrice: 1.255 })).toEqual({ unitPrice: 1.26 });
    expect(cleanLine({ qty: 2.12345 })).toEqual({ qty: 2.123 });
    expect(cleanLine({ qty: -4 })).toEqual({ qty: 0 });
    expect(cleanLine({ discount: 120 })).toEqual({ discount: 100 });
    expect(cleanLine({ name: "Box" })).toEqual({ name: "Box" });
  });

  it("quantities from the AI or a file: decimals kept, nonsense falls back", () => {
    expect(cleanQty(2.5, 1)).toBe(2.5);
    expect(cleanQty("96", 1)).toBe(96);
    expect(cleanQty(0, 1)).toBe(1);
    expect(cleanQty(-3, 1)).toBe(1);
    expect(cleanQty("abc", 1)).toBe(1);
    expect(cleanQty(0, 0)).toBe(0);
  });
});

describe("quotation numbers and dates", () => {
  const q = (number: string) => ({ ...newDraft(), number });
  it("prefix, customer letters, year and month, then a running number", () => {
    expect(nextQuoteNumber([], "QT", "Ace Mobile Enterprise", "2026-09-21")).toBe("QT-AME-2609-01");
    expect(nextQuoteNumber([q("QT-AME-2609-01"), q("QT-AME-2609-02")], "QT", "Ace Mobile Enterprise", "2026-09-30")).toBe("QT-AME-2609-03");
    expect(nextQuoteNumber([q("QT-AME-2609-02")], "QT", "Ace Mobile Enterprise", "2026-09-30")).toBe("QT-AME-2609-03"); // 01 was deleted: no repeat of 02
    expect(nextQuoteNumber([q("QT-AME-2609-02")], "QT", "Ace Mobile Enterprise", "2026-10-01")).toBe("QT-AME-2610-01");
    expect(nextQuoteNumber([], "qt-", "", "2026-10-01")).toBe("QT-NEW-2610-01");
    expect(isUnnamedNumber("QT-NEW-2610-01")).toBe(true);
    expect(isUnnamedNumber("QT-AME-2610-01")).toBe(false);
  });
  it("valid until = date + days; 0 days = no date", () => {
    expect(validUntil({ date: "2026-09-21", validDays: 14 })).toBe("2026-10-05");
    expect(validUntil({ date: "2026-12-25", validDays: 14 })).toBe("2027-01-08");
    expect(validUntil({ date: "2026-09-21", validDays: 0 })).toBe("");
  });
});

describe("sample quotations add up", () => {
  it("every sample total, by hand-checked prices", () => {
    const totals = Object.fromEntries(quotations.all().map((x) => [x.number, calcQuote(x).total]));
    expect(totals).toMatchObject({
      "QT-AME-2609-02": 5237.2, // 60x18 + 40x18 + 100x9.30 + 200x7.40 + 24x42.80 (wholesale)
      "QT-ATK-2609-01": 5454, // 100x9.30 + 50x30.40 + 40x13.60 + 20x123 (wholesale)
      "QT-PWP-2609-01": 3988,
      "QT-MHM-2609-01": 4660,
      "QT-GC-2609-01": 3266,
      "QT-DZT-2609-01": 15245,
      "QT-TC-2609-01": 10605,
      "QT-AME-2609-01": 5305.2,
      "QT-DZT-2608-01": 24300,
    });
  });
});

describe("price lists", () => {
  it("a product has its standard price and one price per list", () => {
    const p = getProduct("cs-rg61-black")!;
    expect(priceFor(p, STANDARD_LIST)).toBe(29);
    expect(priceFor(p, listId("Wholesale"))).toBe(18);
    expect(priceFor(p, listId("dealer"))).toBe(15.7); // list names match in any case
    expect(priceFor(p, "no-such-list")).toBeNull();
  });

  it("a new line takes the quotation's price list; no price there = 0, marked as typed", () => {
    const p = getProduct("cs-rg61-black")!;
    expect(lineFromProduct(p, listId("Wholesale"), 60)).toMatchObject({ qty: 60, unitPrice: 18, priceList: listId("Wholesale"), code: "CS-RG61", variant: "Black", unit: "pcs" });
    expect(lineFromProduct(p, "no-such-list")).toMatchObject({ unitPrice: 0, priceList: CUSTOM_PRICE });
    expect(lineFromProduct(p, STANDARD_LIST, 1, 15.555)).toMatchObject({ unitPrice: 15.56, priceList: CUSTOM_PRICE }); // a price someone stated
  });

  it("switching the whole quotation to another list re-prices product lines, keeps typed-in lines, flags missing prices", () => {
    const special = saveProduct({ ...EMPTY_PRODUCT, name: "Special order box", price: 50, prices: { [listId("Wholesale")]: 40 } });
    const typed = { ...blankLine(), name: "Delivery", unitPrice: 30 };
    const q = { ...quote([lineFromProduct(getProduct("cs-rg61-black")!, STANDARD_LIST, 10), lineFromProduct(special, STANDARD_LIST, 2), typed]) };
    const { next, skipped } = relist(q, listId("Dealer"));
    expect(next.priceList).toBe(listId("Dealer"));
    expect(next.lines[0]).toMatchObject({ unitPrice: 15.7, priceList: listId("Dealer") });
    expect(next.lines[1]).toMatchObject({ unitPrice: 50, priceList: CUSTOM_PRICE }); // no dealer price: keeps its number
    expect(next.lines[2]).toMatchObject({ unitPrice: 30, name: "Delivery" });
    expect(skipped).toBe(1);
    expect(calcQuote(next).total).toBe(157 + 100 + 30);
  });
});

describe("Add with AI actions", () => {
  const start = () => ({ ...quote([]), priceList: listId("Wholesale") });
  it("adds known products at the quotation's list, skips unknown ones, keeps decimal quantities", () => {
    const { next, done } = runActions(start(), [
      { type: "add", productId: "cs-rg61-black", qty: 60 },
      { type: "add", productId: "not-a-product", qty: 5 },
      { type: "add", productId: "sp-cm-clear", qty: 2.5 },
    ]);
    expect(next.lines.map((l) => [l.code, l.qty, l.unitPrice])).toEqual([
      ["CS-RG61", 60, 18],
      ["SP-CM", 2.5, 5.6],
    ]);
    expect(done.added).toHaveLength(2);
    expect(calcQuote(next).total).toBe(1080 + 14);
  });

  it("changes a quantity, removes a line, switches the list; an unknown list changes nothing", () => {
    const first = runActions(start(), [
      { type: "add", productId: "cs-rg61-black", qty: 60 },
      { type: "add", productId: "au-spk-black", qty: 2 },
    ]).next;
    const { next, done } = runActions(first, [
      { type: "set_qty", productId: "cs-rg61-black", qty: 120 },
      { type: "remove", productId: "au-spk-black" },
      { type: "set_price_list", priceList: "DEALER" },
      { type: "set_price_list", priceList: "Super VIP" },
    ]);
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0]).toMatchObject({ qty: 120, unitPrice: 15.7 });
    expect(done).toMatchObject({ changed: [{ productId: "cs-rg61-black", qty: 120 }], removed: ["au-spk-black"], priceList: "Dealer" });
    expect(calcQuote(next).total).toBe(1884);
  });

  it("works out the result without touching the quotation (the review step)", () => {
    const q = start();
    runActions(q, [{ type: "add", productId: "cs-rg61-black", qty: 1 }]);
    expect(q.lines).toHaveLength(0);
  });
});

describe("the paper (print, PDF, Excel)", () => {
  it("total rows: only the total without tax; subtotal, tax and total with tax", () => {
    const s = getSettings();
    expect(totalRows(quote([line(60, 18)]), s)).toEqual([["Total (RM)", "1,080.00"]]);
    expect(totalRows(quote([line(10, 69)], 8), s)).toEqual([
      ["Subtotal", "690.00"],
      ["SST 8%", "55.20"],
      ["Total (RM)", "745.20"],
    ]);
  });

  it("columns follow Settings; empty optional columns drop out; a discount shows its column", () => {
    const s = getSettings();
    const withPhoto = quote([lineFromProduct(getProduct("cs-rg61-black")!, STANDARD_LIST)]);
    expect(paperColumns(s, withPhoto).map((c) => c.key)).toEqual(["no", "photo", "code", "item", "qty", "unit", "price", "amount"]);
    const off = { ...s, quote: { ...s.quote, columns: { photo: false, code: false, unit: false, discount: false } } };
    expect(paperColumns(off, withPhoto).map((c) => c.key)).toEqual(["no", "item", "qty", "price", "amount"]);
    expect(paperColumns(s, quote([line(1, 5)])).map((c) => c.key)).toEqual(["no", "item", "qty", "price", "amount"]);
    expect(paperColumns(off, quote([line(1, 5, 10)])).map((c) => c.key)).toContain("disc");
  });
});

describe("product import (Excel / CSV)", () => {
  it("reads prices the way people write them", () => {
    expect(parsePrice("RM 1,299.00")).toBe(1299);
    expect(parsePrice("1.299,50")).toBe(1299.5);
    expect(parsePrice("12,5")).toBe(12.5);
    expect(parsePrice("12,500")).toBe(12500);
    expect(parsePrice("0.105")).toBe(0.11);
    expect(parsePrice(18)).toBe(18);
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("call us")).toBeNull();
  });

  it("reads CSV with quotes, commas inside quotes, semicolons and Windows line ends", () => {
    expect(parseCsv('code,name\r\nA1,"Box, large"\r\n')).toEqual([["code", "name"], ["A1", "Box, large"]]);
    expect(parseCsv("code;name;price\nB2;Tape;3,50\n")).toEqual([["code", "name", "price"], ["B2", "Tape", "3,50"]]);
    expect(parseCsv('a,b\n"say ""hi""",x')).toEqual([["a", "b"], ['say "hi"', "x"]]);
  });

  it("matches price columns to the lists (with or without 'price' and the currency), adds new lists, updates by code + variant", async () => {
    const csv = [
      "Code,Name,Variant,Unit,Price (RM),Wholesale Price (RM),Dealer,Member price",
      "CS-RG61,Rugged Armor Case 6.1 inch,Black,pcs,31.00,19.50,16,14",
      "NEW-1,Gift box,,set,12,9,,8",
      ",No code item,,pcs,abc,,,",
      "NEW-1,Gift box,,set,12,9,,8",
      ",,,pcs,5,,,",
    ].join("\n");
    const plan = await planImport(new File([csv], "products.csv"), [getProduct("cs-rg61-black")!], getSettings());
    expect(plan.newLists).toEqual(["Member price"]);
    expect(plan.ignored).toEqual([]);
    const [updated, added, badPrice, dupe, noName] = plan.rows;
    expect(updated.status).toBe("update");
    expect(updated.product).toMatchObject({ id: "cs-rg61-black", price: 31 });
    expect(updated.product!.prices[listId("Wholesale")]).toBe(19.5);
    expect(updated.product!.prices[listId("Dealer")]).toBe(16);
    expect(updated.product!.prices[listId("Distributor")]).toBe(13.6); // a list the file does not have keeps its price
    expect(added).toMatchObject({ status: "new", product: { code: "NEW-1", unit: "set", price: 12 } });
    expect(badPrice).toMatchObject({ status: "error", error: "No price, or not a number" });
    expect(dupe).toMatchObject({ status: "error", error: "Same product as row 3" });
    expect(noName).toMatchObject({ status: "error", error: "No name" });
    expect(plan.priceLists.map((l) => l.name)).toEqual([...getSettings().priceLists.map((l) => l.name), "Member price"]);
  });

  it("an exported product sheet imports back into the same lists, nothing new", async () => {
    const names = getSettings().priceLists.map((l) => l.name);
    const csv = [["code", "name", "variant", "category", "unit", ...names, "description", "photo"].join(","), "X-1,Tape,Clear,Office,roll,3,2.5,2.2,2,,"].join("\n");
    const plan = await planImport(new File([csv], "products.csv"), [], getSettings());
    expect(plan.newLists).toEqual([]);
    expect(plan.rows[0].product).toMatchObject({ price: 3, prices: { [listId("Wholesale")]: 2.5, [listId("Dealer")]: 2.2, [listId("Distributor")]: 2 } });
  });

  it("a file without a name or a price column says so", async () => {
    await expect(planImport(new File(["code,price\nA,1"], "x.csv"), [], getSettings())).rejects.toThrow(/name/);
    await expect(planImport(new File(["code,name\nA,Box"], "x.csv"), [], getSettings())).rejects.toThrow(/price/);
  });
});

describe("customers and WhatsApp", () => {
  it("the same phone number written different ways is one number", () => {
    expect(phoneKey("+60 12-000 1007")).toBe(phoneKey("012-000 1007"));
    expect(phoneKey("6012 000 1007")).toBe("120001007");
  });
  it("a saved customer is found by name in any case and spacing", () => {
    expect(findSaved(customers.all(), "  ace   MOBILE enterprise ")?.tel).toBe("012-000 1001");
  });
  it("the WhatsApp number gets the country code; the message carries the items and the total", () => {
    expect(waNumber("012-000 1001", "60")).toBe("60120001001");
    expect(waNumber("+65 9123 4567", "60")).toBe("6591234567");
    const q = quotations.all().find((x) => x.number === "QT-AME-2609-02")!;
    const text = waMessage(q, getSettings());
    expect(text).toContain("CS-RG61 Rugged Armor Case 6.1 inch (Black) x 60 pcs @ RM 18.00");
    expect(text).toContain("Total: RM 5,237.20");
  });
});

describe("settings", () => {
  it("tax switched on gives new quotations the tax rate", () => {
    saveSettings((s) => ({ ...s, tax: { ...s.tax, enabled: true, rate: 8 } }));
    expect(newDraft().taxRate).toBe(8);
    saveSettings((s) => ({ ...s, tax: { ...s.tax, enabled: false } }));
    expect(newDraft().taxRate).toBe(0);
  });
});

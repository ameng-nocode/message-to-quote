"use client";

import { uid } from "./collection";
import { customers, type SavedCustomer } from "./customers";
import { products } from "./products";
import { getSettings, priceListByName, saveSettings, type Settings } from "./settings";
import { lineFromProduct, quotations } from "./store";
import raw from "./sample/products.json";
import { STANDARD_LIST, type Customer, type Product, type Quotation, type QuoteSource } from "./types";

/* Sample data: an invented phone + accessories wholesaler, "Gadgetline Mobile". Every name, number and address is made up.
   It is there so a new install has something to try Add with AI on (the screenshots in demo-data/whatsapp are its orders). */

type RawProduct = { id: string; code: string; name: string; variant: string; category: string; unit: string; price: number; wholesale?: number | null; dealer?: number | null; distributor?: number | null; description: string; photo: string };

const LISTS = ["Wholesale", "Dealer", "Distributor"] as const;

const SAMPLE_COMPANY: Settings["company"] = {
  name: "Gadgetline Mobile Sdn Bhd",
  regNo: "202601000001 (1234567-X)",
  address: "No. 1, Jalan Contoh 1/1\n47810 Petaling Jaya, Selangor, Malaysia",
  phone: "+60 3-0000 0000",
  email: "sales@gadgetline.example",
  website: "",
  logo: "",
};

const c = (name: string, address1: string, address2: string, tel: string, regNo: string, contact: string, email: string): Customer => ({ name, address1, address2, tel, regNo, contact, email });
const ACE = c("Ace Mobile Enterprise", "No. 23, Jalan Pengkalan Indah 3", "Bandar Pengkalan Indah, 08000 Sungai Petani, Kedah", "012-000 1001", "002233445-K", "Mr Lim", "acemobile@example.com");
const DZT = c("Digital Zone Trading Sdn Bhd", "Lot G-12, Plaza Angsana", "Jalan Skudai, 81200 Johor Bahru, Johor", "012-000 1002", "1187766-P", "Ms Farah", "purchasing@digitalzone.example");
const TPC = c("TechPoint Cellular", "Lot 2.14, Level 2, Vivacity Megamall", "Jalan Wan Alwi, 93350 Kuching, Sarawak", "012-000 1003", "SA0412233-W", "Mr Wong", "techpoint@example.com");
const PWP = c("Phone World Penang", "No. 12, Lebuh Chulia", "10200 George Town, Pulau Pinang", "012-000 1004", "201903214455", "Mr Ooi", "phoneworld@example.com");
const ATK = c("Aman Telefon KB", "Lot 5, Jalan Temenggong", "15000 Kota Bharu, Kelantan", "012-000 1005", "003344556-M", "Encik Aman", "amantelefon@example.com");
const MHM = c("Mobile Hub Melaka", "No. 41, Jalan Hang Tuah", "75300 Melaka", "012-000 1006", "002877110-D", "Ah Seng", "mobilehub@example.com");
const GC = c("Gadget Corner", "No. 8, Jalan Sultan Idris Shah", "30000 Ipoh, Perak", "012-000 1007", "202401088123", "Mr Kumar", "gadgetcorner@example.com");

type Seed = { number: string; status: Quotation["status"]; date: string; customer: Customer; list: string; lines: [string, number][]; source?: Omit<QuoteSource, "at"> };
const shot = (file: string, text: string, matched: number, total: number, notCarried: string[] = []): Omit<QuoteSource, "at"> => ({ kind: "screenshot", image: `/sample/whatsapp/${file}.jpg`, text, matched, total, notCarried });

const SEEDS: Seed[] = [
  { number: "QT-AME-2609-02", status: "Draft", date: "2026-09-21", customer: ACE, list: "Wholesale", lines: [["cs-rg61-black", 60], ["cs-rg61-navy", 40], ["cs-cl67-clear", 100], ["sp-tg61-clear", 200], ["pb-10k-black", 24]],
    source: shot("01-ace-mobile-sp", "Boss morning\nrestock for SP shop this week:\n- CS-RG61 black x60\n- CS-RG61 navy x40\n- clear case 6.7 x100\n- tempered glass 6.1 x200\n- PB-10K black 24pcs\nwholesale price ya, same as last time", 5, 5) },
  { number: "QT-PWP-2609-01", status: "Draft", date: "2026-09-20", customer: PWP, list: "Wholesale", lines: [["cs-wl67-brown", 50], ["cb-cc1-black", 100], ["pb-20k-black", 20]],
    source: shot("07-phone-world-penang", "hi need urgent for weekend sale\n30 iPhone 15 Pro Max leather case\n20 Samsung S24 tempered glass\n50 CS-WL67 wallet case brown\n100 CB-CC1 cable\n20 PB-20K power bank\ncan deliver by friday?", 3, 5, ["30 iPhone 15 Pro Max leather case", "20 Samsung S24 tempered glass"]) },
  { number: "QT-ATK-2609-01", status: "Sent", date: "2026-09-19", customer: ATK, list: "Wholesale", lines: [["cb-cc1-black", 100], ["au-neck-black", 50], ["hd-desk-silver", 40], ["wt-nf2-rose-gold", 20]],
    source: shot("06-aman-telefon-kb", "Assalamualaikum bos\nnak order:\n100 pcs kabel USB-C to USB-C 60W 1m\n50 pcs neckband bluetooth\n40 pcs desk stand silver\n20 pcs NOVA Fit 2 rose gold\nharga wholesale, hantar courier ke Kota Bharu", 4, 4) },
  { number: "QT-MHM-2609-01", status: "Sent", date: "2026-09-18", customer: MHM, list: "Wholesale", lines: [["pb-mag5-lavender", 50], ["pb-mag5-black", 30], ["sp-tg67-clear", 100]],
    source: shot("05-mobile-hub-melaka-photo", "[photo of a lavender power bank] this one got stock? 50pcs\nblack one also, 30pcs\nand 100 pcs tempered glass 6.7", 3, 3) },
  { number: "QT-GC-2609-01", status: "Sent", date: "2026-09-17", customer: GC, list: "Wholesale", lines: [["cs-sl61-lavender", 50], ["cs-sl61-forest-green", 50], ["sp-pv61-black", 100], ["ch-wl15-black", 30]],
    source: shot("04-gadget-corner-ipoh", "hi bro, got your number from Ah Kit. i open a new shop in ipoh, Gadget Corner\ni want 50 liquid silicone case 6.1 lavender, 50 forest green, 100pcs privacy glass 6.1 and 30 wireless charging pad. can send me price?", 4, 4) },
  { number: "QT-DZT-2609-01", status: "Sent", date: "2026-09-16", customer: DZT, list: "Dealer", lines: [["ph-nl5-ocean-green", 20], ["ph-nl5-pearl-white", 20], ["ch-pd20-white", 100], ["cb-ac1-white", 150]],
    source: shot("02-digital-zone-jb", "Hi boss, nak order utk outlet JB:\nNOVA L5 Lite ocean green 20 unit\nNOVA L5 Lite pearl white 20 unit\nCH-PD20 charger 100pcs\nCB-AC1 cable 150pcs\nboleh bagi dealer price tak?", 4, 4) },
  { number: "QT-TC-2609-01", status: "Draft", date: "2026-09-15", customer: TPC, list: "Wholesale", lines: [["ph-nx10-midnight-black", 10], ["cs-mg61-clear", 50], ["pb-mag5-black", 30]] },
  { number: "QT-AME-2609-01", status: "Sent", date: "2026-09-03", customer: ACE, list: "Wholesale", lines: [["cs-rg61-black", 60], ["cs-sl61-lavender", 40], ["pb-10k-black", 24], ["cb-cc2-black", 100], ["au-tws1-white", 20]] },
  { number: "QT-DZT-2608-01", status: "Sent", date: "2026-08-14", customer: DZT, list: "Dealer", lines: [["ph-nl5-ocean-green", 30], ["ph-nl5-pearl-white", 30], ["cs-cl67-clear", 200], ["sp-tg67-clear", 300], ["ch-pd20-white", 100]] },
];

/** A shop owner's restock message using the sample products, for the "Use sample order" button. */
export const SAMPLE_ORDER = `Hi boss, please quote for my shop restock:
- CS-RG61 rugged case black x 60
- clear case 6.7 x 100
- tempered glass 6.1 200pcs
- PB-10K power bank black 24
- 65W GaN charger white 30
- TWS earbuds white 20 units
- car vent holder 40
Thanks`;

export const hasSample = () => products.all().some((p) => p.sample) || quotations.all().some((q) => q.sample) || customers.all().some((x) => x.sample);

/** Add the sample products, customers and quotations. Fills the company details only when they are still empty. */
export function loadSample() {
  // the sample's price lists, added when missing
  saveSettings((s) => {
    const lists = [...s.priceLists];
    for (const name of LISTS) if (!priceListByName({ ...s, priceLists: lists }, name)) lists.push({ id: uid(), name });
    const company = s.company.name.trim() ? s.company : { ...SAMPLE_COMPANY, logo: s.company.logo };
    const quote = s.quote.payment || s.quote.delivery || s.quote.bank
      ? s.quote
      : { ...s.quote, delivery: "3 to 5 working days after payment.", payment: "50% deposit, balance before delivery.", bank: "Demo Bank Berhad\nAccount name: Gadgetline Mobile Sdn Bhd\nAccount no: 0000 0000 0000\nReference: quotation number" };
    return { ...s, priceLists: lists, company, quote };
  });
  const s = getSettings();
  const listId = (name: string) => priceListByName(s, name)?.id ?? STANDARD_LIST;
  const now = new Date().toISOString();

  const list: Product[] = (raw as RawProduct[]).map((r) => {
    const prices: Record<string, number> = {};
    for (const name of LISTS) {
      const v = r[name.toLowerCase() as "wholesale" | "dealer" | "distributor"];
      if (typeof v === "number") prices[listId(name)] = v;
    }
    return { id: r.id, code: r.code, name: r.name, variant: r.variant, category: r.category, unit: r.unit, price: r.price, prices, photo: r.photo, description: r.description, sample: true, createdAt: now, updatedAt: now };
  });
  products.putMany(list);
  const byId = new Map(list.map((p) => [p.id, p]));

  const book: SavedCustomer[] = [ACE, DZT, TPC, PWP, ATK, MHM, GC].map((x, i) => ({ ...x, id: `sample-customer-${i + 1}`, sample: true, updatedAt: now }));
  customers.putMany(book);

  const quotes: Quotation[] = SEEDS.map((seed, i) => {
    const pl = listId(seed.list);
    const stamp = seed.date + "T09:00:00.000Z";
    return {
      id: `sample-quote-${i + 1}`,
      number: seed.number,
      status: seed.status,
      date: seed.date,
      validDays: s.quote.validDays,
      invoiceTo: seed.customer,
      deliveryTo: seed.customer,
      sameDelivery: true,
      priceList: pl,
      delivery: s.quote.delivery,
      payment: s.quote.payment,
      notes: "",
      taxRate: s.tax.enabled ? s.tax.rate : 0,
      lines: seed.lines.flatMap(([id, qty]) => {
        const p = byId.get(id);
        return p ? [lineFromProduct(p, pl, qty)] : [];
      }),
      source: seed.source ? { ...seed.source, customer: { name: seed.customer.name, matched: true }, at: stamp } : undefined,
      sample: true,
      createdAt: stamp,
      updatedAt: stamp,
    };
  });
  quotations.putMany(quotes);
}

/** Remove everything that came with the sample. Your own products, customers and quotations stay. */
export function removeSample() {
  quotations.removeMany(quotations.all().filter((q) => q.sample).map((q) => q.id));
  customers.removeMany(customers.all().filter((x) => x.sample).map((x) => x.id));
  products.removeMany(products.all().filter((p) => p.sample).map((p) => p.id));
}

/** A named price column, e.g. Retail, Wholesale, Dealer. The first list is the product's own price. */
export type PriceList = { id: string; name: string };

/** The list every product always has a price in. It can be renamed, never removed. */
export const STANDARD_LIST = "standard";

export type Product = {
  id: string;
  code: string; // SKU or model code, optional
  name: string;
  variant: string; // colour, size, flavour... optional
  category: string;
  unit: string; // pcs, set, box, hour...
  price: number; // price in the standard list
  prices: Record<string, number>; // other price lists, by list id; missing = no price in that list
  photo: string; // picture URL, "" = none
  description: string;
  sample?: boolean; // part of the sample data, removed by "Remove sample data"
  createdAt: string;
  updatedAt: string;
};

/** Where a line's unit price came from: a price list id, or "custom" when it was typed by hand. */
export type LinePrice = string;
export const CUSTOM_PRICE = "custom";

/** One quotation line. Product details are copied in when the line is added, so editing a product later never changes a quotation already made. */
export type QuoteLine = {
  id: string;
  productId: string | null; // null = an item typed in, not from the product list
  code: string;
  name: string;
  variant: string;
  unit: string;
  photo: string;
  qty: number;
  unitPrice: number;
  discount: number; // percent, 0 to 100
  priceList: LinePrice;
};

export type Customer = {
  name: string;
  address1: string;
  address2: string;
  tel: string;
  regNo: string; // company registration number
  contact: string; // person to address
  email: string;
};

export type QuoteStatus = "Draft" | "Sent";

/** Where a quotation's lines came from when Add with AI built it: the customer's own message. */
export type QuoteSource = {
  kind: "screenshot" | "photo" | "text";
  text: string; // what the customer wrote: pasted as is, or read off the screenshot
  image?: string; // the picture they sent: a public path for sample data, a small data URL for live imports
  matched: number; // lines matched to a product
  total: number; // lines asked for
  notCarried: string[]; // lines the product list does not have
  customer?: { name: string; matched: boolean }; // the sender Add with AI recognised: matched = found in Customers
  at: string; // ISO time of the import
};

export type Quotation = {
  id: string;
  number: string;
  status: QuoteStatus;
  date: string; // ISO yyyy-mm-dd
  validDays: number; // 0 = no "valid until" line
  invoiceTo: Customer;
  deliveryTo: Customer;
  sameDelivery: boolean;
  priceList: string; // the price list new lines take their price from
  delivery: string;
  payment: string;
  notes: string;
  taxRate: number; // percent, 0 = no tax line
  lines: QuoteLine[];
  source?: QuoteSource; // set when Add with AI built the lines from a customer message
  sample?: boolean;
  createdAt: string;
  updatedAt: string;
};

/** What the assistant may do to the open quotation. Price lists are named, not by id: the AI sees the names. */
export type AssistAction =
  | { type: "add"; productId: string; qty: number; unitPrice?: number }
  | { type: "set_qty"; productId: string; qty: number }
  | { type: "remove"; productId: string }
  | { type: "set_price_list"; priceList: string };

export type AssistUnmatched = { text: string; qty: number; suggestions: string[] };

/** What the quotation actually got from a set of actions: only the ones that took effect. */
export type Applied = {
  added: { productId: string; qty: number }[];
  changed: { productId: string; qty: number }[];
  removed: string[];
  priceList?: string; // name
};

/** How a customer photo was matched to the product list. */
export type AssistMatch = {
  photo: number; // 1-based index of the uploaded photo
  productId: string | null; // best match, null when nothing fits
  confidence: number; // 0 to 1
  qty: number;
  alternatives: string[]; // other likely ids, best first
  note: string; // one short sentence, e.g. "Model name visible on the photo"
};

export type AssistResult = {
  reply: string;
  actions: AssistAction[];
  unmatched: AssistUnmatched[];
  matches?: AssistMatch[];
  source_text?: string; // the customer's order as read off a chat screenshot, when one was sent
  customer?: AssistCustomer; // who sent the order, when the message shows it
};

/** Who sent the order: a saved customer's id, or what the message says about someone new. */
export type AssistCustomer = {
  id: string | null;
  name: string;
  contact: string;
  tel: string;
  address1: string; // street, building, unit
  address2: string; // postcode, town, state
  email: string;
  regNo: string; // company number
};

/** A saved customer as the AI sees it, to recognise the sender. */
export type CustomerRef = { id: string; name: string; contact: string; tel: string; town: string };

/** A product as the AI sees it. */
export type CatalogItem = { id: string; code: string; name: string; variant: string; category: string; unit: string; description: string };

export type AssistContext = {
  priceList: string; // name of the quotation's price list
  priceLists: string[]; // every price list name
  lines: { productId: string; qty: number; unitPrice: number }[];
  customers?: CustomerRef[];
  catalog: CatalogItem[];
  thumbs?: { id: string; src: string }[]; // small product pictures, only sent with photos
  history: { role: "user" | "assistant"; content: string }[];
};

export type AssistRequest = {
  message: string;
  context: AssistContext;
  images?: string[]; // data URLs, already resized by the browser
};

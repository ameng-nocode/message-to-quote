import { calcQuote, fmtDate, fmtMoney, validUntil } from "./quote";
import { productLabel } from "./products";
import { fillTemplate, type Settings } from "./settings";
import type { Quotation } from "./types";

/** "012-000 1001" or "+60 12 000 1001" -> digits WhatsApp accepts (country code first, no plus, no zeros in front) */
export function waNumber(tel: string, countryCode: string): string {
  let d = (tel || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0") && countryCode) d = countryCode.replace(/\D/g, "") + d.slice(1); // a local number
  return d;
}

/** The WhatsApp message from the template in Settings, filled in for this quotation. */
export function waMessage(q: Quotation, s: Settings): string {
  const c = calcQuote(q);
  const items = c.lines.map(({ line }, i) => `${i + 1}. ${productLabel(line)} x ${line.qty}${line.unit ? " " + line.unit : ""} @ ${s.currency} ${fmtMoney(line.unitPrice)}`).join("\n");
  const until = validUntil(q);
  return fillTemplate(s.whatsapp.message, {
    customer: q.invoiceTo.contact || q.invoiceTo.name || "there",
    number: q.number,
    date: fmtDate(q.date),
    items,
    total: `${s.currency} ${fmtMoney(c.total)}`,
    valid: until ? `Valid until ${fmtDate(until)}.` : "",
    company: s.company.name,
  });
}

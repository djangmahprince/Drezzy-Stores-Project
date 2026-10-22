// WhatsApp messages staff send to a customer from the order screen. Pure, so the dashboard and the tests agree.
//
// This opens WhatsApp with the message already written (click to chat). A person reads it and presses send, so it works
// with the branch's normal WhatsApp number today. Automatic sending needs the WhatsApp Business API and approved templates,
// which is a separate setup with Meta; the wording here is ready to reuse for it.

export type WaOrder = { number: string; name: string; status: string; total: number; paid: number; balance: number; method: "home" | "pickup"; riderName?: string | null; riderPhone?: string | null };

const ghs = (n: number) => `GHS ${n.toLocaleString("en-GH")}`;
const first = (name: string) => name.trim().split(/\s+/)[0] || "there";

/** +233240000000 or 0240000000 to the digits wa.me wants (233240000000). Null when it is not a Ghana number. */
export function waNumber(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  if (/^233\d{9}$/.test(d)) return d;
  if (/^0\d{9}$/.test(d)) return `233${d.slice(1)}`;
  return null;
}

/** The message for the order's current stage. */
export function whatsappText(o: WaOrder): string {
  const hi = `Hi ${first(o.name)}, this is Drezzy Stores about your order ${o.number}.`;
  const owing = o.balance > 0 ? ` Please have ${ghs(o.balance)} ready on delivery.` : "";
  switch (o.status) {
    case "awaiting_payment":
      return `${hi} We have not received your payment of ${ghs(Math.max(o.total - o.paid, 0))} yet. Reply here if you need help paying.`;
    case "to_confirm":
      return `${hi} We have your payment, thank you. We are confirming your order now.`;
    case "to_source":
      return `${hi} Your order is confirmed and we are getting your item from our supplier. We will message you when it arrives.`;
    case "ready_to_pack":
    case "packed":
      return `${hi} Your item is here and being checked and packed.${o.method === "home" ? owing : ""}`;
    case "dispatched":
    case "out_for_delivery":
      return o.method === "pickup"
        ? `${hi} Your order is ready for pickup at our Accra branch.${owing}`
        : `${hi} Your order is on its way.${o.riderName ? ` Your rider is ${o.riderName}${o.riderPhone ? ` (${o.riderPhone})` : ""}.` : ""}${owing}`;
    case "failed_delivery":
      return `${hi} We could not complete your delivery today. When is a good time for us to try again?`;
    case "delivered":
      return `${hi} Your order was delivered. Thank you for shopping with us! Tell us how it went.`;
    case "cancelled":
      return `${hi} Your order has been cancelled.${o.paid > 0 ? " We will get in touch about your refund." : ""}`;
    default:
      return hi;
  }
}

/** A link that opens WhatsApp to the customer with the message ready, or null when the phone number is not usable. */
export function whatsappLink(phone: string, text: string): string | null {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

// Turns the database's tracking record (public.track_order) into what the customer's tracker shows (PRD section 9).
// Pure and timezone-pinned, so the server and browser always render the same text. Tested in supabase/tests/orders-logic.test.mjs.

export type TrackJson = {
  number: string;
  placed_at: string;
  status: string;
  payment_state: string;
  plan: "full" | "half";
  total: number;
  amount_paid: number;
  balance_due: number;
  est_delivery_date: string | null;
  delivery_method: "home" | "pickup";
  region: string | null;
  city: string | null;
  area: string | null;
  receiver_name: string | null;
  courier: string | null;
  tracking_number: string | null;
  rider_name: string | null;
  rider_phone: string | null;
  branch: "accra" | "kumasi" | "both";
  items: { name: string; detail: string; qty: number; slug?: string | null; reviewed?: boolean }[];
  events: { kind: string; status: string | null; at: string; note: string | null; by: string }[];
  payments: { kind: string; method: string | null; amount: number; at: string | null }[];
  delivery_code?: string | null;
  sourcing_outcome?: string | null;
  alternative_note?: string | null;
  feedback?: number | null;
};

export type StepState = "done" | "current" | "todo";
export type TrackStep = { label: string; note: string; state: StepState };
export type TrackBanner = { tone: "warn" | "bad" | "info"; text: string };

export type TrackView = {
  number: string;
  placed: string;
  headline: string;
  eta?: string;
  stepNumber: number; // the step in progress, 1 to 8 (8 once delivered)
  steps: TrackStep[];
  banner?: TrackBanner;
  items: { name: string; detail: string; qty: number }[];
  deliveringTo: string;
  balanceDue: number;
  helpBranch: "accra" | "kumasi";
  /** The 4-digit code the customer gives the rider, shown once the order is on its way. */
  deliveryCode?: string;
  delivered: boolean;
  feedback: number | null;
  /** Products on a delivered order that can still be reviewed. */
  toReview: { name: string; slug: string }[];
};

export const STEP_LABELS = [
  "Order placed",
  "Payment confirmed",
  "Confirmed by Drezzy",
  "Getting your item from our supplier",
  "Checked and packed",
  "Dispatched",
  "Out for delivery",
  "Delivered",
] as const;

const rank: Record<string, number> = {
  awaiting_payment: 1, to_confirm: 2, to_source: 3, ready_to_pack: 4, packed: 5, dispatched: 6,
  out_for_delivery: 7, failed_delivery: 7, delivered: 8, cancelled: 9,
};

const methodName: Record<string, string> = {
  mtn: "MTN MoMo", telecel: "Telecel Cash", airtel: "AirtelTigo Money", card: "card", manual_momo: "MoMo", momo: "MoMo", cash: "cash",
};

const ghs = (n: number) => `GHS ${Number(n).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;
const time = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-GH", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Accra" }).format(new Date(iso)) : "";
const shortTime = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-GH", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Accra" }).format(new Date(iso)) : "";
const day = (iso: string) => new Intl.DateTimeFormat("en-GH", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Accra" }).format(new Date(`${iso}T12:00:00Z`));
const branchName = (b: string) => (b === "kumasi" ? "Kumasi" : "Accra");

const HEADLINES: Record<string, string> = {
  awaiting_payment: "Waiting for payment", to_confirm: "Payment received", to_source: "Getting your item", ready_to_pack: "Item received",
  packed: "Packed", dispatched: "Dispatched", out_for_delivery: "Out for delivery", failed_delivery: "Delivery attempt failed",
  delivered: "Delivered", cancelled: "Cancelled",
};

export function buildTrack(t: TrackJson): TrackView {
  const r = rank[t.status] ?? 1;
  const cancelled = t.status === "cancelled";
  const paid = t.amount_paid > 0;
  const evFor = (note: string) => t.events.find((e) => e.note === note);

  // A step is done once the order has moved past it. "Out for delivery" is only done when the parcel is delivered,
  // so while it is on the road (or a delivery attempt failed) that step is the one in progress.
  const delivered = t.status === "delivered";
  const reached = [true, paid, r >= 3 && !cancelled, r >= 4 && !cancelled, r >= 5 && !cancelled, r >= 6 && !cancelled, delivered, delivered];
  const firstOpen = reached.findIndex((x) => !x);
  const stepNumber = cancelled ? Math.max(1, reached.lastIndexOf(true) + 1) : firstOpen === -1 ? 8 : firstOpen + 1;

  const checkout = t.payments.find((p) => p.kind === "checkout");
  const where = [t.area, t.city].filter(Boolean).join(", ");
  const notes: string[] = [
    time(t.placed_at),
    paid
      ? `${t.plan === "half" ? "Paid half, " : "Paid in full, "}${ghs(t.amount_paid)}${checkout?.method ? ` by ${methodName[checkout.method] ?? checkout.method}` : ""} · ${shortTime(checkout?.at)}`.replace(/ · $/, "")
      : t.payment_state === "pending_check" ? "We are checking your payment. This usually takes a few minutes." : "We start sourcing your item as soon as your payment is in.",
    (() => {
      const e = evFor("Confirmed by Drezzy");
      return e ? `${e.by ? `${e.by} from the ${branchName(t.branch)} branch` : `The ${branchName(t.branch)} branch`} · ${shortTime(e.at)}` : "A member of the Drezzy team will confirm your order shortly.";
    })(),
    (() => {
      const e = evFor("Item received at our branch");
      if (e) return `Received at the ${branchName(t.branch)} branch · ${shortTime(e.at)}`;
      const ordered = evFor("Getting your item from our supplier");
      return ordered ? `Ordered from our supplier · ${shortTime(ordered.at)}` : "We order your item from our supplier as soon as it is confirmed.";
    })(),
    (() => {
      const e = evFor("Checked and packed");
      return e ? `Size, colour and condition checked · ${shortTime(e.at)}` : "We check the size, colour and condition before it leaves our branch.";
    })(),
    (() => {
      const e = evFor("Dispatched");
      const who = t.rider_name ? `Rider: ${t.rider_name}${t.rider_phone ? ` · ${t.rider_phone}` : ""}` : t.courier ? `${t.courier}${t.tracking_number ? ` · tracking ${t.tracking_number}` : ""}` : "";
      // show who is carrying the parcel as soon as it is on its way, even if no timestamp was recorded
      return e || (r >= 6 && who) ? [who, e ? shortTime(e.at) : ""].filter(Boolean).join(" · ") || "Dispatched" : "A rider or courier collects your parcel.";
    })(),
    t.delivery_method === "pickup" ? "Ready for you to collect at the Accra branch." : r >= 7 ? `On the way to ${where || "you"}. The rider will call when close.` : "The rider will call when close.",
    t.status === "delivered" ? `Delivered · ${shortTime(evFor("Delivered")?.at)}`.replace(/ · $/, "") : "We deliver to your address, or you collect it from the branch.",
  ];

  const steps: TrackStep[] = STEP_LABELS.map((label, i) => ({
    label,
    note: notes[i],
    state: reached[i] ? "done" : !cancelled && i + 1 === stepNumber ? "current" : "todo",
  }));

  let banner: TrackBanner | undefined;
  if (t.sourcing_outcome === "alternative_offered") banner = { tone: "warn", text: `We could not get your item from our suppliers. We are offering an alternative${t.alternative_note ? `: ${t.alternative_note}` : ""}. Reply on WhatsApp to accept, or ask for a full refund.` };
  else if (t.sourcing_outcome === "refund" && !cancelled) banner = { tone: "bad", text: "We could not get your item from our suppliers. A full refund of what you paid is on its way." };
  else if (t.payment_state === "refunded") banner = { tone: "info", text: "This order was refunded." };
  else if (cancelled) banner = { tone: "bad", text: "This order was cancelled. If you paid, we will contact you about your refund." };
  else if (t.status === "failed_delivery") banner = { tone: "bad", text: "We could not deliver this time. We will contact you to reschedule." };
  else if (t.payment_state === "pending_check") banner = { tone: "info", text: "We are checking your MoMo payment. We will update this page as soon as it is confirmed." };
  else if (t.balance_due > 0 && paid) banner = { tone: "warn", text: `Balance to pay on delivery: ${ghs(t.balance_due)}. Pay the rider by MoMo or cash.` };
  else if (t.status === "awaiting_payment") banner = { tone: "warn", text: `Complete your payment of ${ghs(t.plan === "half" ? Math.ceil((t.total * 100) / 2) / 100 : t.total)} so we can order your item.` };

  const eta = !cancelled && t.status !== "delivered" && t.est_delivery_date && r < 7 && t.status !== "awaiting_payment"
    ? `Expected ${day(t.est_delivery_date)}`
    : t.status === "out_for_delivery" ? "Arriving today" : undefined;

  return {
    number: t.number,
    placed: time(t.placed_at),
    headline: HEADLINES[t.status] ?? "In progress",
    eta,
    stepNumber,
    steps,
    banner,
    items: t.items,
    deliveringTo: t.delivery_method === "pickup" ? "Pick up at the Accra branch" : [t.receiver_name, where, t.region].filter(Boolean).join(" · "),
    balanceDue: Number(t.balance_due),
    helpBranch: t.branch === "kumasi" ? "kumasi" : "accra",
    ...(t.delivery_code ? { deliveryCode: t.delivery_code } : {}),
    delivered,
    feedback: t.feedback ?? null,
    toReview: delivered ? t.items.filter((i): i is typeof i & { slug: string } => !!i.slug && !i.reviewed).map((i) => ({ name: i.name, slug: i.slug })) : [],
  };
}

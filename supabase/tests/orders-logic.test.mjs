// What the customer's tracker shows for each state of an order. Run with: npm run test:orders-logic
import { buildTrack, STEP_LABELS } from "../../src/lib/orders/track.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) pass++; else fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`); };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}`);

const base = {
  number: "DRZ-1027", placed_at: "2026-10-24T09:12:00Z", status: "awaiting_payment", payment_state: "unpaid", plan: "full",
  total: 450, amount_paid: 0, balance_due: 450, est_delivery_date: "2026-10-27", delivery_method: "home", region: "Ashanti", city: "Kumasi", area: "Adum",
  receiver_name: "Ama Mensah", courier: null, tracking_number: null, rider_name: null, rider_phone: null, branch: "kumasi",
  items: [{ name: 'Air Jordan 1 Retro High OG "Triple Black"', detail: "Triple Black · Size 42", qty: 1 }], events: [], payments: [],
};
const paidFull = { amount_paid: 450, balance_due: 0, payment_state: "paid", payments: [{ kind: "checkout", method: "mtn", amount: 450, at: "2026-10-24T09:13:00Z" }] };
const states = (v) => v.steps.map((s) => s.state);

eq("there are eight steps with the documented names", buildTrack(base).steps.map((s) => s.label), [...STEP_LABELS]);

// waiting for payment
let v = buildTrack(base);
eq("unpaid: placed is done, payment is the current step", states(v).slice(0, 3), ["done", "current", "todo"]);
ok("unpaid: headline and a banner asking for the amount", v.headline === "Waiting for payment" && v.banner?.tone === "warn" && /GHS 450/.test(v.banner.text), v.banner?.text);
ok("unpaid: no delivery date is promised yet", v.eta === undefined);
v = buildTrack({ ...base, plan: "half", total: 450 });
ok("unpaid half plan asks for half", /GHS 225/.test(v.banner.text), v.banner.text);
v = buildTrack({ ...base, plan: "half", total: 451 });
ok("an odd total rounds the half up to the pesewa", /GHS 225.5/.test(v.banner.text), v.banner.text);

// checking a manual MoMo payment
v = buildTrack({ ...base, payment_state: "pending_check" });
ok("manual MoMo: we are checking, and the order is not shown as paid", v.banner?.tone === "info" && v.steps[1].state === "current" && /checking/i.test(v.steps[1].note));

// paid in full
v = buildTrack({ ...base, ...paidFull, status: "to_confirm" });
eq("paid: payment is done and confirmation is next", states(v).slice(0, 4), ["done", "done", "current", "todo"]);
ok("paid: the note says how it was paid", /Paid in full, GHS 450 by MTN MoMo/.test(v.steps[1].note), v.steps[1].note);
ok("paid: a delivery estimate appears and there is no scary banner", /Expected \w+,? 27 October/.test(v.eta ?? "") && v.banner === undefined, `${v.eta} / ${v.banner?.text}`);
ok("times are shown in Accra time", /9:13\s?(am|AM)/i.test(v.steps[1].note), v.steps[1].note);

// paid half
v = buildTrack({ ...base, status: "to_confirm", payment_state: "part_paid", plan: "half", amount_paid: 225, balance_due: 225, payments: [{ kind: "checkout", method: "telecel", amount: 225, at: "2026-10-24T09:13:00Z" }] });
ok("half paid: the note and the banner both state the balance", /Paid half, GHS 225 by Telecel Cash/.test(v.steps[1].note) && /Balance to pay on delivery: GHS 225/.test(v.banner.text), v.steps[1].note);
ok("half paid: the balance is exposed for the page", v.balanceDue === 225);

// confirmed by a person
v = buildTrack({ ...base, ...paidFull, status: "to_source", events: [{ kind: "status", status: "to_source", at: "2026-10-24T09:31:00Z", note: "Confirmed by Drezzy", by: "Kwame" }] });
ok("confirmed: it names the person and the branch", /Kwame from the Kumasi branch/.test(v.steps[2].note), v.steps[2].note);
eq("confirmed: sourcing is now the current step", states(v).slice(2, 4), ["done", "current"]);
ok("confirmed: headline", v.headline === "Getting your item");

// received, packed
v = buildTrack({ ...base, ...paidFull, status: "ready_to_pack", events: [{ kind: "status", status: "ready_to_pack", at: "2026-10-24T10:20:00Z", note: "Item received at our branch", by: "Adjoa" }] });
ok("received: the note names the branch", /Received at the Kumasi branch/.test(v.steps[3].note) && v.steps[3].state === "done");
v = buildTrack({ ...base, ...paidFull, status: "packed" });
eq("packed: five steps done", states(v).filter((s) => s === "done").length, 5);

// on the road
v = buildTrack({ ...base, ...paidFull, status: "out_for_delivery", rider_name: "Yaw", rider_phone: "020 000 0000" });
ok("out for delivery: rider details and 'arriving today'", /Rider: Yaw · 020 000 0000/.test(v.steps[5].note) && v.eta === "Arriving today" && v.stepNumber === 7);
ok("out for delivery: the step note says where", /On the way to Adum, Kumasi/.test(v.steps[6].note), v.steps[6].note);
v = buildTrack({ ...base, ...paidFull, status: "dispatched", courier: "Skynet", tracking_number: "SK123" });
ok("dispatched by courier: shows the tracking number", /Skynet · tracking SK123/.test(v.steps[5].note));

// a failed attempt keeps the customer informed and the step open
v = buildTrack({ ...base, ...paidFull, status: "failed_delivery" });
ok("failed delivery: a clear banner", v.banner?.tone === "bad" && /reschedule/.test(v.banner.text));
ok("failed delivery: out-for-delivery stays the current step, not done", v.steps[6].state === "current" && v.stepNumber === 7);

// delivered
v = buildTrack({ ...base, ...paidFull, status: "delivered", events: [{ kind: "status", status: "delivered", at: "2026-10-24T14:00:00Z", note: "Delivered", by: "Yaw" }] });
ok("delivered: every step is done and nothing is current", states(v).every((s) => s === "done") && v.stepNumber === 8);
ok("delivered: no banner and no estimate", v.banner === undefined && v.eta === undefined);
ok("delivered: the time is shown", /2:00\s?(pm|PM)/i.test(v.steps[7].note), v.steps[7].note);

// cancelled
v = buildTrack({ ...base, ...paidFull, status: "cancelled" });
ok("cancelled: a banner and no step in progress", v.banner?.tone === "bad" && !states(v).includes("current") && v.headline === "Cancelled");
v = buildTrack({ ...base, status: "cancelled" });
ok("cancelled before payment: only the order was placed", states(v).filter((s) => s === "done").length === 1);

// pickup and delivery text
v = buildTrack({ ...base, ...paidFull, status: "ready_to_pack", delivery_method: "pickup", region: null, city: null, area: null });
ok("pickup: says so, and the step note offers collection", v.deliveringTo === "Pick up at the Accra branch" && /collect it/.test(v.steps[7].note + v.steps[6].note));
ok("delivery address is readable", buildTrack(base).deliveringTo === "Ama Mensah · Adum, Kumasi · Ashanti", buildTrack(base).deliveringTo);
ok("help goes to the Kumasi branch for a Kumasi order and Accra otherwise", buildTrack(base).helpBranch === "kumasi" && buildTrack({ ...base, branch: "accra" }).helpBranch === "accra" && buildTrack({ ...base, branch: "both" }).helpBranch === "accra");
ok("an unknown status does not break the page", buildTrack({ ...base, status: "mystery" }).steps.length === 8);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

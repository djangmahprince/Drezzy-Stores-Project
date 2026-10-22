// WhatsApp message wording and links. Run with: npm run test:whatsapp
import { waNumber, whatsappLink, whatsappText } from "../../src/lib/notify/whatsapp.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) pass++; else fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`); };
const o = { number: "DRZ-1027", name: "Ama Mensah", status: "to_confirm", total: 450, paid: 225, balance: 225, method: "home" };

ok("international format becomes wa.me digits", waNumber("+233240000000") === "233240000000");
ok("local format too", waNumber("024 000 0000") === "233240000000");
ok("a foreign or short number is refused", waNumber("+447700900123") === null && waNumber("0240") === null);
ok("every message greets by first name and names the order", ["awaiting_payment", "to_confirm", "to_source", "packed", "dispatched", "failed_delivery", "delivered", "cancelled"].every((s) => { const t = whatsappText({ ...o, status: s }); return t.startsWith("Hi Ama,") && t.includes("DRZ-1027"); }));
ok("awaiting payment says how much is outstanding", /GHS 225/.test(whatsappText({ ...o, status: "awaiting_payment" })));
ok("out for delivery reminds of the balance and names the rider", /GHS 225 ready/.test(whatsappText({ ...o, status: "out_for_delivery", riderName: "Yaw", riderPhone: "0200000000" })) && /Yaw \(0200000000\)/.test(whatsappText({ ...o, status: "out_for_delivery", riderName: "Yaw", riderPhone: "0200000000" })));
ok("no balance line when nothing is owed", !/ready on delivery/.test(whatsappText({ ...o, status: "dispatched", balance: 0 })));
ok("pickup orders say pickup, not rider", /pickup/.test(whatsappText({ ...o, status: "dispatched", method: "pickup" })) && !/rider/.test(whatsappText({ ...o, status: "dispatched", method: "pickup" })));
ok("a cancelled paid order mentions the refund", /refund/.test(whatsappText({ ...o, status: "cancelled" })) && !/refund/.test(whatsappText({ ...o, status: "cancelled", paid: 0 })));
ok("an unknown status still gives a greeting", whatsappText({ ...o, status: "weird" }).startsWith("Hi Ama"));
const link = whatsappLink("0240000000", "Hi & welcome: 100%");
ok("the link encodes the message", link === "https://wa.me/233240000000?text=Hi%20%26%20welcome%3A%20100%25", link);
ok("no link for an unusable number", whatsappLink("abc", "x") === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

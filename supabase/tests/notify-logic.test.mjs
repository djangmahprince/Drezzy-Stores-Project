// Customer email wording. Run with: npm run test:notify-logic
import { renderOrderMail } from "../../src/lib/notify/templates.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) pass++; else fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`); };
const m = { number: "DRZ-1027", name: "Ama Mensah", headline: "Confirmed by Drezzy", total: 450, paid: 225, balance: 225 };

const placed = renderOrderMail("order_placed", { ...m, paid: 0, balance: 450 }, "https://drezzy.example/");
ok("a confirmation names the order", /DRZ-1027/.test(placed.subject) && /Thank you/.test(placed.text));
ok("it greets by first name", placed.text.startsWith("Hi Ama,"));
ok("it links to the tracker once, with no double slash", placed.text.includes("https://drezzy.example/track?order=DRZ-1027") && !placed.text.includes("example//"));
const upd = renderOrderMail("order_update", m, "https://x.co");
ok("an update puts the headline in the subject", upd.subject === "DRZ-1027: Confirmed by Drezzy");
ok("it shows the balance when part paid", /Balance on delivery GHS 225/.test(upd.text) && /Paid GHS 225/.test(upd.text));
const full = renderOrderMail("order_update", { ...m, paid: 450, balance: 0 }, "https://x.co");
ok("no balance line when paid in full", !/Balance/.test(full.text));
const evil = renderOrderMail("order_update", { ...m, name: '<img src=x onerror=alert(1)>', headline: '<b>hi</b>' }, "https://x.co");
ok("customer-supplied text cannot inject HTML", !/<img|<b>/.test(evil.html) && /&lt;img/.test(evil.html));
ok("an empty name still reads naturally", renderOrderMail("order_update", { ...m, name: "  " }, "https://x.co").text.startsWith("Hi there,"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

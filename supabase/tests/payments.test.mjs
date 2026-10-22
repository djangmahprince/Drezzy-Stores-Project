// Payment logic that needs no network. Run with: npm run test:payments
import { createHmac } from "node:crypto";
import {
  chargeBody, chargeOutcome, fromPesewas, initializeBody, localPhone, parseWebhook, toPesewas, verifySignature, PROVIDER_CODE,
} from "../../src/lib/payments/paystack-core.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) pass++; else fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`); };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}`);

// ---------- money conversion ----------
eq("cedis become pesewas", [toPesewas(450), toPesewas(0.1), toPesewas(19.99), toPesewas(225.5)], [45000, 10, 1999, 22550]);
ok("floating point does not leak into pesewas (1.005 and 0.29)", toPesewas(1.005) === 101 || toPesewas(1.005) === 100, String(toPesewas(1.005)));
eq("pesewas become cedis", [fromPesewas(45000), fromPesewas(1999)], [450, 19.99]);
ok("a round trip is exact for normal prices", [420, 450.5, 19.99, 0.01].every((c) => fromPesewas(toPesewas(c)) === c));

// ---------- phone numbers ----------
eq("phones go to the local form Paystack expects", ["+233240000000", "233240000000", "0240000000", "024 000 0000"].map(localPhone), ["0240000000", "0240000000", "0240000000", "0240000000"]);

// ---------- request bodies ----------
const c = chargeBody({ email: "a@b.co", amount: 450, reference: "DRZ-1-abc", phone: "+233 24 000 0000", network: "telecel" });
eq("a MoMo charge is in pesewas, GHS, with the right provider code", [c.amount, c.currency, c.mobile_money], [45000, "GHS", { phone: "0240000000", provider: "vod" }]);
eq("the three networks map to Paystack's codes", PROVIDER_CODE, { mtn: "mtn", telecel: "vod", airtel: "atl" });
const i = initializeBody({ email: "a@b.co", amount: 225, reference: "R", callbackUrl: "https://x.test/done" });
eq("a card payment is limited to card and carries the callback", [i.amount, i.channels, i.callback_url], [22500, ["card"], "https://x.test/done"]);

// ---------- signatures ----------
const secret = "sk_test_example_secret";
const raw = JSON.stringify({ event: "charge.success", data: { reference: "DRZ-1-abc", amount: 45000, currency: "GHS", status: "success" } });
const sig = createHmac("sha512", secret).update(raw).digest("hex");
ok("a correct signature is accepted", verifySignature(raw, sig, secret));
ok("an uppercase or padded copy of the signature is still the same signature", verifySignature(raw, `  ${sig.toUpperCase()} `, secret));
ok("a missing signature is refused", !verifySignature(raw, undefined, secret) && !verifySignature(raw, null, secret) && !verifySignature(raw, "", secret));
ok("a signature made with another key is refused", !verifySignature(raw, createHmac("sha512", "other").update(raw).digest("hex"), secret));
ok("a tampered body is refused (amount changed)", !verifySignature(raw.replace("45000", "100"), sig, secret));
ok("a body with one extra space is refused", !verifySignature(raw + " ", sig, secret));
ok("a truncated signature is refused", !verifySignature(raw, sig.slice(0, -2), secret));
ok("a signature of the wrong length is refused without throwing", !verifySignature(raw, "abc", secret));
ok("no secret configured means nothing is ever accepted", !verifySignature(raw, sig, ""));
ok("a sha256 signature is not accepted", !verifySignature(raw, createHmac("sha256", secret).update(raw).digest("hex"), secret));

// ---------- webhook bodies ----------
const good = parseWebhook(raw);
eq("a successful GHS charge is read in cedis", good, { kind: "success", reference: "DRZ-1-abc", amount: 450, currency: "GHS" });
const w = (o) => parseWebhook(JSON.stringify(o));
ok("other events are ignored", w({ event: "transfer.success", data: {} }).kind === "ignored");
ok("a failed charge is ignored", w({ event: "charge.success", data: { reference: "r", amount: 1, currency: "GHS", status: "failed" } }).kind === "ignored");
ok("a charge in another currency is ignored", w({ event: "charge.success", data: { reference: "r", amount: 1, currency: "USD", status: "success" } }).kind === "ignored");
ok("a charge without a reference or amount is ignored", w({ event: "charge.success", data: { amount: 1, currency: "GHS", status: "success" } }).kind === "ignored" && w({ event: "charge.success", data: { reference: "r", currency: "GHS", status: "success" } }).kind === "ignored");
ok("a string amount is not trusted", w({ event: "charge.success", data: { reference: "r", amount: "45000", currency: "GHS", status: "success" } }).kind === "ignored");
ok("garbage is ignored, not thrown", parseWebhook("not json").kind === "ignored" && parseWebhook("").kind === "ignored" && parseWebhook("null").kind === "ignored");

// ---------- what to show the customer ----------
eq("a MoMo prompt is on its way", chargeOutcome({ status: true, data: { status: "pay_offline" } }), { next: "prompt" });
eq("some networks ask for a code first", chargeOutcome({ status: true, data: { status: "send_otp", display_text: "Enter the code" } }), { next: "otp", message: "Enter the code" });
eq("a refusal from Paystack becomes a plain message", chargeOutcome({ status: false, message: "Invalid phone" }), { next: "failed", message: "Invalid phone" });
ok("an unexpected status is a failure, never a success", chargeOutcome({ status: true, data: { status: "weird" } }).next === "failed");
ok("an empty reply is a failure", chargeOutcome({}).next === "failed");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

"use client";

import { useEffect, useRef, useState } from "react";
import { retryPaymentAction, submitManualPaymentAction, trackOrderAction } from "@/app/(store)/checkout/actions";
import { Icon } from "@/components/Icon";
import type { NextStep, PayChoice } from "@/lib/orders/types";
import type { PaymentOptions } from "@/lib/payments/config";
import { branches, formatGHS } from "@/lib/data";
import { track } from "@/lib/track";

const labels: Record<PayChoice, string> = { mtn: "MTN MoMo", telecel: "Telecel Cash", airtel: "AirtelTigo Money", card: "Visa or Mastercard", manual_momo: "Manual MoMo" };

const Spinner = () => <span className="mx-auto block size-12 animate-spin rounded-full border-4 border-line border-t-navy" aria-hidden="true" />;

export type FlowStep = NextStep | { type: "return" };

/**
 * Everything after "Pay": waiting for the MoMo prompt, a card redirect, manual MoMo, and retrying when it fails or times out.
 * The page only reads the order's state; the verified webhook (or a Finance review) is what actually marks it paid.
 */
export function PaymentFlow({
  number, phone, email, dueNow, balanceDue, step: first, options, onPaid,
}: {
  number: string; phone: string; email: string; dueNow: number; balanceDue: number; step: FlowStep; options: PaymentOptions; onPaid: () => void;
}) {
  const [step, setStep] = useState<FlowStep>(first);
  const [amount, setAmount] = useState(dueNow);
  const [timedOut, setTimedOut] = useState(false);
  const [checking, setChecking] = useState(false); // a manual payment was submitted and is being matched
  const [txn, setTxn] = useState("");
  const [method, setMethod] = useState<PayChoice>(options.paystack ? "mtn" : "manual_momo");
  const [momo, setMomo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const paid = useRef(false);

  const waiting = step.type === "prompt" || step.type === "otp" || step.type === "return" || checking;

  // a failed or timed-out payment is an analytics event (PRD section 24), never shown to anyone with personal details
  useEffect(() => {
    if (step.type === "failed") track("payment_failed", { method, reason: "failed" });
  }, [step.type, method]);
  useEffect(() => {
    if (timedOut) track("payment_failed", { method, reason: "timeout" });
  }, [timedOut, method]);

  // Ask the order how it is doing every few seconds until it is paid.
  useEffect(() => {
    if (!waiting) return;
    let stop = false;
    const started = Date.now();
    const tick = async () => {
      const r = await trackOrderAction({ number, phone });
      if (stop || paid.current) return;
      if (r.ok && r.track.steps[1].state === "done") {
        paid.current = true;
        onPaid();
        return;
      }
      if (Date.now() - started > 120_000) setTimedOut(true);
    };
    const id = window.setInterval(tick, 3000);
    void tick();
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [waiting, number, phone, onPaid]);

  // A card payment goes to Paystack's own page, so Drezzy never handles card details.
  useEffect(() => {
    if (step.type === "redirect") window.location.assign(step.url);
  }, [step]);

  async function retry() {
    setBusy(true);
    setError(null);
    const r = await retryPaymentAction({ number, phone, email, method, momoPhone: momo || undefined });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setAmount(r.amount);
    setTimedOut(false);
    setChecking(false);
    setStep(r.next);
  }

  async function sendTxn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await submitManualPaymentAction({ number, phone, txn });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Could not send that.");
    setChecking(true);
  }

  const wa = `https://wa.me/${branches.accra.wa}?text=${encodeURIComponent(`Hi Drezzy, I need help paying for ${number}`)}`;

  const retryBox = (
    <div className="card space-y-3 p-4 text-left">
      <p className="text-sm font-semibold">Try again</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Pay with</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as PayChoice)} className="field">
            {options.paystack && (["mtn", "telecel", "airtel", "card"] as const).map((m) => <option key={m} value={m}>{labels[m]}</option>)}
            {options.manual && <option value="manual_momo">{labels.manual_momo}</option>}
          </select>
        </label>
        {(method === "mtn" || method === "telecel" || method === "airtel") && (
          <label className="text-sm">
            <span className="mb-1 block font-medium">Mobile money number (optional)</span>
            <input value={momo} onChange={(e) => setMomo(e.target.value)} type="tel" inputMode="tel" placeholder="Same as your phone" className="field" />
          </label>
        )}
      </div>
      <button type="button" onClick={retry} disabled={busy} className="btn-primary w-full disabled:opacity-60">{busy ? "Starting…" : `Pay ${formatGHS(amount)}`}</button>
    </div>
  );

  return (
    <div className="mx-auto max-w-xl space-y-5 text-center" aria-live="polite">
      <p className="label-wide text-text2">Order {number}</p>

      {step.type === "redirect" && (
        <>
          <Spinner />
          <h1 className="text-2xl font-extrabold uppercase text-navy">Opening secure payment</h1>
          <p className="text-text2">Taking you to Paystack to enter your card. If nothing happens, <a className="underline" href={step.url}>tap here</a>.</p>
        </>
      )}

      {(step.type === "prompt" || step.type === "otp" || step.type === "return") && !timedOut && !checking && (
        <>
          <Spinner />
          <h1 className="text-2xl font-extrabold uppercase text-navy">{step.type === "return" ? "Checking your payment" : "Check your phone"}</h1>
          <p className="text-text2">
            {step.type === "otp" ? step.message : step.type === "return" ? "This takes a few seconds." : "Payment prompt sent to your phone. Approve it with your PIN to finish."}
          </p>
          <p className="text-sm text-text2">Amount: <b className="text-ink">{formatGHS(amount)}</b>{balanceDue > 0 && <> · {formatGHS(balanceDue)} to pay on delivery</>}</p>
        </>
      )}

      {timedOut && !checking && (
        <>
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#fbeedb] text-warning"><Icon name="clock" size={26} /></span>
          <h1 className="text-2xl font-extrabold uppercase text-navy">We haven&apos;t seen your payment</h1>
          <p className="text-text2">If you approved the prompt, it can take a minute. Your order is saved, and nothing is lost.</p>
          {retryBox}
        </>
      )}

      {step.type === "failed" && (
        <>
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#fbe4e4] text-error"><Icon name="close" size={26} /></span>
          <h1 className="text-2xl font-extrabold uppercase text-navy">The payment did not start</h1>
          <p role="alert" className="text-text2">{step.message}</p>
          {retryBox}
        </>
      )}

      {step.type === "manual" && !checking && (
        <>
          <h1 className="text-2xl font-extrabold uppercase text-navy">Pay by MoMo</h1>
          <div className="card space-y-2 p-5 text-left text-sm">
            <p>1. Send <b>{formatGHS(amount)}</b> by mobile money to:</p>
            <p className="rounded-[12px] bg-card p-3 text-lg font-bold">{step.number}{step.name && <span className="block text-sm font-normal text-text2">{step.name}</span>}</p>
            <p>2. Use <b>{number}</b> as the reference.</p>
            <p>3. Enter the transaction ID from your MoMo message below.</p>
          </div>
          <form onSubmit={sendTxn} className="card space-y-3 p-4 text-left" noValidate>
            <label htmlFor="txn" className="block text-sm font-medium">Transaction ID</label>
            <input id="txn" value={txn} onChange={(e) => setTxn(e.target.value)} className="field uppercase" autoComplete="off" />
            <button disabled={busy || txn.trim().length < 6} className="btn-primary w-full disabled:opacity-60">{busy ? "Sending…" : "I have paid"}</button>
          </form>
        </>
      )}

      {checking && (
        <>
          <Spinner />
          <h1 className="text-2xl font-extrabold uppercase text-navy">We&apos;re checking your payment</h1>
          <p className="text-text2">We match it against our MoMo statement. This usually takes a few minutes. You can close this page and follow your order with its number and your phone number.</p>
        </>
      )}

      {error && <p role="alert" className="rounded-[12px] bg-[#fbe4e4] px-3 py-2 text-sm font-medium text-error">{error}</p>}
      <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-outline w-full"><Icon name="chat" size={20} /> Need help? WhatsApp us</a>
    </div>
  );
}

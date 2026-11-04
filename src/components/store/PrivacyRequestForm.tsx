"use client";

import { useState } from "react";
import { dataRequestAction } from "@/app/(store)/actions";

const kinds = [["access", "Send me a copy of my data"], ["correct", "Correct my data"], ["delete", "Delete my data"], ["withdraw_consent", "Stop marketing messages"]] as const;

export function PrivacyRequestForm() {
  const [kind, setKind] = useState<string>("access");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [details, setDetails] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  return (
    <form className="card mt-6 space-y-4 p-5" onSubmit={async (e) => {
      e.preventDefault();
      const r = await dataRequestAction(kind, details, email || undefined, phone || undefined);
      setMsg(r.ok ? { text: "Thank you. We have your request and will reply within 30 days." } : { text: r.error, bad: true });
    }}>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">What would you like us to do?</legend>
        {kinds.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} className="size-5 accent-[#00115b]" /> {l}</label>)}
      </fieldset>
      <label className="block text-sm"><span className="mb-1 block font-medium">Email you used with us</span><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      <label className="block text-sm"><span className="mb-1 block font-medium">Or phone you used at checkout</span><input className="field" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" /></label>
      <label className="block text-sm"><span className="mb-1 block font-medium">Details (optional)</span><textarea className="field py-2" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} /></label>
      <p className="text-xs text-text2">To protect you, we confirm it is really you before we send or delete anything.</p>
      {msg && <p role={msg.bad ? "alert" : "status"} className={`rounded-[12px] px-3 py-2 text-sm ${msg.bad ? "bg-[#fbe4e4] text-error" : "bg-[#e3f5ee] text-success"}`}>{msg.text}</p>}
      <button className="btn-primary">Send request</button>
    </form>
  );
}

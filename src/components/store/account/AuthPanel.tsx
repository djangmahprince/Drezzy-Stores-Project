"use client";

import { useState } from "react";
import { signInAction } from "@/app/(store)/account/actions";
import { Note } from "@/components/store/account/parts";
import { createClient } from "@/lib/supabase/browser";
import { track } from "@/lib/track";

const google = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";
const phoneOtp = process.env.NEXT_PUBLIC_PHONE_OTP === "1";

/**
 * Sign in, create an account, reset a password (FR-ACC-001, 002), and, when switched on, Google and phone one-time codes
 * (FR-ACC-003). Sign-in goes through the server so it can be rate-limited and locked after repeated failures (FR-ACC-013).
 */
export function AuthPanel({ live, onSignedIn }: { live: boolean; onSignedIn: () => void }) {
  const [mode, setMode] = useState<"in" | "up" | "phone">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  const emailErr = !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? "Enter a valid email address." : "";
  const passErr = password.length < 8 ? "Use at least 8 characters." : "";
  const intlPhone = () => {
    const d = phone.replace(/[\s().-]/g, "");
    return /^0\d{9}$/.test(d) ? `+233${d.slice(1)}` : /^\+?233\d{9}$/.test(d) ? `+${d.replace(/^\+/, "")}` : null;
  };

  async function submit() {
    setTried(true);
    if (!live) return setMsg({ text: "Accounts switch on once the shop is connected. You can already check out as a guest.", bad: false });
    if (mode === "phone") return phoneStep();
    if (emailErr || passErr || (mode === "up" && name.trim().length < 2)) return;
    setBusy(true);
    setMsg(null);
    if (mode === "in") {
      const r = await signInAction(email, password);
      if (!r.ok) setMsg({ text: r.error, bad: true });
      else {
        track("login", { method: "email" });
        setPassword("");
        onSignedIn();
      }
    } else {
      const ref = new URLSearchParams(window.location.search).get("ref") ?? undefined;
      const { error } = await createClient().auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/account`, data: { full_name: name.trim(), ref } } });
      if (!error) track("sign_up", { method: "email" });
      setMsg(error
        ? { text: error.message.toLowerCase().includes("already") ? "That email already has an account. Sign in instead." : "We could not create the account. Please try again.", bad: true }
        : { text: "Check your email and tap the link to confirm your account. Past orders with that email appear once you have.", bad: false });
    }
    setBusy(false);
  }

  async function phoneStep() {
    const p = intlPhone();
    if (!p) return setMsg({ text: "Enter a Ghana number, for example 024 000 0000.", bad: true });
    setBusy(true);
    const sb = createClient();
    if (!codeSent) {
      const { error } = await sb.auth.signInWithOtp({ phone: p });
      setMsg(error ? { text: "We could not send a code right now. Try email instead.", bad: true } : { text: "We sent a 6-digit code by SMS.", bad: false });
      if (!error) setCodeSent(true);
    } else {
      const { error } = await sb.auth.verifyOtp({ phone: p, token: code.trim(), type: "sms" });
      if (error) setMsg({ text: "That code is not right or has expired.", bad: true });
      else {
        track("login", { method: "phone" });
        onSignedIn();
      }
    }
    setBusy(false);
  }

  async function reset() {
    if (emailErr) return setMsg({ text: "Enter your email above first.", bad: true });
    if (!live) return;
    setBusy(true);
    // the link works once and expires after 60 minutes (set in Supabase Auth, see the README)
    await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/account?reset=1` });
    setMsg({ text: "If that email has an account, a reset link is on its way. It works once, for 60 minutes.", bad: false });
    setBusy(false);
  }

  async function withGoogle() {
    await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/account` } });
  }

  const tabs: { id: "in" | "up" | "phone"; label: string }[] = [{ id: "in", label: "Sign in" }, { id: "up", label: "Create account" }, ...(phoneOtp ? [{ id: "phone" as const, label: "Phone code" }] : [])];

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} className="card mx-auto max-w-md space-y-4 p-5">
      <div className={`grid gap-1 rounded-[12px] bg-card p-1 ${tabs.length === 3 ? "grid-cols-3" : "grid-cols-2"}`} role="group" aria-label="How to sign in">
        {tabs.map((t) => (
          <button type="button" key={t.id} onClick={() => { setMode(t.id); setMsg(null); }} aria-pressed={mode === t.id} className={`min-h-10 rounded-[10px] text-sm font-semibold ${mode === t.id ? "bg-white text-navy shadow-sm" : "text-text2"}`}>{t.label}</button>
        ))}
      </div>

      {mode === "phone" ? (
        <>
          <div>
            <label htmlFor="a-phone" className="mb-1 block text-sm font-medium">Phone</label>
            <input id="a-phone" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" className="field" placeholder="024 000 0000" />
          </div>
          {codeSent && (
            <div>
              <label htmlFor="a-code" className="mb-1 block text-sm font-medium">Code</label>
              <input id="a-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" className="field" maxLength={6} />
            </div>
          )}
          <button disabled={busy} className="btn-primary w-full disabled:opacity-60">{busy ? "One moment…" : codeSent ? "Sign in" : "Send me a code"}</button>
        </>
      ) : (
        <>
          {mode === "up" && (
            <div>
              <label htmlFor="a-name" className="mb-1 block text-sm font-medium">Full name</label>
              <input id="a-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="field" />
              {tried && name.trim().length < 2 && <p role="alert" className="mt-1 text-sm font-medium text-error">Enter your name.</p>}
            </div>
          )}
          <div>
            <label htmlFor="a-email" className="mb-1 block text-sm font-medium">Email</label>
            <input id="a-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" className="field" aria-invalid={tried && !!emailErr} />
            {tried && emailErr && <p role="alert" className="mt-1 text-sm font-medium text-error">{emailErr}</p>}
          </div>
          <div>
            <label htmlFor="a-pass" className="mb-1 block text-sm font-medium">Password</label>
            <input id="a-pass" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} className="field" aria-invalid={tried && !!passErr} />
            {tried && passErr && <p role="alert" className="mt-1 text-sm font-medium text-error">{passErr}</p>}
          </div>
          <button disabled={busy} className="btn-primary w-full disabled:opacity-60">{busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}</button>
          {mode === "in" && <button type="button" onClick={() => void reset()} className="text-sm text-navy underline">Forgot your password?</button>}
        </>
      )}
      {google && live && mode !== "phone" && (
        <button type="button" onClick={() => void withGoogle()} className="btn-outline w-full">Continue with Google</button>
      )}
      <Note msg={msg} />
      <p className="text-sm text-text2">An account gives you faster checkout, order history on any device, saved sizes, wishlist alerts and reward points.</p>
    </form>
  );
}

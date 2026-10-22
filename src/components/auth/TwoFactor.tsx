"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/browser";

/**
 * Staff 2FA with an authenticator app (TOTP). "setup" enrols a new factor and shows its QR code;
 * "verify" asks for the 6-digit code. Either way the session becomes aal2, which the database requires for staff data.
 */
export function TwoFactor({ mode }: { mode: "setup" | "verify" }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const started = useRef(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const { data: list } = await supabase.auth.mfa.listFactors();
      const verified = list?.totp?.[0];
      if (mode === "verify" && verified) {
        setFactorId(verified.id);
        return;
      }
      // Clear half-finished enrolments so a fresh QR code can be issued.
      for (const f of list?.all ?? []) {
        if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Drezzy dashboard" });
      if (err || !data) {
        setError("Could not start 2FA setup. Refresh the page and try again.");
        return;
      }
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
    })();
  }, [mode, supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || code.length !== 6) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (err) {
      setError("That code is not right. Check the code in your app and try again.");
      setBusy(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {mode === "setup" && (
        <div className="space-y-3 text-sm">
          <p>Staff accounts need two-factor sign-in. Scan this code with an authenticator app (Google Authenticator, Microsoft Authenticator or similar), then enter the 6-digit code it shows.</p>
          {qr ? (
            <div className="flex flex-col items-center gap-2 rounded-[12px] border border-line bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR code for your authenticator app" className="size-44" />
              {secret && <p className="text-center text-xs text-text2">Can&apos;t scan? Enter this key instead:<br /><code className="select-all break-all font-mono text-ink">{secret}</code></p>}
            </div>
          ) : (
            !error && <div className="h-48 animate-pulse rounded-[12px] bg-card" aria-busy="true" />
          )}
        </div>
      )}
      {mode === "verify" && <p className="text-sm">Open your authenticator app and enter the 6-digit code for Drezzy.</p>}

      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="code" className="mb-1 block text-sm font-medium">6-digit code</label>
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            className="field text-center text-xl tracking-[0.5em]"
            aria-invalid={!!error}
          />
        </div>
        {error && <p role="alert" className="rounded-[12px] bg-[#fbe4e4] px-3 py-2 text-sm font-medium text-error">{error}</p>}
        <button type="submit" disabled={busy || !factorId || code.length !== 6} className="btn-primary w-full disabled:opacity-60">
          {busy ? "Checking…" : mode === "setup" ? "Turn on 2FA and continue" : "Verify and continue"}
        </button>
      </form>
      <form action={signOut}><button className="w-full text-center text-sm text-text2 underline">Use a different account</button></form>
    </div>
  );
}

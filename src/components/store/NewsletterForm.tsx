"use client";

import { useState } from "react";
import { newsletterAction } from "@/app/(store)/actions";
import { track } from "@/lib/track";

/** Newsletter sign-up (FR-JR-008). Consent is the act of signing up; every email has a one-click unsubscribe. */
export function NewsletterForm({ placement = "article" }: { placement?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-8 rounded-[24px] bg-navy p-6 text-base text-white">
      <p className="font-bold">New looks in your inbox</p>
      {state === "done" ? (
        <p className="mt-3 text-lime" role="status">You&apos;re in. Watch your inbox for new looks.</p>
      ) : (
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return setError("Enter a valid email address.");
            setState("busy");
            const r = await newsletterAction(email, placement);
            if (r.ok) {
              track("newsletter_subscribe", { placement });
              setState("done");
            } else {
              setError(r.error === "This works once the shop is connected." ? null : r.error);
              setState(r.error === "This works once the shop is connected." ? "done" : "idle");
            }
          }}
          className="mt-3"
        >
          <div className="flex gap-2">
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="Email address" aria-label="Email address" className="field flex-1 !border-white/20 text-ink" />
            <button disabled={state === "busy"} className="btn-lime shrink-0">{state === "busy" ? "…" : "Sign up"}</button>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-lime">{error}</p>}
          <p className="mt-2 text-xs text-white/70">A short digest of new Drip School stories. Unsubscribe in one click.</p>
        </form>
      )}
    </div>
  );
}

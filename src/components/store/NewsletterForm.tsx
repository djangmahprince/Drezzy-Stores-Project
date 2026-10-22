"use client";

import { useState } from "react";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "error" | "done">("idle");

  return (
    <div className="mt-8 rounded-[24px] bg-navy p-6 text-base text-white">
      <p className="font-bold">New looks in your inbox</p>
      {state === "done" ? (
        <p className="mt-3 text-lime" role="status">You&apos;re in. Watch your inbox for new looks.</p>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setState(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? "done" : "error");
          }}
          className="mt-3"
        >
          <div className="flex gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              placeholder="Email address"
              aria-label="Email address"
              aria-invalid={state === "error"}
              className="field text-ink"
            />
            <button className="btn-lime">Join</button>
          </div>
          {state === "error" && <p role="alert" className="mt-2 text-sm text-lime">Enter a valid email address.</p>}
        </form>
      )}
    </div>
  );
}

"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "@/app/login/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required className="field" aria-invalid={!!state.error} />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field" aria-invalid={!!state.error} />
      </div>
      {state.error && <p role="alert" className="rounded-[12px] bg-[#fbe4e4] px-3 py-2 text-sm font-medium text-error">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">{pending ? "Signing in…" : "Sign in"}</button>
      <p className="text-center text-xs text-text2">Staff accounts are created by the Owner or an Admin. You will be asked for a 2FA code.</p>
    </form>
  );
}

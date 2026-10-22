"use client";

import { useActionState } from "react";
import { changePassword, type PasswordState } from "@/app/dashboard/account/actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, {});
  return (
    <form action={action} className="card max-w-md space-y-4 p-5" noValidate>
      <h2 className="font-semibold">Change password</h2>
      <div><label htmlFor="pw" className="mb-1 block text-sm font-medium">New password</label><input id="pw" name="password" type="password" autoComplete="new-password" className="field" /></div>
      <div><label htmlFor="pw2" className="mb-1 block text-sm font-medium">Repeat it</label><input id="pw2" name="confirm" type="password" autoComplete="new-password" className="field" /></div>
      <p className="text-xs text-text2">At least 12 characters, with upper and lower case letters and a number.</p>
      {state.error && <p role="alert" className="rounded-[12px] bg-[#fbe4e4] px-3 py-2 text-sm font-medium text-error">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-[12px] bg-[#e3f5ee] px-3 py-2 text-sm font-medium text-success">Password changed.</p>}
      <button disabled={pending} className="btn-primary !min-h-10 disabled:opacity-60">{pending ? "Saving…" : "Change password"}</button>
    </form>
  );
}

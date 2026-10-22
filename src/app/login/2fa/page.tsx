import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { TwoFactor } from "@/components/auth/TwoFactor";
import { getStaffState } from "@/lib/auth";

export const metadata = { title: "Two-factor sign in" };

async function Gate() {
  const state = await getStaffState();
  if (state.status === "ok") redirect("/dashboard");
  if (state.status === "anonymous" || state.status === "unconfigured") redirect("/login");
  if (state.status === "not_staff") redirect("/login?error=not_staff");

  const setup = state.status === "needs_mfa_setup";
  return (
    <AuthFrame title={setup ? "Set up 2FA" : "Enter your code"} intro={setup ? "One-time setup" : "Two-factor sign-in"}>
      <TwoFactor mode={setup ? "setup" : "verify"} />
    </AuthFrame>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-navy" aria-busy="true" />}>
      <Gate />
    </Suspense>
  );
}

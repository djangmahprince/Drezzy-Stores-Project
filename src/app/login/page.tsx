import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signOut } from "@/app/login/actions";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { LoginForm } from "@/components/auth/LoginForm";
import { getStaffState } from "@/lib/auth";

export const metadata = { title: "Staff sign in" };

async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const state = await getStaffState();

  if (state.status === "ok") redirect("/dashboard");
  if (state.status === "needs_mfa" || state.status === "needs_mfa_setup") redirect("/login/2fa");

  if (state.status === "unconfigured") {
    return (
      <AuthFrame title="Sign-in is not set up yet" intro="The staff login needs a Supabase project.">
        <Link href="/setup" className="btn-primary w-full">See the setup steps</Link>
      </AuthFrame>
    );
  }

  if (state.status === "not_staff" || error === "not_staff") {
    return (
      <AuthFrame title="No staff access" intro="You are signed in, but this account is not set up as Drezzy staff, or it has been switched off. Ask the Owner or an Admin.">
        <form action={signOut}><button className="btn-outline w-full">Sign out</button></form>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Sign in" intro="Drezzy staff dashboard">
      <LoginForm next={next ?? "/dashboard"} />
    </AuthFrame>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-navy" aria-busy="true" />}>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}

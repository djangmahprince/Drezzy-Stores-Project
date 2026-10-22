import { Suspense } from "react";
import { PageHead } from "@/components/dashboard/DashShell";
import { DbGate } from "@/components/dashboard/Guard";
import { PasswordForm } from "@/components/dashboard/PasswordForm";
import { requireStaff } from "@/lib/auth";

export const metadata = { title: "Account" };

async function Who() {
  const me = await requireStaff();
  return (
    <div className="card mb-4 max-w-md space-y-1 p-5 text-sm">
      <p className="text-base font-semibold">{me.fullName}</p>
      <p className="text-text2">{me.email}</p>
      <p>{me.roleName} · {me.branch === "both" ? "Both branches" : me.branch === "accra" ? "Accra" : "Kumasi"}</p>
    </div>
  );
}

export default function Account() {
  return (
    <>
      <PageHead title="Your account" />
      <Suspense fallback={<div className="card mb-4 h-24 max-w-md animate-pulse" aria-busy="true" />}>
        <Who />
      </Suspense>
      <DbGate>
        <PasswordForm />
      </DbGate>
    </>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { signOut } from "@/app/login/actions";
import { PartnerJobs, type PartnerData } from "@/components/partner/PartnerJobs";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Delivery partner", robots: { index: false } };

async function Portal() {
  await connection();
  if (!isSupabaseConfigured) {
    return <p className="card p-6 text-sm text-text2">The partner portal needs the database. See <Link href="/setup" className="underline">setup</Link>.</p>;
  }
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login?next=/partner");
  const { data, error } = await supabase.rpc("partner_jobs");
  if (error || !data) {
    return (
      <div className="card space-y-3 p-6 text-sm">
        <p className="font-semibold">This login is not a delivery partner</p>
        <p className="text-text2">Ask Drezzy dispatch to link your email to your rider or courier record.</p>
        <form action={signOut}><button className="btn-outline !min-h-10">Sign out</button></form>
      </div>
    );
  }
  return <PartnerJobs d={data as PartnerData} />;
}

/** Riders, couriers and affiliates see only their own jobs (PRD section 5). No customer list, no prices, no delivery codes. */
export default function Partner() {
  return (
    <div className="min-h-screen bg-page">
      <header className="flex items-center justify-between bg-navy px-4 py-3 text-white">
        <p className="font-bold">Drezzy deliveries</p>
        <form action={signOut}><button className="text-sm underline">Sign out</button></form>
      </header>
      <main className="mx-auto max-w-xl p-4">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
          <Portal />
        </Suspense>
      </main>
    </div>
  );
}

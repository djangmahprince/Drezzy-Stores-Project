import { connection } from "next/server";
import { Beacon } from "@/components/store/Beacon";
import { Suspense } from "react";
import { CheckoutForm } from "@/components/store/CheckoutForm";
import { paymentOptions } from "@/lib/payments/config";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Checkout" };

// Which payment options are on depends on server settings, so they are read on every request. A newly added
// Paystack key or MoMo number then takes effect straight away, without rebuilding the site.
async function Form() {
  await connection();
  return (
    <>
      <Beacon name="checkout_started" />
      <CheckoutForm live={isSupabaseConfigured ? paymentOptions() : null} />
    </>
  );
}

export default function Checkout() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-2xl animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
      <Form />
    </Suspense>
  );
}

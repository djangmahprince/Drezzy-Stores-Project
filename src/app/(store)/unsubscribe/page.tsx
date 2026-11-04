import { Suspense } from "react";
import { UnsubscribeButton } from "@/components/store/UnsubscribeButton";

export const metadata = { title: "Unsubscribe", robots: { index: false } };

async function Content({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="card mx-auto max-w-md space-y-3 p-8 text-center">
      <h1 className="text-2xl font-bold">Unsubscribe from Drezzy news</h1>
      <p className="text-text2">You will stop getting the Drip School digest and offers. Order updates are not affected.</p>
      {token ? <UnsubscribeButton token={token} /> : <p className="text-error">This link is missing its code. Use the link in the email.</p>}
    </div>
  );
}

/** One-click unsubscribe for marketing email (FR-NT-005). */
export default function Unsubscribe({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return <Suspense fallback={null}><Content searchParams={searchParams} /></Suspense>;
}

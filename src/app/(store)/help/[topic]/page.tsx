import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { branches } from "@/lib/data";

type Topic = { title: string; intro: string; body: React.ReactNode };

const sizeRows = [
  ["39", "6", "6.5", "24.5"],
  ["40", "6.5", "7", "25"],
  ["41", "7.5", "8", "26"],
  ["42", "8", "8.5", "26.5"],
  ["43", "9", "9.5", "27.5"],
  ["44", "9.5", "10", "28"],
  ["45", "10.5", "11", "29"],
];

const topics: Record<string, Topic> = {
  delivery: {
    title: "Delivery",
    intro: "We deliver nationwide from our Accra and Kumasi branches.",
    body: (
      <>
        <h2>How it works</h2>
        <p>We do not keep stock. Once your payment is confirmed, we order your item from one of our trusted suppliers, check the size, colour and condition when it reaches our branch, then send it out with our own riders or a courier.</p>
        <h2>How long it takes</h2>
        <p>Every product page shows an estimate for your region. It adds the time to get the item from our supplier to the delivery time for where you live. Times are estimates, because our riders and couriers deliver.</p>
        <h2>Pickup</h2>
        <p>You can pick up from our Accra branch for free. We message you when your order is ready.</p>
        <h2>Track it</h2>
        <p>Use <Link href="/track">Track an order</Link> with your order number and phone number. No login needed.</p>
      </>
    ),
  },
  payment: {
    title: "Payment options",
    intro: "Pay with mobile money or card. MoMo comes first.",
    body: (
      <>
        <h2>Ways to pay</h2>
        <p>MTN MoMo, Telecel Cash, AirtelTigo Money, Visa and Mastercard. Payments are processed by Paystack, so Drezzy never sees your PIN or card number.</p>
        <h2>Pay in full or in two halves</h2>
        <p>If your delivery address is in Accra (or you pick up at our Accra branch), you can pay half now and the other half to the rider on delivery, by MoMo or cash. Anywhere outside Accra, including Kumasi, the full amount is paid at checkout, because we source your item once payment is in.</p>
        <h2>The delivery fee</h2>
        <p>The delivery fee is part of what you pay at checkout.</p>
      </>
    ),
  },
  "order-issues": {
    title: "Order issues and refunds",
    intro: "If something goes wrong, we will make it right or give you your money back.",
    body: (
      <>
        <h2>If we cannot get your item</h2>
        <p>Because we order from suppliers after you pay, very occasionally an item cannot be sourced. If that happens, we offer you an alternative or a full refund of what you paid.</p>
        <h2>Returns</h2>
        <p>We do not have a returns policy yet. If there is a problem with your order, contact us straight away and we will help.</p>
        <h2>Talk to a person</h2>
        <p>Accra: call {branches.accra.call} or WhatsApp {branches.accra.whatsapp}.<br />Kumasi: call or WhatsApp {branches.kumasi.call}.</p>
      </>
    ),
  },
  "size-guide": {
    title: "Size guide",
    intro: "Find your size before you order.",
    body: (
      <>
        <h2>Sneaker sizes</h2>
        <p>Our sizes are EU. This table is a guide. Brands fit differently, so check the fit note on each product page.</p>
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>EU</th><th>UK</th><th>US (men)</th><th>Foot length (cm)</th></tr></thead>
            <tbody>{sizeRows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <h2>How to measure</h2>
        <p>Stand on a sheet of paper, mark the heel and the tip of your longest toe, and measure the gap. Measure at the end of the day. Between two sizes, go up.</p>
        <p>Still not sure? <Link href="/drip-school/find-your-true-sneaker-size">Read our sizing guide</Link> or WhatsApp us.</p>
      </>
    ),
  },
  privacy: {
    title: "Privacy",
    intro: "How we handle your information.",
    body: (
      <>
        <p>We only collect what we need to deliver your order and look after you: your name, phone number, email and delivery address. We do not store your card details or mobile money PIN; payments are handled by Paystack.</p>
        <p>Our full privacy policy is being finalised before launch. Questions in the meantime? WhatsApp {branches.accra.whatsapp}.</p>
      </>
    ),
  },
  terms: {
    title: "Terms",
    intro: "The rules for using Drezzy Stores.",
    body: (
      <>
        <p>By placing an order you agree that delivery times are estimates, that orders outside Accra are paid in full at checkout, and that we will offer an alternative or a refund if an item cannot be sourced.</p>
        <p>Our full terms are being finalised before launch. Questions in the meantime? WhatsApp {branches.accra.whatsapp}.</p>
      </>
    ),
  },
};

export function generateStaticParams() {
  return Object.keys(topics).map((topic) => ({ topic }));
}

export async function generateMetadata({ params }: { params: Promise<{ topic: string }> }): Promise<Metadata> {
  const { topic } = await params;
  return topics[topic] ? { title: topics[topic].title } : {};
}

async function HelpContent({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  const t = topics[topic];
  if (!t) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <p className="label-wide text-text2">Help</p>
      <h1 className="mt-2 text-[28px] font-bold md:text-[40px]">{t.title}</h1>
      <p className="mt-2 text-lg text-text2">{t.intro}</p>
      <div className="mt-6 space-y-3 leading-relaxed [&_a]:font-semibold [&_a]:text-navy [&_a]:underline [&_h2]:mt-8 [&_h2]:text-[20px] [&_h2]:font-bold [&_table]:w-full [&_table]:text-left [&_table]:text-sm [&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_th]:bg-navy [&_th]:px-3 [&_th]:py-2 [&_th]:text-white [&_th:first-child]:rounded-tl-[12px] [&_th:last-child]:rounded-tr-[12px]">
        {t.body}
      </div>
      <nav className="mt-10 flex flex-wrap gap-2" aria-label="More help">
        {Object.entries(topics).filter(([k]) => k !== topic).map(([k, v]) => (
          <Link key={k} href={`/help/${k}`} className="chip min-h-10 border border-line bg-white px-4 text-sm text-navy hover:border-navy">{v.title}</Link>
        ))}
      </nav>
    </div>
  );
}

export default function Help({ params }: { params: Promise<{ topic: string }> }) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl animate-pulse space-y-4" aria-busy="true"><div className="h-10 w-1/2 rounded-[12px] bg-white" /><div className="h-40 rounded-[12px] bg-white" /></div>}>
      <HelpContent params={params} />
    </Suspense>
  );
}

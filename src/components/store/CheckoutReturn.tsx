"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Icon } from "@/components/Icon";
import { PaymentFlow } from "@/components/store/PaymentFlow";
import { clearCart } from "@/lib/cart";
import { formatGHS } from "@/lib/data";
import { useOrders } from "@/lib/orders";
import type { PaymentOptions } from "@/lib/payments/config";

const none: PaymentOptions = { paystack: true, manual: null };

/**
 * Where Paystack sends a customer back after a card payment. This page only WATCHES the order: it never marks anything
 * as paid itself. The phone number needed to look the order up comes from this device's memory of the order.
 */
export function CheckoutReturn({ order }: { order: string }) {
  const orders = useOrders();
  const [paid, setPaid] = useState(false);
  const known = orders.find((o) => o.id === order);
  const onPaid = useCallback(() => {
    clearCart();
    setPaid(true);
  }, []);

  if (!order || !known) {
    return (
      <div className="card mx-auto max-w-lg space-y-3 p-8 text-center">
        <p className="text-lg font-semibold">We can&apos;t check that from this device</p>
        <p className="text-sm text-text2">Use your order number and phone number to see how your payment is doing.</p>
        <Link href={order ? `/track?order=${encodeURIComponent(order)}` : "/track"} className="btn-primary">Track an order</Link>
      </div>
    );
  }

  if (paid) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-navy text-lime"><Icon name="check" size={32} /></span>
        <p className="label-wide mt-5 text-text2">Payment received</p>
        <h1 className="mt-2 text-[32px] font-extrabold uppercase leading-tight text-navy">Thank you, {known.name.split(" ")[0]}</h1>
        <p className="mt-2 text-text2">Your order number is <b className="text-ink">{known.id}</b>.{known.balance > 0 && <> {formatGHS(known.balance)} is due on delivery.</>}</p>
        <div className="mt-6 grid gap-3">
          <Link href={`/track?order=${known.id}&phone=${encodeURIComponent(known.phone)}`} className="btn-primary">Track this order</Link>
          <Link href="/shop" className="btn-outline">Keep shopping</Link>
        </div>
      </div>
    );
  }

  return <PaymentFlow number={known.id} phone={known.phone} email={known.email} dueNow={known.paid} balanceDue={known.balance} step={{ type: "return" }} options={none} onPaid={onPaid} />;
}

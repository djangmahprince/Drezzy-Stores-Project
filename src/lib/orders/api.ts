"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { advanceOrderAction } from "@/app/dashboard/orders/actions";
import { moveOrder, useDashOrders } from "@/lib/dash";
import type { DashOrder, Status } from "@/lib/orders/dash-types";

export type MoveOutcome = { ok: true } | { ok: false; reason: string };

/**
 * The orders a dashboard screen shows, and how to move one along. With the database connected the orders come from the
 * server and a move is an order action (which enforces the PRD rules); in the design preview they come from the sample store.
 * A move shows straight away and is undone if the database refuses it.
 */
export function useOrdersApi(mode: "db" | "demo", initial: DashOrder[]) {
  const router = useRouter();
  const sample = useDashOrders();
  const [overrides, setOverrides] = useState<Record<string, Status>>({});

  const base = mode === "db" ? initial : sample;
  const orders = base.map((o) => (overrides[o.id] && overrides[o.id] !== o.status ? { ...o, status: overrides[o.id] } : o));

  async function move(id: string, to: Status): Promise<MoveOutcome> {
    if (mode === "demo") {
      const r = moveOrder(id, to);
      return r.ok ? { ok: true } : { ok: false, reason: r.reason };
    }
    const order = base.find((o) => o.id === id);
    if (!order?.dbId) return { ok: false, reason: "Order not found." };
    setOverrides((o) => ({ ...o, [id]: to }));
    const r = await advanceOrderAction(order.dbId, to);
    if (!r.ok) {
      setOverrides((o) => {
        const next = { ...o };
        delete next[id];
        return next;
      });
      return { ok: false, reason: r.error };
    }
    router.refresh();
    // once fresh data has arrived the override is redundant; drop it so later changes by others are not masked
    window.setTimeout(() => setOverrides((o) => {
      const next = { ...o };
      delete next[id];
      return next;
    }), 4000);
    return { ok: true };
  }

  return { orders, move, live: mode === "db" };
}

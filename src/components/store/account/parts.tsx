"use client";

// Small shared pieces for My Drezzy.

export function Note({ msg }: { msg: { text: string; bad?: boolean } | null }) {
  if (!msg) return null;
  return <p role={msg.bad ? "alert" : "status"} className={`rounded-[12px] px-3 py-2 text-sm ${msg.bad ? "bg-[#fbe4e4] text-error" : "bg-[#e3f5ee] text-success"}`}>{msg.text}</p>;
}

export function Empty({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-text2">{text}</p>
      {children && <div className="mt-1 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

const steps = ["awaiting_payment", "to_confirm", "to_source", "ready_to_pack", "packed", "dispatched", "out_for_delivery", "delivered"];
const labels = ["Placed", "Paid", "Confirmed", "Sourced", "Packed", "Dispatched", "On the way", "Delivered"];

/** A compact version of the order progress bar (PRD section 9). */
export function MiniProgress({ status }: { status: string }) {
  if (status === "cancelled") return <p className="mt-2 text-sm font-medium text-error">Cancelled</p>;
  const at = status === "failed_delivery" ? 6 : Math.max(0, steps.indexOf(status));
  return (
    <div className="mt-3" aria-label={`Progress: ${labels[at]}`}>
      <div className="flex gap-1">
        {steps.map((s, i) => <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= at ? "bg-navy" : "bg-line"}`} />)}
      </div>
      <p className="mt-1 text-xs text-text2">{status === "failed_delivery" ? "Delivery attempt failed. We will reschedule." : labels[at]}</p>
    </div>
  );
}

export const statusWord: Record<string, string> = {
  awaiting_payment: "Awaiting payment", to_confirm: "Payment confirmed", to_source: "Confirmed by Drezzy", ready_to_pack: "Item received at our branch",
  packed: "Checked and packed", dispatched: "Dispatched", out_for_delivery: "Out for delivery", delivered: "Delivered", failed_delivery: "Delivery attempt failed", cancelled: "Cancelled",
};

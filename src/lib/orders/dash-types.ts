// Order shapes used by the dashboard (list, board, detail). No imports, so server code, client code and tests can all load it.

export type Status =
  | "awaiting_payment" | "to_confirm" | "to_source" | "ready_to_pack" | "packed"
  | "dispatched" | "out" | "delivered" | "failed" | "cancelled";

export const stages: { id: Status; title: string; step: number }[] = [
  { id: "awaiting_payment", title: "Awaiting payment or check", step: 1 },
  { id: "to_confirm", title: "To confirm", step: 2 },
  { id: "to_source", title: "To source from supplier", step: 3 },
  { id: "ready_to_pack", title: "Received, ready to pack", step: 4 },
  { id: "packed", title: "Packed and checked", step: 5 },
  { id: "dispatched", title: "Dispatched", step: 6 },
  { id: "out", title: "Out for delivery", step: 7 },
  { id: "delivered", title: "Delivered", step: 8 },
  { id: "failed", title: "Failed delivery", step: 7 },
  { id: "cancelled", title: "Cancelled", step: 9 },
];

export const stageTitle = (s: Status) => stages.find((x) => x.id === s)!.title;

/** The database's status names, and ours. */
export const statusFromDb = (s: string): Status => (s === "out_for_delivery" ? "out" : s === "failed_delivery" ? "failed" : (s as Status));
export const statusToDb = (s: Status): string => (s === "out" ? "out_for_delivery" : s === "failed" ? "failed_delivery" : s);

export type DashOrder = {
  /** The order number, for example DRZ-1027. */
  id: string;
  /** The database id. Present on real orders; absent on the demo sample. */
  dbId?: string;
  customer: string;
  phone?: string;
  place: string;
  branch: "Accra" | "Kumasi";
  items: string;
  channel: "Web" | "WhatsApp" | "Instagram DM" | "Phone" | "Walk-in";
  pay: "paid" | "half" | "pending" | "unpaid";
  payNote: string;
  total: number;
  balance: number;
  agent: string;
  status: Status;
  age: string;
  /** True when the order has waited longer than the PRD's alert limits for its stage. */
  late?: boolean;
  courier?: string;
  log: { at: string; text: string }[];
  notes: string[];
  region?: string;
  source?: string;
  createdAt?: string;
  rider?: string;
};

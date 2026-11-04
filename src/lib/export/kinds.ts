// What can be exported, shared by the export screen and the server. No imports, so client and server can both load it.
export const exportKinds = ["orders", "customers", "money", "catalogue", "suppliers", "expenses", "targets", "reviews", "subscribers", "analytics", "feedback"] as const;
export type ExportKind = (typeof exportKinds)[number];
export const kindLabels: Record<ExportKind, string> = {
  orders: "Orders", customers: "Customers", money: "Money in and out", catalogue: "Catalogue", suppliers: "Suppliers", expenses: "Expenses",
  targets: "Targets and progress", reviews: "Reviews", subscribers: "Newsletter subscribers", analytics: "KPI summary", feedback: "Site feedback",
};

// Shared by server and client code. Must not import anything server-only.
// Mirrors the app_module enum and the permission matrix in supabase/migrations.

export const modules = [
  "products", "availability", "orders", "refunds", "customers", "staff", "salary", "expenses",
  "targets_set", "targets_view", "analytics", "content", "exports", "settings", "audit",
] as const;

export type Module = (typeof modules)[number];
export type Action = "view" | "create" | "edit" | "delete" | "export";

export const moduleLabels: Record<Module, string> = {
  products: "Products and categories",
  availability: "Availability and supplier orders",
  orders: "Orders",
  refunds: "Cancellations and refunds",
  customers: "Customers",
  staff: "Staff records and roles",
  salary: "Salary records",
  expenses: "Expenses, inflow and outflow",
  targets_set: "Set targets",
  targets_view: "View targets and own progress",
  analytics: "Analytics and KPIs",
  content: "Content and Drip School",
  exports: "Data export",
  settings: "Settings, integrations, templates",
  audit: "Audit log",
};

export type Permission = {
  module: Module;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
  scope: "all" | "own";
  restriction: string | null;
};

export type PermissionMap = Partial<Record<Module, Permission>>;

const flag: Record<Action, keyof Permission> = {
  view: "can_view",
  create: "can_create",
  edit: "can_edit",
  delete: "can_delete",
  export: "can_export",
};

export const can = (perms: PermissionMap, module: Module, action: Action = "view"): boolean =>
  Boolean(perms[module]?.[flag[action]]);

/** The dashboard menu. An item shows when the person can view any of its modules. */
export const dashNav: { href: string; label: string; modules: Module[] }[] = [
  { href: "/dashboard", label: "Dashboard", modules: [] }, // everyone's role home
  { href: "/dashboard/orders", label: "Orders", modules: ["orders"] },
  { href: "/dashboard/dispatch", label: "Dispatch board", modules: ["orders"] },
  { href: "/dashboard/logistics", label: "Logistics", modules: ["orders"] },
  { href: "/dashboard/products", label: "Products", modules: ["products"] },
  { href: "/dashboard/catalogue", label: "Catalogue and sourcing", modules: ["products", "availability"] },
  { href: "/dashboard/customers", label: "Customers", modules: ["customers"] },
  { href: "/dashboard/support", label: "Support inbox", modules: ["customers"] },
  { href: "/dashboard/staff", label: "Staff and targets", modules: ["targets_view", "targets_set", "staff"] },
  { href: "/dashboard/money", label: "Money", modules: ["expenses", "salary"] },
  { href: "/dashboard/analytics", label: "Analytics", modules: ["analytics"] },
  { href: "/dashboard/content", label: "Drip School and content", modules: ["content"] },
  { href: "/dashboard/exports", label: "Exports", modules: ["exports"] },
  { href: "/dashboard/settings", label: "Settings", modules: ["settings", "staff", "audit"] },
];

export const navFor = (perms: PermissionMap) =>
  dashNav.filter((n) => n.modules.length === 0 || n.modules.some((m) => can(perms, m, "view")));

/**
 * Whether a role may see what suppliers charge. This mirrors private.can_see_costs() in the database: people who can see
 * money AND either keep availability (sourcing) or manage money fully (finance). The database is what actually enforces it.
 */
export const canSeeCosts = (perms: PermissionMap): boolean =>
  can(perms, "expenses", "view") && (can(perms, "availability", "edit") || can(perms, "expenses", "delete"));

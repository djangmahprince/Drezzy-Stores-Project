// The tables staff edit through the generic editor, with the columns each may change. Shared by the server action (which
// only ever writes these columns) and the client editor (which draws the form). No imports, so both sides can load it.
// Row-level security in the database still decides who may write each table.

export type FieldType = "text" | "textarea" | "number" | "bool" | "select" | "datetime" | "date" | "list" | "json" | "color";
export type Field = { key: string; label: string; type: FieldType; options?: [string, string][]; required?: boolean; hint?: string; wide?: boolean };
export type TableDef = { table: string; key: string; title: string; fields: Field[]; order?: string; tag?: "site" | "catalogue" | "reviews"; noCreate?: boolean; noDelete?: boolean; display: string[] };

const tones: [string, string][] = [["navy", "Navy"], ["blue", "Electric blue"], ["grey", "Flyer grey"], ["red", "Campaign red"], ["charcoal", "Charcoal"]];
const categories: [string, string][] = [
  ["supplier_costs", "Supplier costs"], ["delivery_and_riders", "Delivery and riders"], ["ads_and_promotion", "Ads and promotion"], ["rent_and_utilities", "Rent"],
  ["utilities", "Utilities"], ["packaging", "Packaging"], ["data_and_airtime", "Data and airtime"], ["software_and_hosting", "Software and hosting"], ["other", "Other"],
];

export const crudTables: Record<string, TableDef> = {
  banners: {
    table: "banners", key: "id", title: "Banners", tag: "site", order: "sort", display: ["title", "placement", "starts_at", "ends_at", "active"],
    fields: [
      { key: "placement", label: "Where", type: "select", options: [["hero", "Home hero"], ["promo", "Promo strip"]], required: true },
      { key: "title", label: "Title", type: "text", required: true }, { key: "subtitle", label: "Text", type: "textarea" },
      { key: "cta_label", label: "Button label", type: "text" }, { key: "cta_href", label: "Button link", type: "text", hint: "/shop or https://..." },
      { key: "image_desktop", label: "Desktop image", type: "text", hint: "Path from the media library" }, { key: "image_mobile", label: "Phone image", type: "text" },
      { key: "tone", label: "Colour", type: "select", options: tones }, { key: "starts_at", label: "Starts", type: "datetime" }, { key: "ends_at", label: "Ends", type: "datetime" },
      { key: "sort", label: "Order", type: "number" }, { key: "active", label: "Active", type: "bool" },
    ],
  },
  announcements: {
    table: "announcements", key: "id", title: "Announcement bar", tag: "site", order: "sort", display: ["text", "starts_at", "ends_at", "active"],
    fields: [
      { key: "text", label: "Message", type: "text", required: true, wide: true }, { key: "href", label: "Link (optional)", type: "text" },
      { key: "starts_at", label: "Starts", type: "datetime" }, { key: "ends_at", label: "Ends", type: "datetime" }, { key: "sort", label: "Order", type: "number" }, { key: "active", label: "Active", type: "bool" },
    ],
  },
  home_sections: {
    table: "home_sections", key: "id", title: "Home page sections", tag: "site", order: "sort", noCreate: false, display: ["kind", "title", "sort", "active"],
    fields: [
      { key: "kind", label: "Section", type: "select", required: true, options: [["hero", "Hero banner"], ["categories", "Category tiles"], ["new", "New arrivals"], ["best", "Best sellers"], ["manual", "Products you pick"], ["picked", "Picked for you (quiz)"], ["drops", "Upcoming drops"], ["looks", "Shop the look"], ["drip", "Drip School strip"], ["reviews", "Reviews strip"], ["promo", "Promo banners"], ["promise", "Delivery promise bar"]] },
      { key: "title", label: "Heading (optional)", type: "text" }, { key: "config", label: "Settings", type: "json", hint: 'For "Products you pick": {"slugs": ["nike-dunk"]}' },
      { key: "sort", label: "Order", type: "number" }, { key: "active", label: "Show", type: "bool" },
    ],
  },
  collections: {
    table: "collections", key: "id", title: "Collections", tag: "site", order: "sort", display: ["title", "slug", "kind", "published"],
    fields: [
      { key: "title", label: "Title", type: "text", required: true }, { key: "slug", label: "Web address", type: "text", required: true, hint: "lower-case-with-dashes" },
      { key: "kind", label: "Type", type: "select", options: [["manual", "Products I pick"], ["rule", "Products matching a rule"]] },
      { key: "product_slugs", label: "Products (for a manual list)", type: "list", hint: "Product web addresses, separated by commas" },
      { key: "rule", label: "Rule", type: "json", hint: '{"brand":"Nike","category":"Sneakers","max_price":500,"on_sale":true}' },
      { key: "description", label: "Description", type: "textarea", wide: true }, { key: "seo_title", label: "SEO title", type: "text" }, { key: "seo_description", label: "SEO description", type: "text" },
      { key: "sort", label: "Order", type: "number" }, { key: "published", label: "Published", type: "bool" },
    ],
  },
  looks: {
    table: "looks", key: "id", title: "Shop the look", tag: "site", order: "sort", display: ["title", "occasion", "published"],
    fields: [
      { key: "title", label: "Title", type: "text", required: true }, { key: "slug", label: "Web address", type: "text", required: true },
      { key: "occasion", label: "Occasion", type: "text", hint: "Campus, Church, Date night..." }, { key: "intro", label: "Intro", type: "textarea", wide: true },
      { key: "items", label: "Items", type: "json", wide: true, hint: '[{"slug":"denim-set"},{"slug":"nike-dunk","style":"Mid","alternatives":["new-balance-2000"]}]' },
      { key: "tone", label: "Colour", type: "select", options: tones }, { key: "sort", label: "Order", type: "number" }, { key: "published", label: "Published", type: "bool" },
    ],
  },
  pages: {
    table: "pages", key: "slug", title: "Pages", tag: "site", order: "slug", display: ["title", "slug", "published", "updated_at"],
    fields: [
      { key: "slug", label: "Web address", type: "text", required: true, hint: "about, faq, contact, delivery, payment, order-issues, size-guide, privacy, terms" },
      { key: "title", label: "Title", type: "text", required: true }, { key: "body", label: "Text", type: "textarea", wide: true, hint: "Same format as Drip School articles" },
      { key: "seo_title", label: "SEO title", type: "text" }, { key: "seo_description", label: "SEO description / intro", type: "text" }, { key: "published", label: "Published", type: "bool" },
    ],
  },
  glossary_terms: {
    table: "glossary_terms", key: "slug", title: "Glossary", tag: "site", order: "sort", display: ["term", "definition"],
    fields: [{ key: "term", label: "Term", type: "text", required: true }, { key: "slug", label: "Web address", type: "text", required: true }, { key: "definition", label: "Meaning", type: "textarea", wide: true, required: true }, { key: "sort", label: "Order", type: "number" }],
  },
  redirects: {
    table: "redirects", key: "from_path", title: "Redirects", display: ["from_path", "to_path", "permanent"],
    fields: [{ key: "from_path", label: "Old address", type: "text", required: true, hint: "/old-page" }, { key: "to_path", label: "New address", type: "text", required: true }, { key: "permanent", label: "Permanent (301)", type: "bool" }],
  },
  coupons: {
    table: "coupons", key: "id", title: "Coupons", order: "created_at", display: ["code", "kind", "value", "min_spend", "ends_at", "active"],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, hint: "Capital letters and numbers" }, { key: "description", label: "Note", type: "text" },
      { key: "kind", label: "Type", type: "select", options: [["percent", "Percent off"], ["amount", "Amount off (GHS)"]], required: true }, { key: "value", label: "Value", type: "number", required: true },
      { key: "min_spend", label: "Minimum spend (GHS)", type: "number" }, { key: "max_discount", label: "Largest discount (GHS)", type: "number" },
      { key: "starts_at", label: "Starts", type: "datetime" }, { key: "ends_at", label: "Ends", type: "datetime" },
      { key: "max_uses", label: "Total uses", type: "number" }, { key: "max_per_customer", label: "Uses per customer", type: "number" }, { key: "active", label: "Active", type: "bool" },
    ],
  },
  riders: {
    table: "riders", key: "id", title: "Riders and couriers", order: "name", display: ["name", "kind", "company", "phone", "region", "active"],
    fields: [
      { key: "name", label: "Name", type: "text", required: true }, { key: "kind", label: "Type", type: "select", options: [["rider", "Our rider"], ["courier", "Courier company agent"], ["affiliate", "Affiliate"]] },
      { key: "company", label: "Company", type: "text", hint: "Skynet, ShaQ Express, Yango..." }, { key: "phone", label: "Phone", type: "text", hint: "+233..." },
      { key: "region", label: "Region", type: "text" }, { key: "branch", label: "Branch", type: "select", options: [["accra", "Accra"], ["kumasi", "Kumasi"], ["both", "Both"]] },
      { key: "notes", label: "Notes", type: "textarea" }, { key: "active", label: "Active", type: "bool" },
    ],
  },
  budgets: {
    table: "budgets", key: "id", title: "Budgets", order: "category", display: ["category", "month", "amount"],
    fields: [{ key: "category", label: "Category", type: "select", options: categories, required: true }, { key: "month", label: "Month (blank = every month)", type: "date" }, { key: "amount", label: "Budget (GHS)", type: "number", required: true }],
  },
  campaigns: {
    table: "campaigns", key: "id", title: "Campaign links", order: "created_at", display: ["name", "utm_source", "utm_medium", "utm_campaign", "landing_path"],
    fields: [
      { key: "name", label: "Name", type: "text", required: true }, { key: "utm_source", label: "Source", type: "text", required: true, hint: "instagram, tiktok, snapchat, facebook, whatsapp" },
      { key: "utm_medium", label: "Medium", type: "text", required: true, hint: "bio, story, post, ad, flyer" }, { key: "utm_campaign", label: "Campaign", type: "text", required: true, hint: "detty-december" },
      { key: "landing_path", label: "Page", type: "text", hint: "/ or /shop or /product/nike-dunk" },
    ],
  },
  message_templates: {
    table: "message_templates", key: "key", title: "Email templates", order: "key", noCreate: true, noDelete: true, display: ["key", "subject", "active"],
    fields: [
      { key: "subject", label: "Subject", type: "text", required: true, wide: true },
      { key: "body", label: "Message", type: "textarea", required: true, wide: true, hint: "Use {{first_name}}, {{number}}, {{total}}, {{paid_line}}, {{balance_line}}, {{rider_line}}, {{code_line}}, {{headline}}, {{link}} ..." },
      { key: "active", label: "Use this wording", type: "bool" },
    ],
  },
};

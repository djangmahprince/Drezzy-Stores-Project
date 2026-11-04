// Tests for the catalogue logic that needs no database: building products from variants, mapping database rows,
// and the spreadsheet import. Run with: npm run test:catalogue (Node loads the TypeScript source directly).
import { buildProduct, compareSizes, findVariant, variantsFor, availabilitySummary, slugify, audienceToDb, availabilityToDb, availabilityFromDb, bestOf } from "../../src/lib/catalogue/build.ts";
import { productFromRow } from "../../src/lib/catalogue/map.ts";
import { sampleProducts, sampleDefs } from "../../src/lib/catalogue/sample.ts";
import {
  parseCsv, toCsv, mapHeaders, validateTable, groupProducts, makeSku, templateCsv, parseAvailability, resolveCategory, TEMPLATE_HEADERS,
} from "../../src/lib/catalogue/import.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) pass++; else fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`); };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}`);

// ---------- sizes and availability ----------
eq("sizes sort numbers, then letters, then One size", ["XL", "S", "42", "One size", "39", "M", "40"].sort(compareSizes), ["39", "40", "42", "S", "M", "XL", "One size"]);
eq("bestOf prefers Available over Limited", bestOf("Limited", "Available"), "Available");
eq("bestOf prefers Pre-order over Unavailable", bestOf("Unavailable", "Pre-order"), "Pre-order");
eq("availability round-trips through the database values", ["Available", "Limited", "Unavailable", "Pre-order"].map((a) => availabilityFromDb(availabilityToDb(a))), ["Available", "Limited", "Unavailable", "Pre-order"]);
eq("audience text is understood", ["Men", "women", "Men and ladies", "men & ladies", "whatever"].map(audienceToDb), ["men", "ladies", "men_and_ladies", "men_and_ladies", "unisex"]);
eq("slugify strips accents and symbols", slugify('Air Jordan 4 "Red Patent" & Co.'), "air-jordan-4-red-patent-and-co");

// ---------- building a product from variants ----------
const base = { slug: "x", sku: "X", name: "X", brand: "B", category: "Sneakers", audience: "Men", popular: 1, description: "", details: [], condition: "Brand new", art: { kind: "sneaker", tone: "navy", upper: "#000", accent: "#fff" } };
const v = (style, colour, size, price, availability, extra = {}) => ({ style, colour, size, sku: `${style}-${colour}-${size}`, price, availability, leadDays: 2, ...extra });
const built = buildProduct(base, [
  v("Low", "Black", "43", 450, "Limited"), v("Low", "Black", "42", 420, "Available", { compareAt: 500 }),
  v("High", "Black", "42", 520, "Unavailable"), v(undefined, "Red", "42", 430, "Unavailable"),
]);
ok("price is the lowest variant price", built.price === 420);
ok("priceVaries is true when prices differ", built.priceVaries === true);
ok("compare-at follows the cheapest variant", built.compareAt === 500);
eq("styles are collected without blanks", built.styles, ["Low", "High"]);
eq("colours are unique", built.colours, ["Black", "Red"]);
eq("one size entry each, best availability wins, in order", built.sizes, [{ size: "42", availability: "Available" }, { size: "43", availability: "Limited" }]);
ok("variants are sorted by size", built.variants[0].size === "42");
ok("lead time is the shortest", built.leadDays === 2);
ok("findVariant matches style, colour and size", findVariant(built, { style: "Low", colour: "Black", size: "43" })?.price === 450);
ok("findVariant is strict about style", findVariant(built, { colour: "Black", size: "43" }) === undefined);
eq("variantsFor lists one style and colour", variantsFor(built, { style: "Low", colour: "Black" }).map((x) => x.size), ["42", "43"]);
eq("availability summary: some available", availabilitySummary(built).label, "Available");
eq("availability summary: all limited", availabilitySummary(buildProduct(base, [v(undefined, "A", "1", 1, "Limited")])).label, "Limited");
eq("availability summary: none open", availabilitySummary(buildProduct(base, [v(undefined, "A", "1", 1, "Unavailable")])).label, "Unavailable");
ok("a product with no variants does not crash", buildProduct(base, []).price === 0);

// ---------- the sample catalogue ----------
ok("the catalogue has the 5 real products", sampleProducts.length === 5);
ok("every real product has a photo", sampleProducts.every((p) => p.images?.length));
const dunk = sampleProducts.find((p) => p.slug === "nike-sb-dunk-low");
ok("the Dunk has one colour in 7 sizes", dunk.variants.length === 7, String(dunk.variants.length));
const allSkus = sampleProducts.flatMap((p) => p.variants.map((x) => x.sku));
ok("every sample variant SKU is unique", new Set(allSkus).size === allSkus.length);
ok("sample slugs are unique", new Set(sampleProducts.map((p) => p.slug)).size === sampleProducts.length);
ok("an unavailable size stays listed as Unavailable", dunk.sizes.find((s) => s.size === "45").availability === "Unavailable");
ok("sample definitions match the built products", sampleDefs.length === sampleProducts.length);

// ---------- mapping database rows ----------
const row = {
  id: "p1", slug: "nike-dunk", sku: "DNK", name: "Nike Dunk", brand: "Nike", audience: "men_and_ladies", description: "d", details: null, condition: "Brand new", is_new: true, popular: 5, art: null,
  category: { name: "Men", parent: { name: "Sneakers" } },
  variants: [{ id: "v1", style: null, colour: "Black", size: "42", sku: "DNK-42", price: "420.00", compare_at: "500.00", availability: "pre_order", lead_days: 3 }],
};
const mapped = productFromRow(row);
eq("row: category comes from the parent, subcategory from the child", [mapped.category, mapped.subcategory], ["Sneakers", "Men"]);
ok("row: numeric strings become numbers", mapped.price === 420 && mapped.compareAt === 500);
eq("row: audience and availability are translated", [mapped.audience, mapped.variants[0].availability], ["Men and ladies", "Pre-order"]);
ok("row: missing art falls back to category art", mapped.art.kind === "sneaker");
ok("row: null details become an empty list", Array.isArray(mapped.details) && mapped.details.length === 0);
const asArray = productFromRow({ ...row, category: [{ name: "Watches", parent: null }] });
eq("row: array-shaped relation and top-level category", [asArray.category, asArray.subcategory], ["Watches", undefined]);
eq("row: an unknown category is labelled Other", productFromRow({ ...row, category: null }).category, "Other");

// ---------- CSV ----------
eq("csv: quotes, commas and escaped quotes", parseCsv('a,"b,c","say ""hi"""\r\nx,y,z\r\n'), [["a", "b,c", 'say "hi"'], ["x", "y", "z"]]);
eq("csv: line breaks inside quotes stay in the field", parseCsv('a,"line1\nline2"\nb,c'), [["a", "line1\nline2"], ["b", "c"]]);
eq("csv: BOM and blank lines are ignored", parseCsv("﻿a,b\n\n,\nc,d\n"), [["a", "b"], ["c", "d"]]);
eq("csv: toCsv quotes what needs quoting and round-trips", parseCsv(toCsv([["a,b", 'c"d', "e"]])), [["a,b", 'c"d', "e"]]);

// ---------- headers ----------
eq("headers: common alternative names map to the right columns", mapHeaders(["Name", "Make", "Type", "Color", "EU Size", "Selling Price", "Cost Price"]).map, { product: 0, brand: 1, category: 2, colour: 3, size: 4, price: 5, cost: 6 });
eq("headers: missing required columns are listed", mapHeaders(["Product", "Brand"]).missing, ["Category", "Colour", "Size", "Price (GHS)"]);
ok("headers: units in brackets are ignored", mapHeaders(["Price (GHS)"]).map.price === 0);

// ---------- availability words ----------
eq("availability words", ["Available", "in stock", "FEW LEFT", "sold out", "Pre-order", "", "maybe"].map(parseAvailability), ["Available", "Available", "Limited", "Unavailable", "Pre-order", "Unavailable", null]);

// ---------- categories ----------
const cats = [{ id: "a", label: "Sneakers › Men" }, { id: "b", label: "Sneakers › Ladies" }, { id: "c", label: "Watches" }, { id: "d", label: "Accessories › Caps" }];
eq("category: full path in any separator", ["Sneakers > Men", "sneakers/ladies", "Sneakers › Men"].map((t) => resolveCategory(t, cats)), ["a", "b", "a"]);
eq("category: a unique second-level name and a childless top level", [resolveCategory("Caps", cats), resolveCategory("Watches", cats)], ["d", "c"]);
eq("category: an ambiguous or unknown one is refused", [resolveCategory("Sneakers", cats), resolveCategory("Boots", cats)], [null, null]);

// ---------- the template round-trips ----------
const template = validateTable(parseCsv(templateCsv()), cats.concat([{ id: "e", label: "Accessories › Caps" }]));
ok("template: its own example rows import cleanly", template.issues.length === 0 && template.rows.length === 3, JSON.stringify(template.issues));
eq("template: has the documented columns", parseCsv(templateCsv())[0], [...TEMPLATE_HEADERS]);

// ---------- validation ----------
const H = [...TEMPLATE_HEADERS];
const line = (o) => H.map((h) => o[h] ?? "");
const good = { Product: "Nike Dunk", Brand: "Nike", Category: "Sneakers > Men", Colour: "Black", Size: "42", "Price (GHS)": "420", Availability: "Available" };
const run = (...rows) => validateTable([H, ...rows.map(line)], cats);
ok("valid row passes", run(good).issues.length === 0 && run(good).rows.length === 1);
ok("prices like 'GHS 1,200' are understood", run({ ...good, "Price (GHS)": "GHS 1,200" }).rows[0]?.price === 1200);
ok("lead time defaults to 2 and size to One size", (r => r.leadDays === 2)(run({ ...good, Size: "" }).rows[0]) && run({ ...good, Size: "" }).rows[0].size === "One size");
ok("empty availability means Unavailable", run({ ...good, Availability: "" }).rows[0].availability === "Unavailable");
const bad = run({ ...good, Size: "40", Product: "" }, { ...good, Size: "41", "Price (GHS)": "abc" }, { ...good, Size: "43", Category: "Boots" }, { ...good, Size: "44", Availability: "maybe" }, { ...good, Size: "45", "Lead time (days)": "99" }, { ...good, Size: "46", "Supplier cost (GHS)": "300" }, { ...good, Size: "47", "Compare-at price (GHS)": "100" });
eq("each bad row is reported on the right line", bad.issues.map((i) => i.line), [2, 3, 4, 5, 6, 7, 8]);
ok("bad rows are not imported", bad.rows.length === 0);
ok("messages are plain words", bad.issues.every((i) => /[a-z]{4}/.test(i.message) && i.message.length < 160));
const dup = run(good, good);
ok("a repeated variant points at the first line", dup.issues.length === 1 && /line 2/.test(dup.issues[0].message), JSON.stringify(dup.issues));
ok("missing header columns stop the import with one clear message", validateTable([["Product", "Brand"], ["a", "b"]], cats).issues[0].message.includes("Category"));
ok("an empty file is reported", validateTable([], cats).issues.length === 1);
ok("a header with no rows is reported", validateTable([H], cats).issues[0].message.includes("no product rows"));
ok("files over the row limit are refused", validateTable([H, ...Array.from({ length: 5001 }, () => line(good))], cats).issues[0].message.includes("5000"));
ok("blank lines between rows are skipped", run(good, line({}), { ...good, Size: "43" }).rows.length === 2);

// ---------- grouping ----------
const groups = groupProducts(run(good, { ...good, Size: "43" }, { ...good, Product: "Cap", Brand: "Drezzy", Category: "Accessories > Caps", Size: "One size", Description: "A cap" }).rows);
eq("grouping: variants gather under one product", groups.map((g) => [g.slug, g.rows.length]), [["nike-nike-dunk", 2], ["drezzy-cap", 1]]);
ok("grouping: description comes from the first row that has one", groups[1].description === "A cap");
ok("makeSku is stable and short", makeSku("Nike Dunk", "nike-dunk") === makeSku("Nike Dunk", "nike-dunk") && makeSku("Nike Dunk", "nike-dunk").length <= 10);
ok("makeSku differs for different slugs", makeSku("Nike Dunk", "a") !== makeSku("Nike Dunk", "b"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

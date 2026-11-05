// The naming standard: Brand + Model + Cut + Colour + Size. Run with: npm run test:naming
import { nameIssues, normaliseSize, productName, variantTitle } from "../../src/lib/catalogue/naming.ts";
import { parseAvailability } from "../../src/lib/catalogue/import.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) pass++; else fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  -> ${extra}` : ""}`); };
const same = (name, got, want) => ok(name, got === want, got);

same("brand and model make the name", productName("Nike", "Dunk"), "Nike Dunk");
same("a brand typed twice is not doubled", productName("Nike", "nike dunk"), "nike dunk");
same("a model that only shares letters with the brand still gets it", productName("New", "Newton"), "New Newton");
same("extra spaces are removed", productName(" Nike ", "  Air   Force 1 "), "Nike Air Force 1");
same("a full variant title follows the standard", variantTitle("Nike Dunk", { style: "Low", colour: "Black / White", size: "42" }), "Nike Dunk Low · Black / White · Size 42");
same("no cut, no gap", variantTitle("adidas Samba", { colour: "White", size: "40" }), "adidas Samba · White · Size 40");
same("one size is left out", variantTitle("Hublot Skeleton", { colour: "Blue", size: "One size" }), "Hublot Skeleton · Blue");

for (const [raw, want] of [["xxl", "2XL"], ["XX-Large", "2XL"], ["2 XL", "2XL"], ["3xl", "3XL"], ["XXXXXL", "5XL"], ["xl", "XL"], ["large", "L"], ["m", "M"], ["EU 42", "42"], ["42", "42"], ["41.5", "41.5"], ["one size", "One size"], ["", ""]]) {
  same(`size "${raw}"`, normaliseSize(raw), want);
}

ok("a name that follows the standard has no issues", nameIssues("Nike", "Nike Dunk").length === 0);
ok("a name without its brand is flagged", nameIssues("Nike", "Dunk Low").length === 1);
ok("a size in the name is flagged", nameIssues("Nike", "Nike Dunk Size 42").length === 1);
ok("the import module still loads with the size rule", parseAvailability("yes") === "Available");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

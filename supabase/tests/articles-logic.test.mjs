// Article text handling. Run with: npm run test:articles-logic
import { parseBody, readingMinutes, slugFromTitle } from "../../src/lib/articles/format.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) pass++; else fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`); };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}`);

eq("no body gives no blocks", parseBody(null), []);
eq("two paragraphs", parseBody("One.\n\nTwo."), [{ t: "p", text: "One." }, { t: "p", text: "Two." }]);
eq("lines inside a paragraph are joined", parseBody("one\ntwo"), [{ t: "p", text: "one two" }]);
eq("a heading line", parseBody("## Campus casual\n\nWide-leg jeans."), [{ t: "h", text: "Campus casual" }, { t: "p", text: "Wide-leg jeans." }]);
eq("a bullet list", parseBody("- Tee\n- Cap\n- Jeans"), [{ t: "ul", items: ["Tee", "Cap", "Jeans"] }]);
eq("text then a list in one chunk", parseBody("Wear:\n- Tee\n- Cap"), [{ t: "p", text: "Wear:" }, { t: "ul", items: ["Tee", "Cap"] }]);
eq("Windows line endings", parseBody("A\r\n\r\nB"), [{ t: "p", text: "A" }, { t: "p", text: "B" }]);
eq("extra blank lines are ignored", parseBody("A\n\n\n\n\nB"), [{ t: "p", text: "A" }, { t: "p", text: "B" }]);
eq("an empty heading is dropped", parseBody("## \n\nText"), [{ t: "p", text: "Text" }]);
eq("HTML stays as plain text (the shop renders text, never markup)", parseBody("<script>alert(1)</script>"), [{ t: "p", text: "<script>alert(1)</script>" }]);
ok("reading time is at least a minute", readingMinutes("short", null) === 1);
ok("and grows with length", readingMinutes("x", "word ".repeat(1000)) === 5);
ok("slug from a title", slugFromTitle("5 ways to wear Nike Dunks!") === "5-ways-to-wear-nike-dunks");
ok("slug drops accents and symbols", slugFromTitle("  Café --- Style & Fit  ") === "cafe-style-fit");
ok("slug is capped at 80 with no trailing dash", slugFromTitle("word ".repeat(40)).length <= 80 && !slugFromTitle("word ".repeat(40)).endsWith("-"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

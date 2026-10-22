// CSV export formatting. Run with: npm run test:csv
import { cell, toCsv } from "../../src/lib/export/csv.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) pass++; else fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`); };

ok("plain text is left alone", cell("Ama Mensah") === "Ama Mensah");
ok("commas force quotes", cell("Osu, Accra") === '"Osu, Accra"');
ok("quotes are doubled", cell('He said "hi"') === '"He said ""hi"""');
ok("newlines are kept inside quotes", cell("a\nb") === '"a\nb"');
ok("null and undefined are empty", cell(null) === "" && cell(undefined) === "");
ok("numbers are written plainly, negatives included", cell(450) === "450" && cell(-12.5) === "-12.5");
ok("NaN and Infinity become empty", cell(NaN) === "" && cell(Infinity) === "");
ok("booleans are written", cell(true) === "true");
ok("a formula in text is defused", cell("=HYPERLINK(\"http://evil\")") === '"\'=HYPERLINK(""http://evil"")"');
ok("so are + - @ and tab", cell("+233240000000").startsWith("'+") && cell("-1 off").startsWith("'-") && cell("@SUM(A1)").startsWith("'@") && cell("\tcmd").startsWith("'"));
ok("a normal phone number string is not mangled", cell("0240000000") === "0240000000");

const csv = toCsv([{ n: "DRZ-1001", name: "Ama, M.", total: 450 }, { n: "DRZ-1002", name: "=1+1", total: 30 }], [
  { header: "Order", value: (r) => r.n }, { header: "Customer", value: (r) => r.name }, { header: "Total (GHS)", value: (r) => r.total },
]);
ok("a header line then one line per row, CRLF separated", csv === "Order,Customer,Total (GHS)\r\nDRZ-1001,\"Ama, M.\",450\r\nDRZ-1002,'=1+1,30\r\n", JSON.stringify(csv));
ok("an empty list still gives the header", toCsv([], [{ header: "A", value: () => "" }]) === "A\r\n");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

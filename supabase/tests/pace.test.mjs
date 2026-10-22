// Target pacing. Run with: npm run test:pace
import { paceOf, formatMetric } from "../../src/lib/team/pace.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) pass++; else fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`); };

ok("reaching the goal is a hit, even early", paceOf(1000, 1000, 0.2).label === "Hit");
ok("beating the goal is still a hit and shows the real percentage", paceOf(1500, 1000, 0.9).pct === 150);
ok("on a straight line is on pace", paceOf(500, 1000, 0.5).label === "On pace");
ok("80% of the expected amount counts as on pace", paceOf(400, 1000, 0.5).label === "On pace");
ok("between half and 80% of expected is close", paceOf(300, 1000, 0.5).label === "Close" && paceOf(300, 1000, 0.5).tone === "warn");
ok("under half of expected is behind", paceOf(100, 1000, 0.5).label === "Behind" && paceOf(100, 1000, 0.5).tone === "bad");
ok("a period that has not started is never behind", paceOf(0, 1000, 0).label === "On pace");
ok("a period that is over and missed is behind", paceOf(100, 1000, 1).label === "Behind");
ok("elapsed is clamped", paceOf(0, 1000, 5).label === "Behind" && paceOf(0, 1000, -1).label === "On pace");
ok("a zero goal does not divide by zero", paceOf(0, 0, 0.5).pct === 0);
ok("money metrics show cedis, counts do not", formatMetric("paid_sales", 1250) === "GHS 1,250" && formatMetric("orders", 12) === "12");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// The export log. Run with: npm run test:exports
import { createHarness } from "./harness.mjs";

const { db, ok, as, asRole, tryQ, addStaff, done } = await createHarness({ seed: true });
for (const [n, r] of [["owner", "owner"], ["admin", "admin"], ["finance", "finance"], ["sales", "sales_agent"], ["dispatch", "dispatch_coordinator"], ["sourcing", "sourcing_officer"]]) await addStaff(n, r);

const log = (who, kind, rows) => as(who, () => tryQ("select public.log_export($1,$2)", [kind, rows]));
ok("finance can export and it is logged", (await log("finance", "money", 12)).ok);
ok("admin can export", (await log("admin", "orders", 40)).ok);
ok("sourcing can export (catalogue only is enforced by the app)", (await log("sourcing", "catalogue", 5)).ok);
ok("sales has own-records export", (await log("sales", "orders", 3)).ok);
ok("dispatch cannot export", !(await log("dispatch", "orders", 3)).ok);
await asRole("anon", async () => ok("shoppers cannot", !(await tryQ("select public.log_export('orders', 1)")).ok));
ok("an unknown kind is refused", !(await log("owner", "passwords", 1)).ok);
ok("the log records who, what and how many", (await db.query("select actor_name, kind, row_count from public.export_log where kind = 'money'")).rows.some((r) => r.row_count === 12 && r.actor_name));
ok("the log cannot be edited", !(await as("owner", () => tryQ("update public.export_log set row_count = 0"))).ok);
ok("or deleted", !(await as("owner", () => tryQ("delete from public.export_log"))).ok);
ok("or written to directly", !(await as("owner", () => tryQ("insert into public.export_log (kind, row_count) values ('orders', 1)"))).ok);
ok("the owner and admin can read the log, finance has audit view too", (await as("owner", () => tryQ("select * from public.export_log"))).rows.length >= 3 && (await as("finance", () => tryQ("select * from public.export_log"))).rows.length >= 3);
ok("sales cannot read it", (await as("sales", () => tryQ("select * from public.export_log"))).rows.length === 0);

await done();

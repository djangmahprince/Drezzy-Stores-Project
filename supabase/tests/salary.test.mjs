// Salary records. Run with: npm run test:salary
import { createHarness } from "./harness.mjs";

const { db, ids, ok, as, asRole, tryQ, addStaff, done } = await createHarness({ seed: true });
for (const [n, r] of [["owner", "owner"], ["finance", "finance"], ["admin", "admin"], ["sales", "sales_agent"]]) await addStaff(n, r);

const add = (who, staff, amount, month = "2026-10-01") => as(who, () => tryQ("insert into public.salary_records (staff_id, month, amount, created_by) values ($1,$2,$3,auth.uid()) returning id", [staff, month, amount]));
const r1 = await add("finance", ids.sales, 1200);
ok("finance can record a salary", r1.ok, r1.err);
ok("so can the owner", (await add("owner", ids.admin, 2000)).ok);
ok("an admin cannot (no salary access)", !(await add("admin", ids.sales, 500, "2026-09-01")).ok);
ok("sales cannot", !(await add("sales", ids.sales, 500, "2026-09-01")).ok);
ok("one record per person per month", !(await add("finance", ids.sales, 900)).ok);
ok("the month must be the first of a month", !(await add("finance", ids.sales, 900, "2026-09-15")).ok);
ok("the amount must be positive", !(await add("finance", ids.sales, 0, "2026-09-01")).ok);
ok("a record cannot claim another author", !(await as("finance", () => tryQ("insert into public.salary_records (staff_id, month, amount, created_by) values ($1,'2026-08-01',10,$2)", [ids.sales, ids.owner]))).ok);

ok("finance reads salary records", (await as("finance", () => tryQ("select * from public.salary_records"))).rows.length === 2);
ok("an admin sees none", (await as("admin", () => tryQ("select * from public.salary_records"))).rows.length === 0);
ok("sales sees none, not even their own", (await as("sales", () => tryQ("select * from public.salary_records"))).rows.length === 0);
await asRole("anon", async () => ok("shoppers cannot read them", !(await tryQ("select * from public.salary_records")).ok));

// paying
const id1 = r1.rows[0].id;
const pay = (who, id, method = "momo") => as(who, () => tryQ("update public.salary_records set status = 'paid', paid_on = current_date, method = $2 where id = $1", [id, method]));
ok("marking paid needs a payment date (a paid row without one is refused)", !(await as("finance", () => tryQ("update public.salary_records set status = 'paid' where id = $1", [id1]))).ok);
ok("finance marks a salary paid", ((await pay("finance", id1)).n ?? 0) === 1);
ok("a paid salary cannot go back to due", !(await as("finance", () => tryQ("update public.salary_records set status = 'due', paid_on = null where id = $1", [id1]))).ok);
ok("or have its amount changed", !(await as("owner", () => tryQ("update public.salary_records set amount = 1 where id = $1", [id1]))).ok);
ok("a paid salary cannot be deleted", ((await as("owner", () => tryQ("delete from public.salary_records where id = $1", [id1]))).n ?? 0) === 0);
const dueId = (await db.query("select id from public.salary_records where status = 'due'")).rows[0].id;
ok("a due salary can still be corrected", ((await as("finance", () => tryQ("update public.salary_records set amount = 2100 where id = $1", [dueId]))).n ?? 0) === 1);
ok("and deleted by someone who may delete", ((await as("owner", () => tryQ("delete from public.salary_records where id = $1", [dueId]))).n ?? 0) === 1);
ok("salary changes are audited", (await db.query("select count(*)::int n from public.audit_log where table_name = 'salary_records'")).rows[0].n >= 4);

// money
const l = (await as("finance", () => tryQ("select direction, category, amount from public.money_ledger where category = 'Salaries'"))).rows;
ok("a paid salary appears once as money out", l.length === 1 && l[0].direction === "out" && Number(l[0].amount) === 1200, JSON.stringify(l));
ok("a due salary does not", (await as("finance", () => tryQ("select * from public.money_ledger where category = 'Salaries'"))).rows.length === 1);
ok("an admin's ledger never shows pay", (await as("admin", () => tryQ("select * from public.money_ledger where category = 'Salaries'"))).rows.length === 0);
const sum = (who) => as(who, () => tryQ("select public.money_summary('2020-01-01','2099-01-01') as r")).then((r) => r.rows[0].r);
const s = await sum("finance");
ok("finance's summary counts it and lists a Salaries category", Number(s.money_out) === 1200 && s.out_by_category.some((c) => c.category === "Salaries" && Number(c.amount) === 1200), JSON.stringify(s));
ok("an admin's summary leaves salaries out", Number((await sum("admin")).money_out) === 0);

await done();

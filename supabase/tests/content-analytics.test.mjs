// Content management, analytics reports, exports and the scheduled checks. Run with: npm run test:content-analytics
import { createHarness } from "./harness.mjs";

const { db, ok, as, asRole, tryQ, addStaff, done, ids } = await createHarness({ seed: true });
for (const [n, r] of [["owner", "owner"], ["admin", "admin"], ["sales", "sales_agent"], ["sourcing", "sourcing_officer"], ["dispatch", "dispatch_coordinator"],
  ["finance", "finance"], ["support", "customer_support"], ["content", "content_editor"]]) await addStaff(n, r);

const vid = (await db.query("select id from public.variants where sku = 'DNK-LO-BW-41'")).rows[0].id;
const place = async (phone, extra = {}) => {
  const r = await asRole("anon", () => tryQ("select public.place_order($1::jsonb) as r", [JSON.stringify({
    channel: "web", customer: { name: "Esi Owusu", phone, email: `${phone}@example.com` },
    delivery: { method: "home", region: "Greater Accra", city: "Accra", area: "Osu", street: "Oxford St" },
    plan: "full", source: "TikTok", pay_method: "mtn", items: [{ variant_id: vid, qty: 1 }], ...extra })]));
  if (!r.ok) throw new Error(r.err);
  await asRole("service_role", () => tryQ("select public.confirm_payment($1,$2,'{}'::jsonb)", [r.rows[0].r.payment_reference, r.rows[0].r.due_now]));
  return r.rows[0].r;
};

// ---------------------------------------------------------------- content
ok("the home page sections are seeded and public", (await asRole("anon", () => tryQ("select kind from public.home_sections order by sort"))).rows.length === 10);
ok("shoppers cannot reorder the home page", !(await asRole("anon", () => tryQ("update public.home_sections set sort = 0"))).ok);
ok("the content editor reorders it", (await as("content", () => tryQ("update public.home_sections set sort = 99 where kind = 'reviews'"))).n === 1);
ok("sales cannot edit the home page", (await as("sales", () => tryQ("update public.home_sections set sort = 1"))).n === 0);
ok("a banner with a schedule", (await as("content", () => tryQ("insert into public.banners (title, cta_href, starts_at, ends_at) values ('Detty December','/shop', now() + interval '1 day', now() + interval '10 days'), ('Now on','/shop', now() - interval '1 day', null)"))).ok);
ok("shoppers only see banners inside their window", (await asRole("anon", () => tryQ("select title from public.banners"))).rows.map((r) => r.title).join() === "Now on");
ok("a banner link must be on the site or https", !(await as("content", () => tryQ("insert into public.banners (title, cta_href) values ('Bad','javascript:alert(1)')"))).ok);
ok("an announcement bar message", (await as("content", () => tryQ("insert into public.announcements (text) values ('Free delivery in Accra over GHS 500')"))).ok
  && (await asRole("anon", () => tryQ("select text from public.announcements"))).rows.length === 1);
ok("a rule-based collection", (await as("content", () => tryQ("insert into public.collections (slug, title, kind, rule, published) values ('nike-under-500','Nike under GHS 500','rule','{\"brand\":\"Nike\",\"max_price\":500}', true)"))).ok);
ok("static pages are edited and versioned", (await as("content", () => tryQ("insert into public.pages (slug, title, body) values ('about','About','We source every order.')"))).ok
  && (await as("content", () => tryQ("update public.pages set body = 'We source every order from trusted suppliers.' where slug = 'about'"))).ok
  && (await db.query("select count(*)::int n from public.content_versions where kind = 'page'")).rows[0].n === 1);
const vPage = (await db.query("select id from public.content_versions where kind = 'page'")).rows[0].id;
ok("one-click restore brings back the old text", (await as("content", () => tryQ("select public.restore_version($1)", [vPage]))).ok
  && (await db.query("select body from public.pages where slug = 'about'")).rows[0].body === "We source every order.");
ok("sales cannot restore versions", !(await as("sales", () => tryQ("select public.restore_version($1)", [vPage]))).ok);
ok("unpublished pages are hidden from shoppers", (await as("content", () => tryQ("insert into public.pages (slug, title, body, published) values ('secret','Secret','x', false)"))).ok
  && (await asRole("anon", () => tryQ("select slug from public.pages"))).rows.length === 1);

const art = (await as("content", () => tryQ("insert into public.articles (slug, title, type, intro, body, author_id, author_name) values ('church-looks','Church Sunday looks under GHS 800','Occasion lookbook','Look sharp for church without spending much.','## One\\nText', $1, 'Content') returning id, preview_token", [ids.content]))).rows[0];
ok("new article types are allowed", !!art);
ok("a draft is hidden from shoppers", (await asRole("anon", () => tryQ("select slug from public.articles where slug = 'church-looks'"))).rows.length === 0);
ok("but readable with its preview link", (await asRole("anon", () => tryQ("select public.article_preview($1) as r", [art.preview_token]))).rows[0].r.title.startsWith("Church"));
ok("the preview does not reveal the author's account", !("author_id" in (await asRole("anon", () => tryQ("select public.article_preview($1) as r", [art.preview_token]))).rows[0].r));
await as("content", () => tryQ("update public.articles set body = 'New body', status = 'published', publish_at = now() where id = $1", [art.id]));
ok("editing an article keeps the previous version", (await db.query("select count(*)::int n from public.content_versions where kind = 'article'")).rows[0].n === 1);
ok("article views are counted once per visitor per day", (await asRole("anon", () => tryQ("select public.track_article('church-looks','sess-aaaaaaaa','view')"))).ok
  && (await asRole("anon", () => tryQ("select public.track_article('church-looks','sess-aaaaaaaa','view')"))).ok
  && (await asRole("anon", () => tryQ("select public.track_article('church-looks','sess-aaaaaaaa','read',null,80,95)"))).ok);
await place("0240000401", { attribution: { article: "church-looks", session: "sess-aaaaaaaa" } });
const am = (await as("content", () => tryQ("select public.article_metrics(current_date, current_date) as r"))).rows[0].r.find((a) => a.slug === "church-looks");
ok("article metrics: views, read time and sales credited", am.views === 1 && Number(am.avg_seconds) === 95 && am.orders === 1, JSON.stringify(am));
ok("the content editor does not see sales money", am.sales === null);
ok("the glossary is public", (await asRole("anon", () => tryQ("select term from public.glossary_terms"))).rows.length >= 5);
ok("redirects are readable by the shop and edited by staff", (await as("content", () => tryQ("insert into public.redirects (from_path, to_path) values ('/old-dunks','/product/nike-dunk')"))).ok
  && (await asRole("anon", () => tryQ("select to_path from public.redirects"))).rows.length === 1);
ok("email templates are seeded and only Admins edit them", (await as("admin", () => tryQ("update public.message_templates set subject = 'Order {{number}} received' where key = 'order_placed'"))).n === 1
  && (await as("content", () => tryQ("update public.message_templates set subject = 'x' where key = 'order_placed'"))).n === 0);
ok("on-site feedback from anyone", (await asRole("anon", () => tryQ("select public.send_site_feedback('/shop','Filters are great',5,null)"))).ok);
ok("shoppers cannot read feedback", !(await asRole("anon", () => tryQ("select * from public.site_feedback"))).ok);

// ---------------------------------------------------------------- analytics events and reports
const evs = [
  { session: "sess-bbbbbbbb", name: "page_view", path: "/", device: "mobile", utm_source: "instagram" },
  { session: "sess-bbbbbbbb", name: "view_item", params: { product: "nike-dunk" }, device: "mobile", utm_source: "instagram" },
  { session: "sess-bbbbbbbb", name: "add_to_cart", params: { product: "nike-dunk" }, device: "mobile" },
  { session: "sess-bbbbbbbb", name: "search", params: { term: "Yeezy", results: 0 } },
  { session: "sess-bbbbbbbb", name: "hack_the_planet" },
];
ok("events are recorded, unknown names ignored", (await asRole("anon", () => tryQ("select public.track_events($1::jsonb)", [JSON.stringify(evs)]))).ok
  && (await db.query("select count(*)::int n from public.events")).rows[0].n === 4);
ok("funnel steps are mirrored once per visitor", (await db.query("select count(*)::int n from public.site_events where session = 'sess-bbbbbbbb'")).rows[0].n === 3);
ok("shoppers cannot read events", !(await asRole("anon", () => tryQ("select * from public.events"))).ok);
await place("0240000402", { plan: "half" });
const k = (await as("owner", () => tryQ("select public.kpi_report(current_date - 6, current_date) as r"))).rows[0].r;
ok("KPIs: orders, net sales, half-payment share and previous period", k.current.orders === 2 && Number(k.current.net_sales) > 0 && Number(k.current.half_payment_share) === 50 && k.previous.orders === 0, JSON.stringify(k.current));
ok("KPIs come with a daily series for the trend line", k.series.length === 7);
const kd = (await as("dispatch", () => tryQ("select public.kpi_report(current_date - 6, current_date) as r"))).rows[0].r;
ok("delivery-limited roles do not see money KPIs", kd.money_visible === false && kd.current.net_sales === undefined && kd.current.orders === 2);
const kf = (await as("finance", () => tryQ("select public.kpi_report(current_date - 6, current_date) as r"))).rows[0].r;
ok("finance sees money KPIs", kf.money_visible === true && kf.current.net_sales !== undefined);
const fun = (await as("owner", () => tryQ("select public.funnel_report(current_date, current_date, 'device') as r"))).rows[0].r;
ok("the funnel splits by device", fun.some((s) => s.segment === "mobile" && s.steps[0].count === 1 && s.steps[2].count === 1), JSON.stringify(fun));
ok("own-scope analytics (sales) cannot see the funnel", !(await as("sales", () => tryQ("select public.funnel_report(current_date, current_date, null)"))).ok);
const src = (await as("owner", () => tryQ("select public.source_report(current_date, current_date) as r"))).rows[0].r;
ok("source report: self-reported vs tracked", src.self_reported.some((s) => s.source === "TikTok" && s.orders === 2) && src.tracked.some((s) => s.source === "direct"));
const pr = (await as("owner", () => tryQ("select public.product_report(current_date, current_date) as r"))).rows[0].r;
ok("product report: views, adds and units, and searches with no results", pr.products.some((p) => p.slug === "nike-dunk" && p.views === 1 && p.adds === 1 && p.units === 2)
  && pr.no_result_searches[0].term === "yeezy", JSON.stringify(pr.no_result_searches));
ok("the delivery report runs", (await as("dispatch", () => tryQ("select public.delivery_report(current_date - 30, current_date) as r"))).ok);
const cr = (await as("owner", () => tryQ("select public.customer_report(current_date - 30, current_date) as r"))).rows[0].r;
ok("the customer report has top customers and cohorts", cr.top_customers.length === 2 && cr.cohorts.length === 1);
ok("the catalogue report shows availability counts", (await as("sourcing", () => tryQ("select public.catalogue_report(7) as r"))).rows[0].r.by_availability.available > 0);
ok("sales cannot run the catalogue report margins", (await as("sales", () => tryQ("select public.catalogue_report(7) as r"))).rows[0].r.margins === null);
ok("campaigns for the UTM builder", (await as("admin", () => tryQ("insert into public.campaigns (name, utm_source, utm_medium, utm_campaign) values ('Instagram bio','instagram','bio','always-on')"))).ok
  && !(await as("sales", () => tryQ("insert into public.campaigns (name, utm_source, utm_medium, utm_campaign) values ('X','x1','y1','z1')"))).ok);

// ---------------------------------------------------------------- exports
ok("sales can export their own orders", (await as("sales", () => tryQ("select public.start_export('orders','csv','{}'::jsonb)"))).ok);
ok("sourcing can export the catalogue only", (await as("sourcing", () => tryQ("select public.start_export('catalogue','xlsx','{}'::jsonb)"))).ok
  && !(await as("sourcing", () => tryQ("select public.start_export('customers','csv','{}'::jsonb)"))).ok);
ok("dispatch cannot export", !(await as("dispatch", () => tryQ("select public.start_export('orders','csv','{}'::jsonb)"))).ok);
ok("JSON is for Admins", !(await as("finance", () => tryQ("select public.start_export('money','json','{}'::jsonb)"))).ok && (await as("admin", () => tryQ("select public.start_export('orders','json','{}'::jsonb)"))).ok);
const job = (await as("finance", () => tryQ("select public.start_export('money','pdf','{\"month\":\"2026-11\"}'::jsonb) as id"))).rows[0].id;
ok("a file outside the person's folder is refused", !(await as("finance", () => tryQ("select public.finish_export($1, 10, $2)", [job, `${ids.admin}/${job}.pdf`]))).ok);
ok("finishing an export logs it with row count, format and filters", (await as("finance", () => tryQ("select public.finish_export($1, 10, $2)", [job, `${ids.finance}/${job}.pdf`]))).ok
  && (await db.query("select row_count, format, filters from public.export_log where kind = 'money'")).rows[0].row_count === 10);
ok("the job expires in 24 hours and the person is told", (await db.query("select expires_at > now() + interval '23 hours' ok from public.export_jobs where id = $1", [job])).rows[0].ok
  && (await as("finance", () => tryQ("select kind from public.staff_alerts where kind = 'export'"))).rows.length === 1);
ok("someone else cannot finish my export", !(await as("admin", () => tryQ("select public.finish_export($1, 1, null, 'x')", [job]))).ok);

// ---------------------------------------------------------------- scheduled checks
await db.query("update public.payments set confirmed_at = now() - interval '5 hours' where status = 'success'");
await db.query("update public.app_settings set value = jsonb_set(value, '{report_cutoff_hour}', '0') where key = 'alerts'");
ok("checkout reminders need consent", (await asRole("anon", () => tryQ("select public.save_checkout_draft('ama@example.com','sess-cccccccc','[]'::jsonb,false)"))).ok
  && (await db.query("select count(*)::int n from public.checkout_drafts")).rows[0].n === 0);
await asRole("anon", () => tryQ("select public.save_checkout_draft('ama@example.com','sess-cccccccc','[]'::jsonb,true)"));
await db.query("update public.checkout_drafts set created_at = now() - interval '3 hours'");
ok("only the service role runs the checks", !(await as("owner", () => tryQ("select public.run_scheduled_checks()"))).ok);
const run = await asRole("service_role", () => tryQ("select public.run_scheduled_checks() as r"));
ok("the scheduled checks run", run.ok, run.err);
ok("orders not confirmed in time alert the owner", (await as("owner", () => tryQ("select title from public.staff_alerts where kind = 'stuck'"))).rows.length === 2);
ok("running again does not repeat alerts", (await asRole("service_role", () => tryQ("select public.run_scheduled_checks()"))).ok
  && (await as("owner", () => tryQ("select title from public.staff_alerts where kind = 'stuck'"))).rows.length === 2);
const isSunday = new Date().getUTCDay() === 0;
ok("missing daily reports are flagged to each person (not on Sundays)", isSunday || (await as("sales", () => tryQ("select * from public.staff_alerts where kind = 'report_missing'"))).rows.length === 1);
ok("the abandoned-checkout reminder is queued once", (await db.query("select count(*)::int n from public.notifications where template = 'abandoned_cart' and marketing")).rows[0].n === 1);
ok("stale availability tells sourcing", (await as("sourcing", () => tryQ("select * from public.staff_alerts where kind = 'stale_availability'"))).rows.length === 1);

await done();

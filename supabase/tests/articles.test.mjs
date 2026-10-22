// Drip School articles. Run with: npm run test:articles
import { createHarness } from "./harness.mjs";

const { db, ids, ok, as, asRole, tryQ, addStaff, done } = await createHarness({ seed: true });
for (const [n, r] of [["owner", "owner"], ["editor", "content_editor"], ["admin", "admin"], ["sales", "sales_agent"], ["support", "customer_support"]]) await addStaff(n, r);

const ins = (who, slug, extra = {}) => as(who, () => tryQ(
  "insert into public.articles (slug, title, type, intro, status, publish_at, author_id) values ($1,$2,$3,$4,$5,$6,auth.uid()) returning id",
  [slug, extra.title ?? "A good title", extra.type ?? "How-to", "This is a long enough introduction.", extra.status ?? "draft", extra.publish_at ?? null]));

ok("the seed's four starter articles are public", (await asRole("anon", () => tryQ("select slug from public.articles"))).rows.length === 4);
const d = await ins("editor", "my-draft");
ok("a content editor can write a draft", d.ok, d.err);
ok("the owner and admin can too", (await ins("owner", "owner-draft")).ok && (await ins("admin", "admin-draft")).ok);
ok("sales cannot write articles", !(await ins("sales", "nope-sales")).ok);
ok("support cannot either", !(await ins("support", "nope-support")).ok);
ok("a slug is lower-case words and dashes", !(await ins("editor", "Bad Slug!")).ok);
ok("a slug is unique", !(await ins("editor", "my-draft")).ok);
ok("a title needs some length", !(await ins("editor", "short-title", { title: "ab" })).ok);
ok("the type is one the shop knows", !(await ins("editor", "odd-type", { type: "Gossip" })).ok);
ok("a published article needs a publish time", !(await ins("editor", "no-time", { status: "published" })).ok);
ok("an article cannot name someone else as its author", !(await as("editor", () => tryQ("insert into public.articles (slug,title,type,intro,author_id) values ('spoof','A good title','How-to','This is a long enough introduction.',$1)", [ids.owner]))).ok);

const pub = await ins("editor", "live-now", { status: "published", publish_at: "2020-01-01T00:00:00Z" });
await ins("editor", "live-later", { status: "published", publish_at: "2099-01-01T00:00:00Z" });
const review = await ins("editor", "in-review", { status: "in_review" });
const publicSlugs = async () => (await asRole("anon", () => tryQ("select slug from public.articles"))).rows.map((r) => r.slug);
let s = await publicSlugs();
ok("shoppers see a published article", pub.ok && s.includes("live-now"));
ok("not drafts, reviews, or ones scheduled for later", !s.includes("my-draft") && !s.includes("in-review") && !s.includes("live-later"), s.join(","));
ok("staff with content access see the drafts", (await as("editor", () => tryQ("select slug from public.articles"))).rows.length >= 8);
ok("sales sees only what the public sees", (await as("sales", () => tryQ("select slug from public.articles"))).rows.every((r) => s.includes(r.slug)));
ok("the author's account id is hidden from shoppers", !(await asRole("anon", () => tryQ("select author_id from public.articles"))).ok);

ok("an editor publishes a draft", ((await as("editor", () => tryQ("update public.articles set status='published', publish_at = now() - interval '1 minute' where id = $1", [review.rows[0].id]))).n ?? 0) === 1);
ok("it is then public", (await publicSlugs()).includes("in-review"));
ok("an editor can unpublish it", ((await as("editor", () => tryQ("update public.articles set status='draft', publish_at = null where id = $1", [review.rows[0].id]))).n ?? 0) === 1 && !(await publicSlugs()).includes("in-review"));
ok("sales cannot edit", ((await as("sales", () => tryQ("update public.articles set title = 'Defaced by sales' where slug = 'live-now'"))).n ?? 0) === 0);
ok("shoppers cannot edit or write", !(await asRole("anon", () => tryQ("update public.articles set title = 'x'"))).ok && !(await asRole("anon", () => tryQ("insert into public.articles (slug,title,type,intro) values ('a-b','A good title','How-to','This is a long enough introduction.')"))).ok);
ok("updating stamps the edit time", (await db.query("select updated_at > created_at as t from public.articles where slug = 'in-review'")).rows[0].t === true);
ok("an editor can delete a draft", ((await as("editor", () => tryQ("delete from public.articles where slug = 'my-draft'"))).n ?? 0) === 1);
ok("sales cannot delete", ((await as("sales", () => tryQ("delete from public.articles where slug = 'live-now'"))).n ?? 0) === 0);
ok("article changes are audited", (await db.query("select count(*)::int n from public.audit_log where table_name = 'articles'")).rows[0].n >= 6);

await done();

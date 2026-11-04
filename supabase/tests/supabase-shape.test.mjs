// The migrations on a database shaped like a real Supabase project: the storage schema exists, and tables and functions
// created in public are granted to anon, authenticated and service_role by default (Supabase's default privileges).
// The other suites do not have these, so this is where a grant someone forgot to revoke shows up.
// Run with: npm run test:supabase-shape
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const dir = (p) => fileURLToPath(new URL(p, import.meta.url));
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema storage; create schema extensions;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz default now(), raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema auth, public, storage to anon, authenticated, service_role;
  grant execute on all functions in schema auth, storage to anon, authenticated, service_role;
  grant select on auth.users to authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`);

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) pass++; else fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + String(extra).slice(0, 1800) : ""}`); };

let broke = null;
for (const f of fs.readdirSync(dir("../migrations")).sort()) {
  try { await db.exec(fs.readFileSync(dir(`../migrations/${f}`), "utf8")); } catch (e) { broke = `${f}: ${e.message}`; break; }
}
ok("every migration applies on a Supabase-shaped database", !broke, broke);
if (broke) process.exit(1);
try { await db.exec(fs.readFileSync(dir("../seed.sql"), "utf8")); ok("the seed loads", true); } catch (e) { ok("the seed loads", false, e.message); }

const rows = async (q) => (await db.query(q)).rows;

const buckets = (await rows("select id, public from storage.buckets order by id")).map((b) => `${b.id}:${b.public}`).join(" ");
ok("all five storage buckets exist, private where they should be", buckets === "exports:false media:true proofs:false receipts:false reviews:true", buckets);
const pol = (await rows("select count(*)::int n from pg_policies where schemaname = 'storage'"))[0].n;
ok("the storage rules are in place", pol >= 10, pol);

const noRls = await rows("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity");
ok("every table has row-level security", noRls.length === 0, noRls.map((r) => r.relname).join(", "));

const anonWrites = await rows(`select c.relname, p.priv from pg_class c join pg_namespace n on n.oid = c.relnamespace, unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) p(priv)
  where n.nspname = 'public' and c.relkind in ('r','v','p') and has_table_privilege('anon', c.oid, p.priv)`);
const allowedAnonWrites = new Set([]);
const badWrites = anonWrites.filter((r) => !allowedAnonWrites.has(r.relname));
ok("visitors have no write grants on any table", badWrites.length === 0, [...new Set(badWrites.map((r) => r.relname))].join(", "));

const anonReads = (await rows(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','v','p')
  and (has_table_privilege('anon', c.oid, 'SELECT') or exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and has_column_privilege('anon', c.oid, a.attnum, 'SELECT'))) order by 1`)).map((r) => r.relname);
console.log("INFO  tables and views visitors can read:", anonReads.join(", "));

const views = await rows(`select c.relname, coalesce(c.reloptions::text, '') opts, has_table_privilege('anon', c.oid, 'SELECT') anon, has_table_privilege('authenticated', c.oid, 'SELECT') auth
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'v'`);
const openViews = views.filter((v) => !/security_invoker=(true|on)/i.test(v.opts) && (v.anon || v.auth));
ok("no view skips row-level security", openViews.length === 0, openViews.map((v) => `${v.relname}${v.anon ? " (anon!)" : ""}`).join(", "));

const anonFns = (await rows(`select p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1`));
console.log("INFO  functions visitors can call:", anonFns.map((f) => f.proname).join(", "));

const privFns = (await rows(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'EXECUTE')`));
ok("visitors cannot call private functions", privFns.length === 0, privFns.map((f) => f.proname).join(", "));

const srv = (await rows(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not has_table_privilege('service_role', c.oid, 'SELECT')`));
console.log("INFO  tables the service role cannot read:", srv.map((r) => r.relname).join(", ") || "none");

const definerNoPath = await rows(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
ok("every security-definer function pins its search path", definerNoPath.length === 0, definerNoPath.map((f) => f.proname).join(", "));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

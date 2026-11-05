// Says what is connected and what is still missing, without printing any secret. Run with: npm run setup:check
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

try { process.loadEnvFile(".env.local"); } catch { /* fall back to the real environment */ }
const e = process.env;
let bad = 0;
const line = (good, text) => { if (!good) bad++; console.log(`${good ? "OK     " : "MISSING"}  ${text}`); };

line(!!e.NEXT_PUBLIC_SUPABASE_URL, "Project URL in .env.local");
line(!!(e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || e.NEXT_PUBLIC_SUPABASE_ANON_KEY), "Publishable key in .env.local");
line(!!e.SUPABASE_SERVICE_ROLE_KEY, "Secret key in .env.local");
line(!!e.SUPABASE_DB_URL, "Database connection string in .env.local");

if (e.SUPABASE_DB_URL) {
  const c = new pg.Client({ connectionString: e.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  try {
    await c.connect();
    line(true, "Database reachable");
    const n = async (q) => { try { return (await c.query(q)).rows[0].n; } catch { return null; } };
    const tables = await n("select count(*)::int n from information_schema.tables where table_schema = 'public'");
    line(tables > 40, `Tables created (${tables ?? 0})`);
    line((await n("select count(*)::int n from public.products")) > 0, "Products loaded");
    line((await n("select count(*)::int n from storage.buckets where id in ('media','receipts','exports','reviews','proofs')")) === 5, "Storage buckets");
    line((await n("select count(*)::int n from public.staff s join public.roles r on r.id = s.role_id where r.key = 'owner' and s.active")) > 0, "Owner account");
    await c.end();
  } catch (err) {
    line(false, `Database connection failed: ${err.code ?? err.message}. Check the password in the connection string.`);
  }
}

if (e.NEXT_PUBLIC_SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY) {
  const { error } = await createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).auth.admin.listUsers({ perPage: 1 });
  line(!error, error ? `Secret key refused: ${error.message}` : "Secret key works");
}

console.log(bad ? `\n${bad} still to do.` : "\nEverything is connected.");
process.exit(bad ? 1 : 0);

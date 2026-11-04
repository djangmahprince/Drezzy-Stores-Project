// Applies supabase/migrations to the remote database, in order, each file in its own transaction, and records what ran in
// the same table the Supabase CLI uses, so it is safe to run again: only new files are applied.
//
//   node scripts/db-apply.mjs            show what would run, change nothing
//   node scripts/db-apply.mjs --apply    run the new migrations
//   node scripts/db-apply.mjs --apply --seed   also load supabase/seed.sql (the starter catalogue), once
//
// Reads SUPABASE_DB_URL from .env.local: Supabase dashboard, Connect, "Session pooler" connection string.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

try { process.loadEnvFile(".env.local"); } catch { /* fall back to the real environment */ }

const apply = process.argv.includes("--apply");
const seed = process.argv.includes("--seed");
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Add SUPABASE_DB_URL to .env.local first (Supabase dashboard, Connect, Session pooler).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

await client.query(`create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`);

const dir = "supabase/migrations";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const done = new Set((await client.query("select version from supabase_migrations.schema_migrations")).rows.map((r) => r.version));
const pending = files.filter((f) => !done.has(f.split("_")[0]));

console.log(`${files.length} migrations, ${done.size} already applied, ${pending.length} to run.`);
pending.forEach((f) => console.log(`  ${f}`));

if (!apply) {
  console.log("Nothing changed. Add --apply to run them.");
  await client.end();
  process.exit(0);
}

for (const f of pending) {
  const [version, ...rest] = f.replace(/\.sql$/, "").split("_");
  try {
    await client.query("begin");
    await client.query(fs.readFileSync(path.join(dir, f), "utf8"));
    await client.query("insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)", [version, rest.join("_")]);
    await client.query("commit");
    console.log(`applied ${f}`);
  } catch (e) {
    await client.query("rollback");
    console.error(`FAILED ${f}: ${e.message}. Nothing from this file was kept; earlier files stay applied.`);
    await client.end();
    process.exit(1);
  }
}

if (seed) {
  const { rows } = await client.query("select count(*)::int n from public.products");
  if (rows[0].n > 0) console.log("Products already exist, so the seed was skipped.");
  else {
    await client.query("begin");
    await client.query(fs.readFileSync("supabase/seed.sql", "utf8"));
    await client.query("commit");
    console.log("Seed loaded.");
  }
}

// PostgREST caches the schema: tell it to reload so the new tables and functions are visible straight away.
await client.query("notify pgrst, 'reload schema'");
await client.end();
console.log("Done.");

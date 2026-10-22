// One-off bootstrap: creates the first Owner. Nobody can be added through the dashboard until an Owner exists.
//
//   node scripts/create-owner.mjs owner@example.com "Full Name"
//
// Reads .env.local. Uses the service-role key, so run it on your own machine and never share its output.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* fall back to the real environment */
}

const [email, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(" ").trim();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !fullName) {
  console.error('Usage: node scripts/create-owner.mjs owner@example.com "Full Name"');
  process.exit(1);
}
if (!url || !secret) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: role, error: roleErr } = await admin.from("roles").select("id").eq("key", "owner").single();
if (roleErr || !role) {
  console.error("Could not find the Owner role. Have you run the three migrations in supabase/migrations?");
  process.exit(1);
}

const { count } = await admin.from("staff").select("id", { count: "exact", head: true }).eq("role_id", role.id).eq("active", true);
if (count && count > 0) {
  console.error("An active Owner already exists. Add more staff from the dashboard (Settings → Staff).");
  process.exit(1);
}

const password = `${randomBytes(15).toString("base64url")}!9a`;
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email: email.toLowerCase(),
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
});
if (createErr || !created.user) {
  console.error("Could not create the login:", createErr?.message);
  process.exit(1);
}

const { error: staffErr } = await admin.from("staff").insert({
  id: created.user.id,
  full_name: fullName,
  email: email.toLowerCase(),
  role_id: role.id,
  branch: "both",
});
if (staffErr) {
  await admin.auth.admin.deleteUser(created.user.id);
  console.error("Could not create the staff record:", staffErr.message);
  process.exit(1);
}

console.log(`\nOwner created: ${email}`);
console.log(`One-time password: ${password}`);
console.log("Sign in at /login, set up 2FA when asked, then change this password under Account.\n");

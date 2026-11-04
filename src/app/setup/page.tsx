import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AuthFrame } from "@/components/auth/AuthFrame";

export const metadata = { title: "Setup" };

const steps = [
  ["Create a Supabase project", "supabase.com → New project. Pick a region close to Ghana (for example Europe West) and save the database password somewhere safe."],
  ["Copy the keys into .env.local", "Project Settings → API. Copy .env.example to .env.local and fill in the URL, the publishable (anon) key and the secret (service role) key. Restart the dev server."],
  ["Apply the database", "Add SUPABASE_DB_URL to .env.local (Connect, Session pooler), then run: node scripts/db-apply.mjs --apply --seed. It creates the tables, rules, storage buckets and starter catalogue, and is safe to run again."],
  ["Turn on 2FA", "Authentication, Multi-Factor: enable TOTP. Keep customer sign-ups on: staff only get access through the staff table."],
  ["Create the first Owner", "Run: node scripts/create-owner.mjs you@example.com \"Your Name\". It prints a one-time password."],
];

export default function Setup() {
  return (
    <AuthFrame title="Connect Supabase" intro="The staff dashboard needs a database and login. This takes about ten minutes.">
      {isSupabaseConfigured && <p role="status" className="mb-4 rounded-[12px] bg-[#e3f5ee] px-3 py-2 text-sm font-medium text-success">Supabase is connected. You can sign in now.</p>}
      <ol className="space-y-4 text-sm">
        {steps.map(([title, text], i) => (
          <li key={title} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">{i + 1}</span>
            <span><b>{title}</b><br /><span className="text-text2">{text}</span></span>
          </li>
        ))}
      </ol>
    </AuthFrame>
  );
}

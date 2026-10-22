// NEXT_PUBLIC_ values must be read as literal property accesses so Next can inline them into the browser bundle.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export function requireConfig() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase is not configured. Copy .env.example to .env.local and fill it in.");
  }
  return { url: supabaseUrl, key: supabaseKey };
}

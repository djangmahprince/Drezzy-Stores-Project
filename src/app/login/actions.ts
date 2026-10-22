"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

/** Only ever send people back into the staff area, never to an address someone typed into the URL. */
function safeNext(value: string) {
  return value.startsWith("/dashboard") && !value.startsWith("//") && !value.includes("\\") ? value : "/dashboard";
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!email || !password) return { error: "Enter your email and password." };
  if (!isSupabaseConfigured) return { error: "Sign-in is not set up yet. See the setup page." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // One message for every failure, so the form never reveals which emails have accounts.
  if (error) return { error: "That email and password do not match." };

  redirect(next);
}

export async function signOut() {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

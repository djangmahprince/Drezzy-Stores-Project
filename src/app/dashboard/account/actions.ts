"use server";

import { getStaffState } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type PasswordState = { error?: string; ok?: boolean };

export async function changePassword(_prev: PasswordState, fd: FormData): Promise<PasswordState> {
  const s = await getStaffState();
  if (s.status !== "ok") return { error: "Please sign in again." };

  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (password.length < 12) return { error: "Use at least 12 characters." };
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) return { error: "Mix upper and lower case letters and a number." };
  if (password !== confirm) return { error: "The two passwords do not match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Could not change the password. Try a different one." };
  return { ok: true };
}

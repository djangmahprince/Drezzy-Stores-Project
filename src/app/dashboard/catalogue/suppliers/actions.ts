"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export type SupplierState = { error?: string; ok?: boolean };

/** Adds a supplier, or updates one when an id is sent. Row-level security decides who may; this gives clear errors. */
export async function saveSupplier(_prev: SupplierState, fd: FormData): Promise<SupplierState> {
  const me = await requireStaff();
  if (!can(me.permissions, "availability", "edit")) return { error: "You do not have permission to manage suppliers." };

  const id = String(fd.get("id") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  const clean = (k: string) => String(fd.get(k) ?? "").trim() || null;
  if (name.length < 2) return { error: "Give the supplier a name." };

  const row = { name, phone: clean("phone"), whatsapp: clean("whatsapp"), notes: clean("notes"), active: fd.get("active") !== "false" };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("suppliers").update(row).eq("id", id).select("id").maybeSingle()
    : await supabase.from("suppliers").insert(row).select("id").maybeSingle();

  if (error) return { error: /duplicate|unique/i.test(error.message) ? "A supplier with that name already exists." : "The database did not allow that change." };
  if (!data) return { error: "You are not allowed to change that supplier." };
  revalidatePath("/dashboard/catalogue/suppliers");
  return { ok: true };
}

"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAction } from "@/lib/auth";
import { modules } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export type RoleState = { error?: string; ok?: boolean };

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);

/** FR-ROLE-001: an Owner creates a custom role by choosing permissions per module. The database re-checks everything. */
export async function createRole(_prev: RoleState, fd: FormData): Promise<RoleState> {
  let me;
  try {
    me = await requireAction("staff", "create");
  } catch {
    return { error: "You do not have permission to create roles." };
  }
  if (me.roleKey !== "owner") return { error: "Only an Owner can create roles." };

  const name = String(fd.get("name") ?? "").trim();
  const description = String(fd.get("description") ?? "").trim() || null;
  if (name.length < 2 || name.length > 60) return { error: "Give the role a name (2 to 60 characters)." };

  const rows = modules
    .filter((m) => m !== "salary") // salary access belongs to Owner and Finance only (FR-ROLE-003)
    .map((m) => {
      const on = (k: string) => fd.get(`${m}.${k}`) === "on";
      const view = on("view");
      return {
        module: m,
        can_view: view,
        can_create: view && on("create"),
        can_edit: view && on("edit"),
        can_delete: view && on("delete"),
        can_export: on("export"),
        scope: fd.get(`${m}.own`) === "on" ? "own" : "all",
      };
    })
    .filter((r) => r.can_view || r.can_export);
  if (rows.length === 0) return { error: "Choose at least one permission." };

  const supabase = await createClient();
  const { data: role, error } = await supabase
    .from("roles")
    .insert({ key: `${slug(name) || "role"}_${randomBytes(2).toString("hex")}`, name, description })
    .select("id")
    .single();
  if (error || !role) return { error: "Could not create the role. Try a different name." };

  const { error: permErr } = await supabase.from("role_permissions").insert(rows.map((r) => ({ ...r, role_id: role.id })));
  if (permErr) {
    await supabase.from("roles").delete().eq("id", role.id); // do not leave an empty role behind
    return { error: "Could not save the permissions." };
  }

  revalidatePath("/dashboard/settings/roles");
  return { ok: true };
}

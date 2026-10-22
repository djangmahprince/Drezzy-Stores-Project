"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAction } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type InviteState = { error?: string; ok?: { email: string; password: string } };
export type UpdateState = { error?: string; ok?: boolean };

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const branches = ["accra", "kumasi", "both"];

/** Database rule messages are written for people, so show them; hide anything else. */
const friendly = (m: string) =>
  /^(Only an Owner|You cannot|There must|Salary|System roles|The Owner)/.test(m) ? m : "The database did not allow that change.";

function tempPassword() {
  return `${randomBytes(12).toString("base64url")}!7a`;
}

/**
 * Add a staff member. The login is created with the service key (no user can do that), but the staff record is written
 * with the caller's own session, so row-level security, the guards and the audit log all apply to the caller.
 */
export async function inviteStaff(_prev: InviteState, fd: FormData): Promise<InviteState> {
  let me;
  try {
    me = await requireAction("staff", "create");
  } catch {
    return { error: "You do not have permission to add staff." };
  }

  const fullName = String(fd.get("fullName") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const phone = String(fd.get("phone") ?? "").trim() || null;
  const roleId = String(fd.get("roleId") ?? "");
  const branch = String(fd.get("branch") ?? "both");

  if (fullName.length < 2) return { error: "Enter the person's full name." };
  if (!emailOk(email)) return { error: "Enter a valid email address." };
  if (!roleId) return { error: "Choose a role." };
  if (!branches.includes(branch)) return { error: "Choose a branch." };

  const supabase = await createClient();
  const { data: role } = await supabase.from("roles").select("id, key").eq("id", roleId).maybeSingle();
  if (!role) return { error: "That role does not exist." };
  if ((role.key === "owner" || role.key === "finance") && me.roleKey !== "owner") {
    return { error: "Only an Owner can add an Owner or a Finance user." };
  }

  const admin = createAdminClient();
  const password = tempPassword();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr || !created.user) {
    return { error: /already|registered|exists/i.test(createErr?.message ?? "") ? "That email already has an account." : "Could not create the login." };
  }

  const { error: insErr } = await supabase
    .from("staff")
    .insert({ id: created.user.id, full_name: fullName, email, phone, role_id: roleId, branch, created_by: me.id });
  if (insErr) {
    await admin.auth.admin.deleteUser(created.user.id); // do not leave a login with no staff record
    return { error: friendly(insErr.message) };
  }

  revalidatePath("/dashboard/settings/staff");
  return { ok: { email, password } };
}

export async function updateStaff(_prev: UpdateState, fd: FormData): Promise<UpdateState> {
  try {
    await requireAction("staff", "edit");
  } catch {
    return { error: "You do not have permission to edit staff." };
  }

  const id = String(fd.get("id") ?? "");
  const roleId = String(fd.get("roleId") ?? "");
  const branch = String(fd.get("branch") ?? "");
  const active = fd.get("active") === "true";
  if (!id || !roleId || !branches.includes(branch)) return { error: "Something is missing from that form." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff")
    .update({ role_id: roleId, branch, active })
    .eq("id", id)
    .select("id, active")
    .maybeSingle();

  if (error) return { error: friendly(error.message) };
  if (!data) return { error: "You are not allowed to change that person." };

  // A switched-off person is also blocked from signing in at all, and unblocked if switched back on.
  try {
    await createAdminClient().auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
  } catch {
    return { error: "Saved, but the sign-in block could not be updated. Their database access is already off." };
  }

  revalidatePath("/dashboard/settings/staff");
  return { ok: true };
}

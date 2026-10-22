import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { can, modules, type Action, type Module, type Permission, type PermissionMap } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Data Access Layer for staff. Everything that reads or changes staff data asks this file who the caller is,
 * close to the data, instead of trusting the proxy or the menu. The database then checks again (row-level security).
 */

export type Staff = {
  id: string;
  email: string;
  fullName: string;
  roleKey: string;
  roleName: string;
  branch: "accra" | "kumasi" | "both";
  permissions: PermissionMap;
};

export type StaffState =
  | { status: "unconfigured" }
  | { status: "anonymous" }
  | { status: "needs_mfa_setup" }
  | { status: "needs_mfa" }
  | { status: "not_staff" }
  | { status: "ok"; staff: Staff };

/**
 * Local design preview only: with DREZZY_DEMO_STAFF=1 and no Supabase, `next dev` signs you in as a demo Owner so the
 * dashboard screens can be worked on. It is ignored in any production build, so it can never open a live dashboard.
 */
function demoStaff(): Staff {
  const permissions: PermissionMap = {};
  for (const m of modules) {
    permissions[m] = { module: m, can_view: true, can_create: true, can_edit: true, can_delete: true, can_export: true, scope: "all", restriction: null };
  }
  return { id: "demo", email: "demo@drezzy.local", fullName: "Demo Owner", roleKey: "owner", roleName: "Owner (demo)", branch: "both", permissions };
}

/** Resolves the caller once per request. */
export const getStaffState = cache(async (): Promise<StaffState> => {
  // Always decide per request. Without this, an unconfigured build could bake a redirect into the page.
  await connection();

  if (!isSupabaseConfigured) {
    if (process.env.NODE_ENV !== "production" && process.env.DREZZY_DEMO_STAFF === "1") return { status: "ok", staff: demoStaff() };
    return { status: "unconfigured" };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return { status: "anonymous" };

  // Staff must be on a 2FA-verified session. The database refuses staff data on anything weaker.
  if (claims.aal !== "aal2") {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return { status: aal?.nextLevel === "aal2" ? "needs_mfa" : "needs_mfa_setup" };
  }

  const { data: row } = await supabase
    .from("staff")
    .select("id, email, full_name, branch, active, role:roles(id, key, name)")
    .eq("id", claims.sub)
    .maybeSingle();

  const role = Array.isArray(row?.role) ? row?.role[0] : row?.role;
  if (!row || !row.active || !role) return { status: "not_staff" };

  const { data: perms } = await supabase
    .from("role_permissions")
    .select("module, can_view, can_create, can_edit, can_delete, can_export, scope, restriction")
    .eq("role_id", role.id);

  const permissions: PermissionMap = {};
  (perms as Permission[] | null)?.forEach((p) => {
    permissions[p.module] = p;
  });

  return {
    status: "ok",
    staff: { id: row.id, email: row.email, fullName: row.full_name, roleKey: role.key, roleName: role.name, branch: row.branch, permissions },
  };
});

/** For pages and layouts: returns the signed-in staff member or sends them where they need to go. */
export async function requireStaff(): Promise<Staff> {
  const s = await getStaffState();
  switch (s.status) {
    case "ok":
      return s.staff;
    case "unconfigured":
      redirect("/setup");
    case "anonymous":
      redirect("/login");
    case "needs_mfa":
    case "needs_mfa_setup":
      redirect("/login/2fa");
    case "not_staff":
      redirect("/login?error=not_staff");
  }
}

/** For pages: the staff member plus whether they may do `action` on `module`. The page decides how to show "no access". */
export async function authorize(module: Module, action: Action = "view") {
  const staff = await requireStaff();
  return { staff, allowed: can(staff.permissions, module, action) };
}

export class ForbiddenError extends Error {
  constructor(module: Module, action: Action) {
    super(`You do not have permission to ${action} ${module}.`);
  }
}

/** For server actions and route handlers. Re-checks on every call, because a client can call an action directly. */
export async function requireAction(module: Module, action: Action): Promise<Staff> {
  const s = await getStaffState();
  if (s.status !== "ok") throw new ForbiddenError(module, action);
  if (!can(s.staff.permissions, module, action)) throw new ForbiddenError(module, action);
  return s.staff;
}

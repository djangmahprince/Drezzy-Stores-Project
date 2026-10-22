import { DbGate, Guard } from "@/components/dashboard/Guard";
import { StaffManager, type RoleOption, type StaffRowData } from "@/components/dashboard/StaffManager";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Staff" };

async function List() {
  const me = await requireStaff();
  const supabase = await createClient();
  const [{ data: staff }, { data: roles }] = await Promise.all([
    supabase.from("staff").select("id, full_name, email, phone, branch, active, role_id").order("created_at"),
    supabase.from("roles").select("id, key, name").order("is_system", { ascending: false }).order("name"),
  ]);
  return (
    <StaffManager
      staff={(staff ?? []) as StaffRowData[]}
      roles={(roles ?? []) as RoleOption[]}
      meId={me.id}
      meIsOwner={me.roleKey === "owner"}
      canCreate={can(me.permissions, "staff", "create")}
      canEdit={can(me.permissions, "staff", "edit")}
    />
  );
}

export default function StaffPage() {
  return (
    <Guard module="staff">
      <DbGate>
        <List />
      </DbGate>
    </Guard>
  );
}

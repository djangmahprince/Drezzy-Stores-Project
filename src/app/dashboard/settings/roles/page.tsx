import { DbGate, Guard } from "@/components/dashboard/Guard";
import { RoleCreator } from "@/components/dashboard/RoleCreator";
import { requireStaff } from "@/lib/auth";
import { modules, moduleLabels, type Permission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Roles" };

/** F full, E create and edit, V view, O own records only, X export only, dash no access (same key as the PRD). */
function code(p?: Permission) {
  if (!p) return "–";
  if (p.can_view && p.can_create && p.can_edit && p.can_delete && p.can_export) return "F";
  if (p.scope === "own") return "O";
  if (p.can_create || p.can_edit || p.can_delete) return "E";
  if (p.can_view) return "V";
  if (p.can_export) return "X";
  return "–";
}

const tone: Record<string, string> = {
  F: "bg-navy text-white", E: "bg-[#e6eaf8] text-navy", V: "bg-card text-text2", O: "bg-[#fbeedb] text-warning", X: "bg-[#e3f5ee] text-success", "–": "text-muted",
};

async function Matrix() {
  const me = await requireStaff();
  const supabase = await createClient();
  const [{ data: roles }, { data: perms }] = await Promise.all([
    supabase.from("roles").select("id, name, is_system").order("is_system", { ascending: false }).order("name"),
    supabase.from("role_permissions").select("role_id, module, can_view, can_create, can_edit, can_delete, can_export, scope, restriction"),
  ]);
  const byRole = new Map<string, Map<string, Permission>>();
  (perms ?? []).forEach((p: Permission & { role_id: string }) => {
    if (!byRole.has(p.role_id)) byRole.set(p.role_id, new Map());
    byRole.get(p.role_id)!.set(p.module, p);
  });

  return (
    <>
      {me.roleKey === "owner" && <RoleCreator />}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line text-text2">
            <tr><th className="px-3 py-3 font-medium">Module</th>{(roles ?? []).map((r) => <th key={r.id} className="px-2 py-3 text-center font-medium">{r.name}{!r.is_system && <span className="block text-[10px] font-normal text-text2">custom</span>}</th>)}</tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <tr key={m} className="border-b border-line last:border-0">
                <td className="px-3 py-2">{moduleLabels[m]}</td>
                {(roles ?? []).map((r) => {
                  const p = byRole.get(r.id)?.get(m);
                  const c = code(p);
                  return (
                    <td key={r.id} className="px-2 py-2 text-center">
                      <span title={p?.restriction ?? undefined} className={`inline-flex min-w-8 justify-center rounded-md px-2 py-1 text-xs font-bold ${tone[c]}`}>{c}{p?.restriction ? "*" : ""}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-text2">F full · E create and edit · V view · O own records only · X export only · – no access · * has a limit (hover to read it). The database enforces this table; the menu only reflects it.</p>
    </>
  );
}

export default function RolesPage() {
  return (
    <Guard module="staff">
      <DbGate>
        <Matrix />
      </DbGate>
    </Guard>
  );
}

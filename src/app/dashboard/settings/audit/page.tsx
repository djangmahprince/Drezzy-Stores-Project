import Link from "next/link";
import { Suspense } from "react";
import { DbGate, Guard } from "@/components/dashboard/Guard";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Audit log" };

type Entry = {
  id: number; at: string; actor_name: string | null; actor_role: string | null; action: "INSERT" | "UPDATE" | "DELETE";
  table_name: string; record_id: string | null; old_values: Record<string, unknown> | null; new_values: Record<string, unknown> | null;
};

const tables = [["", "Everything"], ["staff", "Staff"], ["roles", "Roles"], ["role_permissions", "Permissions"]] as const;
const skip = new Set(["updated_at", "created_at", "created_by"]);
const names: Record<string, string> = { role_id: "role", full_name: "name", can_view: "view", can_create: "create", can_edit: "edit", can_delete: "delete", can_export: "export" };

function describe(e: Entry, roleName: (id: unknown) => string): { what: string; detail: string[] } {
  const row = (e.new_values ?? e.old_values ?? {}) as Record<string, unknown>;
  const label = e.table_name === "staff" ? String(row.full_name ?? "a staff member")
    : e.table_name === "roles" ? `the ${String(row.name ?? "")} role`
    : `${String(row.module ?? "")} permission for ${roleName(row.role_id)}`;
  const verb = e.action === "INSERT" ? "Added" : e.action === "DELETE" ? "Removed" : "Changed";
  const detail: string[] = [];
  if (e.action === "UPDATE" && e.old_values && e.new_values) {
    for (const k of Object.keys(e.new_values)) {
      if (skip.has(k) || JSON.stringify(e.old_values[k]) === JSON.stringify(e.new_values[k])) continue;
      const fmt = (v: unknown) => (k === "role_id" ? roleName(v) : v === null || v === "" ? "empty" : String(v));
      detail.push(`${names[k] ?? k}: ${fmt(e.old_values[k])} → ${fmt(e.new_values[k])}`);
    }
  }
  return { what: `${verb} ${label}`, detail };
}

async function Log({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  const { table = "" } = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(200);
  if (table) q = q.eq("table_name", table);
  const [{ data }, { data: roles }] = await Promise.all([q, supabase.from("roles").select("id, name")]);

  const rn = new Map((roles ?? []).map((r: { id: string; name: string }) => [r.id, r.name]));
  const roleName = (id: unknown) => rn.get(String(id)) ?? "a role";
  const entries = (data ?? []) as Entry[];

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter by area">
        {tables.map(([v, l]) => (
          <Link key={l} href={v ? `/dashboard/settings/audit?table=${v}` : "/dashboard/settings/audit"} aria-current={table === v ? "true" : undefined} className={`chip min-h-9 px-3 text-sm ${table === v ? "bg-navy text-white" : "bg-white text-navy"}`}>{l}</Link>
        ))}
      </div>
      {entries.length === 0 ? (
        <p className="card p-10 text-center text-text2">Nothing recorded yet. Changes to staff and roles appear here.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-text2"><tr>{["Who", "What", "When"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {entries.map((e) => {
                const d = describe(e, roleName);
                return (
                  <tr key={e.id} className="border-b border-line align-top last:border-0">
                    <td className="px-4 py-3"><p className="font-medium">{e.actor_name ?? "System"}</p>{e.actor_role && <p className="text-xs text-text2">{e.actor_role.replace(/_/g, " ")}</p>}</td>
                    <td className="px-4 py-3"><p>{d.what}</p>{d.detail.map((x) => <p key={x} className="text-xs text-text2">{x}</p>)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-text2">{new Date(e.at).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-sm text-text2">The audit log cannot be edited or deleted by anyone. It shows the latest 200 entries.</p>
    </>
  );
}

export default function AuditPage({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  return (
    <Guard module="audit">
      <DbGate>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
          <Log searchParams={searchParams} />
        </Suspense>
      </DbGate>
    </Guard>
  );
}

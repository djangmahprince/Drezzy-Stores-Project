"use client";

import { useActionState, useState } from "react";
import { createRole, type RoleState } from "@/app/dashboard/settings/roles/actions";
import { modules, moduleLabels } from "@/lib/permissions";

const cols = [["view", "View"], ["create", "Create"], ["edit", "Edit"], ["delete", "Delete"], ["export", "Export"], ["own", "Own only"]] as const;

export function RoleCreator() {
  const [state, action, pending] = useActionState<RoleState, FormData>(createRole, {});
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="btn-primary !min-h-10">{open ? "Close" : "New role"}</button>
      {open && (
        <form action={action} className="card mt-3 space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="r-name" className="mb-1 block text-sm font-medium">Role name</label><input id="r-name" name="name" className="field" required /></div>
            <div><label htmlFor="r-desc" className="mb-1 block text-sm font-medium">What they do (optional)</label><input id="r-desc" name="description" className="field" /></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-line text-text2"><tr><th className="py-2 pr-3 font-medium">Module</th>{cols.map(([, l]) => <th key={l} className="px-2 py-2 text-center font-medium">{l}</th>)}</tr></thead>
              <tbody>
                {modules.filter((m) => m !== "salary").map((m) => (
                  <tr key={m} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3">{moduleLabels[m]}</td>
                    {cols.map(([k, l]) => (
                      <td key={k} className="px-2 py-2 text-center"><input type="checkbox" name={`${m}.${k}`} aria-label={`${l} ${moduleLabels[m]}`} className="size-5 accent-[#00115b]" /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-text2">Salary records are not on this list: only the Owner and Finance can ever have that access. Create, edit and delete need View.</p>
          {state.error && <p role="alert" className="rounded-[12px] bg-[#fbe4e4] px-3 py-2 text-sm font-medium text-error">{state.error}</p>}
          {state.ok && <p role="status" className="rounded-[12px] bg-[#e3f5ee] px-3 py-2 text-sm font-medium text-success">Role created. You can give it to staff now.</p>}
          <button disabled={pending} className="btn-primary !min-h-10 disabled:opacity-60">{pending ? "Creating…" : "Create role"}</button>
        </form>
      )}
    </div>
  );
}

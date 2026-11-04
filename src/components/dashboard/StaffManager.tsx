"use client";

import { useActionState, useState } from "react";
import { inviteStaff, updateStaff, type InviteState, type UpdateState } from "@/app/dashboard/settings/staff/actions";
import { Pill } from "@/components/dashboard/DashShell";

export type StaffRowData = { id: string; full_name: string; email: string; phone: string | null; branch: "accra" | "kumasi" | "both"; active: boolean; role_id: string };
export type RoleOption = { id: string; key: string; name: string };

const branchLabel = { accra: "Accra", kumasi: "Kumasi", both: "Both branches" } as const;
const sel = "min-h-10 rounded-[10px] border border-line bg-white px-2 text-sm disabled:bg-card disabled:text-muted";

/** The UI only hides what the database would refuse anyway (Owner and Finance roles are Owner-only to hand out). */
const ownerOnly = (key: string) => key === "owner" || key === "finance";

function AddStaff({ roles, meIsOwner, canCreate }: { roles: RoleOption[]; meIsOwner: boolean; canCreate: boolean }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteStaff, {});
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!canCreate) return null;

  return (
    <div className="mb-4">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="btn-primary !min-h-10">{open ? "Close" : "Add staff"}</button>
      {open && (
        <form action={action} className="card mt-3 grid gap-3 p-4 sm:grid-cols-2" noValidate>
          <div><label htmlFor="s-name" className="mb-1 block text-sm font-medium">Full name</label><input id="s-name" name="fullName" className="field" required /></div>
          <div><label htmlFor="s-email" className="mb-1 block text-sm font-medium">Email</label><input id="s-email" name="email" type="email" className="field" required /></div>
          <div><label htmlFor="s-phone" className="mb-1 block text-sm font-medium">Phone (optional)</label><input id="s-phone" name="phone" type="tel" className="field" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="s-role" className="mb-1 block text-sm font-medium">Role</label>
              <select id="s-role" name="roleId" className="field" defaultValue="">
                <option value="" disabled>Choose</option>
                {roles.map((r) => <option key={r.id} value={r.id} disabled={!meIsOwner && ownerOnly(r.key)}>{r.name}</option>)}
              </select></div>
            <div><label htmlFor="s-branch" className="mb-1 block text-sm font-medium">Branch</label>
              <select id="s-branch" name="branch" className="field" defaultValue="both"><option value="both">Both</option><option value="accra">Accra</option><option value="kumasi">Kumasi</option></select></div>
          </div>
          {state.error && <p role="alert" className="rounded-[12px] bg-[#fbe4e4] px-3 py-2 text-sm font-medium text-error sm:col-span-2">{state.error}</p>}
          {state.ok && (
            <div role="status" className="space-y-2 rounded-[12px] bg-[#e3f5ee] p-3 text-sm sm:col-span-2">
              <p className="font-semibold text-success">{state.ok.email} was added.</p>
              <p>Give them this one-time password. It is shown only now. They will set up 2FA when they first sign in.</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="select-all rounded-[10px] bg-white px-3 py-2 font-mono">{state.ok.password}</code>
                <button type="button" className="btn-outline !min-h-10" onClick={() => navigator.clipboard.writeText(state.ok!.password).then(() => setCopied(true))}>{copied ? "Copied" : "Copy"}</button>
              </div>
            </div>
          )}
          <div className="sm:col-span-2"><button disabled={pending} className="btn-primary !min-h-10 disabled:opacity-60">{pending ? "Adding…" : "Add this person"}</button></div>
        </form>
      )}
    </div>
  );
}

function Row({ s, roles, meId, meIsOwner, canEdit }: { s: StaffRowData; roles: RoleOption[]; meId: string; meIsOwner: boolean; canEdit: boolean }) {
  const [state, action, pending] = useActionState<UpdateState, FormData>(updateStaff, {});
  const self = s.id === meId;
  const roleKey = roles.find((r) => r.id === s.role_id)?.key ?? "";
  const locked = !canEdit || (!meIsOwner && roleKey === "owner");
  const form = `row-${s.id}`;

  return (
    <tr className="border-b border-line align-top last:border-0">
      <td className="px-3 py-3">
        <p className="font-semibold">{s.full_name}{self && <span className="ml-2 text-xs font-normal text-text2">(you)</span>}</p>
        <p className="text-xs text-text2">{s.email}{s.phone ? ` · ${s.phone}` : ""}</p>
      </td>
      <td className="px-3 py-3">
        <select form={form} name="roleId" defaultValue={s.role_id} disabled={locked || self} aria-label={`Role for ${s.full_name}`} className={sel}>
          {roles.map((r) => <option key={r.id} value={r.id} disabled={!meIsOwner && ownerOnly(r.key) && r.id !== s.role_id}>{r.name}</option>)}
        </select>
      </td>
      <td className="px-3 py-3">
        <select form={form} name="branch" defaultValue={s.branch} disabled={locked} aria-label={`Branch for ${s.full_name}`} className={sel}>
          {Object.entries(branchLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </td>
      <td className="px-3 py-3">
        <select form={form} name="active" defaultValue={String(s.active)} disabled={locked || self} aria-label={`Status for ${s.full_name}`} className={sel}>
          <option value="true">Active</option><option value="false">Switched off</option>
        </select>
      </td>
      <td className="px-3 py-3">
        <form id={form} action={action} className="flex items-center gap-2">
          <input type="hidden" name="id" value={s.id} />
          <button disabled={locked || pending} className="btn-outline !min-h-10 disabled:opacity-50">{pending ? "Saving…" : "Save"}</button>
          {state.ok && <Pill tone="ok">Saved</Pill>}
        </form>
        {state.error && <p role="alert" className="mt-1 max-w-48 text-xs font-medium text-error">{state.error}</p>}
      </td>
    </tr>
  );
}

export function StaffManager({ staff, roles, meId, meIsOwner, canCreate, canEdit }: { staff: StaffRowData[]; roles: RoleOption[]; meId: string; meIsOwner: boolean; canCreate: boolean; canEdit: boolean }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const shown = staff.filter((s) => !term || JSON.stringify(s).toLowerCase().includes(term));
  return (
    <>
      <AddStaff roles={roles} meIsOwner={meIsOwner} canCreate={canCreate} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person" aria-label="Find a person" className="field mb-3 !min-h-10 max-w-xs" />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line text-text2">
            <tr>{["Person", "Role", "Branch", "Status", ""].map((h) => <th key={h} className="px-3 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>{shown.map((s) => <Row key={s.id} s={s} roles={roles} meId={meId} meIsOwner={meIsOwner} canEdit={canEdit} />)}</tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-text2">Switching someone off blocks their sign-in straight away. Every change here is recorded in the audit log.</p>
    </>
  );
}

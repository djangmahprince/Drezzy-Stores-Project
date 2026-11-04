"use client";

import { useEffect, useState, useTransition } from "react";
import { crudDeleteAction, crudListAction, crudSaveAction, type Row } from "@/app/dashboard/crud-actions";
import { crudTables, type Field } from "@/lib/crud";

const toLocal = (iso: unknown) => (typeof iso === "string" && iso ? new Date(iso).toISOString().slice(0, 16) : "");
const show = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "Yes" : "No") : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : /^\d{4}-\d{2}-\d{2}T/.test(String(v)) ? new Date(String(v)).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : String(v));

function Input({ f, value, onChange }: { f: Field; value: unknown; onChange: (v: unknown) => void }) {
  const id = `crud-${f.key}`;
  const base = "field";
  switch (f.type) {
    case "bool":
      return <label className="flex min-h-12 items-center gap-2 text-sm"><input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-[#00115b]" /> {f.label}</label>;
    case "select":
      return <select id={id} className={base} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}><option value="">Choose</option>{f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
    case "textarea":
      return <textarea id={id} className={`${base} py-2`} rows={f.key === "body" ? 14 : 3} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
    case "json":
      return <textarea id={id} className={`${base} py-2 font-mono text-xs`} rows={4} value={typeof value === "string" ? value : JSON.stringify(value ?? (f.key === "items" ? [] : {}), null, 1)} onChange={(e) => onChange(e.target.value)} />;
    case "list":
      return <input id={id} className={base} value={Array.isArray(value) ? value.join(", ") : String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return <input id={id} className={base} type="number" step="any" value={value === null || value === undefined ? "" : String(value)} onChange={(e) => onChange(e.target.value)} />;
    case "datetime":
      return <input id={id} className={base} type="datetime-local" value={typeof value === "string" && value.length === 16 ? value : toLocal(value)} onChange={(e) => onChange(e.target.value)} />;
    case "date":
      return <input id={id} className={base} type="date" value={String(value ?? "").slice(0, 10)} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <input id={id} className={base} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
  }
}

/**
 * A list with an add / edit / delete form for one of the tables in lib/crud. The server action writes only the listed
 * columns, with the person's own session, so row-level security applies; content changes refresh the shop at once.
 */
export function CrudEditor({ name, intro, canEdit = true }: { name: string; intro?: string; canEdit?: boolean }) {
  const def = crudTables[name];
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ key: string | null; values: Row } | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const load = () => crudListAction(name).then((r) => { setRows(r.rows); setError(r.error ?? null); });
  useEffect(() => void load(), [name]); // eslint-disable-line react-hooks/exhaustive-deps

  const blank = () => Object.fromEntries(def.fields.map((f) => [f.key, f.type === "bool" ? (f.key === "active" || f.key === "published" || f.key === "permanent") : f.key === "max_per_customer" ? 1 : ""]));
  const save = () => start(async () => {
    if (!edit) return;
    const r = await crudSaveAction(name, edit.key, edit.values);
    setMsg(r.ok ? { text: "Saved." } : { text: r.error, bad: true });
    if (r.ok) { setEdit(null); void load(); }
  });

  return (
    <section className="space-y-3">
      {intro && <p className="text-sm text-text2">{intro}</p>}
      {msg && <p role={msg.bad ? "alert" : "status"} className={`rounded-[12px] px-3 py-2 text-sm ${msg.bad ? "bg-[#fbe4e4] text-error" : "bg-[#e3f5ee] text-success"}`}>{msg.text}</p>}
      {error && <p className="rounded-[12px] bg-card p-3 text-sm text-text2">{error}</p>}
      {canEdit && !def.noCreate && !edit && <button type="button" className="btn-primary !min-h-10" onClick={() => setEdit({ key: null, values: blank() })}>Add</button>}
      {edit && (
        <form className="card grid gap-3 p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
          {def.fields.map((f) => (
            <div key={f.key} className={f.wide || f.type === "textarea" || f.type === "json" ? "sm:col-span-2" : ""}>
              {f.type !== "bool" && <label htmlFor={`crud-${f.key}`} className="mb-1 block text-sm font-medium">{f.label}{f.required ? " *" : ""}</label>}
              <Input f={f} value={edit.values[f.key]} onChange={(v) => setEdit((x) => (x ? { ...x, values: { ...x.values, [f.key]: v } } : x))} />
              {f.hint && <p className="mt-1 text-xs text-text2">{f.hint}</p>}
            </div>
          ))}
          <div className="flex gap-2 sm:col-span-2">
            <button disabled={pending} className="btn-primary">{pending ? "Saving…" : "Save"}</button>
            <button type="button" className="btn-outline" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </form>
      )}
      {rows === null ? <div className="h-32 animate-pulse rounded-[12px] bg-white" /> : rows.length === 0 ? <p className="card p-6 text-center text-sm text-text2">Nothing here yet.</p> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-line text-text2"><tr>{def.display.map((c) => <th key={c} className="px-4 py-3 font-medium">{def.fields.find((f) => f.key === c)?.label ?? c.replace(/_/g, " ")}</th>)}<th className="px-4 py-3" /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r[def.key])} className="border-b border-line last:border-0">
                  {def.display.map((c) => <td key={c} className="max-w-xs truncate px-4 py-3">{show(r[c])}</td>)}
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {canEdit && <button type="button" className="text-navy underline" onClick={() => setEdit({ key: String(r[def.key]), values: { ...r } })}>Edit</button>}
                    {canEdit && !def.noDelete && <button type="button" className="ml-3 text-error underline" onClick={() => { if (window.confirm("Delete this?")) start(async () => { const x = await crudDeleteAction(name, String(r[def.key])); setMsg(x.ok ? { text: "Deleted." } : { text: x.error, bad: true }); void load(); }); }}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

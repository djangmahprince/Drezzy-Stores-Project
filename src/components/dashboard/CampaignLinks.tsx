"use client";

import { useEffect, useState } from "react";
import { crudListAction, type Row } from "@/app/dashboard/crud-actions";
import { CrudEditor } from "@/components/dashboard/CrudEditor";

/** The UTM link builder (FR-AN-008): save a campaign, copy its tagged link for bios, flyers and ads. */
export function CampaignLinks({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => void crudListAction("campaigns").then((r) => setRows(r.rows)), []);
  const link = (r: Row) => `${window.location.origin}${r.landing_path ?? "/"}?utm_source=${r.utm_source}&utm_medium=${r.utm_medium}&utm_campaign=${r.utm_campaign}`;
  return (
    <div className="space-y-4">
      <CrudEditor name="campaigns" canEdit={canEdit} intro="One tagged link per bio, ad or flyer, so every sale shows where it came from. Use lower-case words with dashes." />
      {rows.length > 0 && (
        <section className="card space-y-2 p-4 text-sm"><h2 className="font-semibold">Links to copy (reload after adding)</h2>
          {rows.map((r) => <p key={String(r.id)} className="flex items-center justify-between gap-3"><span className="truncate">{String(r.name)}</span><button type="button" className="shrink-0 text-navy underline" onClick={() => { void navigator.clipboard.writeText(link(r)); setCopied(String(r.id)); }}>{copied === r.id ? "Copied" : "Copy link"}</button></p>)}
        </section>
      )}
    </div>
  );
}

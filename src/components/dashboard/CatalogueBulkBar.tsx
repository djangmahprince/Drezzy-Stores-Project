"use client";

import { useState, useTransition } from "react";
import { bulkEditProducts } from "@/app/dashboard/catalogue/tools-actions";
import type { BulkPatch, CatalogueRights, CategoryRow, ProductStatus } from "@/lib/catalogue/staff-types";
import type { Availability } from "@/lib/catalogue/types";

const sel = "min-h-9 rounded-[10px] border border-line bg-white px-2 text-sm";
const words = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

type Kind = "" | "price" | "pct" | "availability" | "lead" | "category" | "status" | "addTags" | "removeTags" | "checked";

/** Bulk edit (FR-CAT-007) and bulk confirm (FR-CAT-005). Appears above the list; the choices follow the person's rights. */
export function CatalogueBulkBar({ selected, shown, onSelect, rights, categories }: {
  selected: string[]; shown: string[]; onSelect: (ids: string[]) => void; rights: CatalogueRights; categories: CategoryRow[];
}) {
  const [kind, setKind] = useState<Kind>("");
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();

  const options: [Kind, string, boolean][] = [
    ["checked", "Mark as checked today", rights.canEditAvailability], ["availability", "Set availability", rights.canEditAvailability], ["lead", "Set lead time", rights.canEditAvailability],
    ["price", "Set price", rights.canEditPrice], ["pct", "Change price by %", rights.canEditPrice], ["category", "Move to category", rights.canEditPrice],
    ["status", "Set status", rights.canEditPrice], ["addTags", "Add tags", rights.canEditPrice], ["removeTags", "Remove tags", rights.canEditPrice],
  ];

  function patch(): BulkPatch | null {
    switch (kind) {
      case "checked": return { markChecked: true };
      case "availability": return value ? { availability: value as Availability } : null;
      case "lead": return value === "" ? null : { leadDays: Number(value) };
      case "price": return value === "" ? null : { price: Number(value) };
      case "pct": return value === "" ? null : { pricePct: Number(value) };
      case "category": return value ? { categoryId: value } : null;
      case "status": return value ? { status: value as ProductStatus } : null;
      case "addTags": return words(value).length ? { addTags: words(value) } : null;
      case "removeTags": return words(value).length ? { removeTags: words(value) } : null;
      default: return null;
    }
  }

  function apply() {
    const p = patch();
    if (!p) return setMsg({ text: "Choose a value first.", bad: true });
    start(async () => {
      const r = await bulkEditProducts(selected, p);
      if (!r.ok) return setMsg({ text: r.error ?? "Could not save.", bad: true });
      window.location.reload(); // the list below holds its own copy, so load the saved values
    });
  }

  const allShown = shown.length > 0 && shown.every((id) => selected.includes(id));
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
      <button type="button" className="text-navy underline" onClick={() => onSelect(allShown ? [] : shown)}>{allShown ? "Clear selection" : `Select all ${shown.length} shown`}</button>
      {selected.length > 0 && (
        <>
          <span className="font-medium">{selected.length} selected</span>
          <select aria-label="Bulk change" className={sel} value={kind} onChange={(e) => { setKind(e.target.value as Kind); setValue(""); setMsg(null); }}>
            <option value="">Choose a change…</option>
            {options.filter(([, , ok]) => ok).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          {kind === "availability" && <select aria-label="Availability" className={sel} value={value} onChange={(e) => setValue(e.target.value)}><option value="">Choose</option>{["Available", "Limited", "Unavailable", "Pre-order"].map((a) => <option key={a}>{a}</option>)}</select>}
          {kind === "status" && <select aria-label="Status" className={sel} value={value} onChange={(e) => setValue(e.target.value)}><option value="">Choose</option><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select>}
          {kind === "category" && <select aria-label="Category" className={sel} value={value} onChange={(e) => setValue(e.target.value)}><option value="">Choose</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          {(kind === "price" || kind === "pct" || kind === "lead") && <input aria-label="Value" type="number" className={`${sel} w-28`} placeholder={kind === "pct" ? "10 or -10" : kind === "lead" ? "Days" : "GHS"} value={value} onChange={(e) => setValue(e.target.value)} />}
          {(kind === "addTags" || kind === "removeTags") && <input aria-label="Tags" className={sel} placeholder="Comma separated" value={value} onChange={(e) => setValue(e.target.value)} />}
          {kind && <button type="button" disabled={pending} className="btn-primary !min-h-9 !px-3 text-sm" onClick={apply}>{pending ? "Saving…" : `Apply to ${selected.length}`}</button>}
        </>
      )}
      {msg && <span role={msg.bad ? "alert" : "status"} className={msg.bad ? "text-error" : "text-success"}>{msg.text}</span>}
    </div>
  );
}

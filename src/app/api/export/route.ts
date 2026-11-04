import { getStaffState } from "@/lib/auth";
import { buildDataset, exportKinds, kindLabels, type ExportKind, type Filters } from "@/lib/export/datasets";
import { formatInfo, renderFile, type Format } from "@/lib/export/formats";
import { can } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Exports (PRD FR-DATA-005 to 007). The database decides whether the person may export this kind and format and opens a
 * job; the file is built from rows their own session can read, stored privately in their folder, logged with the row count
 * and filters, and offered through a link that stops working after 24 hours.
 *
 * POST {kind, format, filters} → { url, rows }. GET ?kind=&format= runs the same and redirects to the file.
 */
async function run(kind: string, format: string, filters: Filters) {
  if (!isSupabaseConfigured) return { status: 503, error: "Connect Supabase first" } as const;
  const state = await getStaffState();
  if (state.status !== "ok") return { status: 401, error: "Sign in first" } as const;
  if (!can(state.staff.permissions, "exports", "export")) return { status: 403, error: "You cannot export data" } as const;
  if (!exportKinds.includes(kind as ExportKind) || !(format in formatInfo)) return { status: 400, error: "Choose what to export and a format" } as const;

  const supabase = await createClient();
  const { data: jobId, error: startError } = await supabase.rpc("start_export", { p_kind: kind, p_format: format, p_filters: filters });
  if (startError || !jobId) return { status: 403, error: startError?.message ?? "That export is not allowed" } as const;

  try {
    const ds = await buildDataset(supabase, kind as ExportKind, filters);
    const sub = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ") || "All records you can see";
    const file = await renderFile(format as Format, ds.title, sub, ds.columns, ds.rows);
    const path = `${state.staff.id}/${jobId}.${formatInfo[format as Format].ext}`;
    const up = await supabase.storage.from("exports").upload(path, file, { contentType: formatInfo[format as Format].type, upsert: false });
    if (up.error) throw new Error("Could not store the file");
    const { error: finishError } = await supabase.rpc("finish_export", { p_job: jobId, p_rows: ds.rows.length, p_path: path });
    if (finishError) throw new Error(finishError.message);
    const date = new Date().toISOString().slice(0, 10);
    const signed = await supabase.storage.from("exports").createSignedUrl(path, 60 * 60 * 24, { download: `drezzy-${kind}-${date}.${formatInfo[format as Format].ext}` });
    if (signed.error || !signed.data) throw new Error("Could not create the link");
    return { status: 200, url: signed.data.signedUrl, rows: ds.rows.length, label: kindLabels[kind as ExportKind] } as const;
  } catch (e) {
    await supabase.rpc("finish_export", { p_job: jobId, p_rows: 0, p_path: null, p_error: e instanceof Error ? e.message : "failed" });
    return { status: 500, error: "You cannot export that, or something went wrong" } as const;
  }
}

const filtersFrom = (o: Record<string, unknown>): Filters => {
  const keep = ["from", "to", "status", "region", "channel", "q", "month", "tag", "source"] as const;
  const f: Filters = {};
  for (const k of keep) if (typeof o[k] === "string" && (o[k] as string).length <= 60) f[k] = o[k] as string;
  return f;
};

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const r = await run(String(body.kind ?? ""), String(body.format ?? "csv"), filtersFrom((body.filters as Record<string, unknown>) ?? {}));
  return "error" in r ? Response.json({ error: r.error }, { status: r.status }) : Response.json({ url: r.url, rows: r.rows });
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const r = await run(p.get("kind") ?? "", p.get("format") ?? "csv", filtersFrom(Object.fromEntries(p.entries())));
  return "error" in r ? new Response(r.error, { status: r.status }) : Response.redirect(r.url, 303);
}

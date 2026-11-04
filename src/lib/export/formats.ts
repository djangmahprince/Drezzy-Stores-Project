import "server-only";
import writeXlsxFile from "write-excel-file/node";
import { toCsv, type Column } from "@/lib/export/csv";
import { tablePdf } from "@/lib/pdf/docs";

type Row = Record<string, unknown>;
export type Format = "csv" | "xlsx" | "pdf" | "json";
export const formatInfo: Record<Format, { type: string; ext: string; label: string }> = {
  csv: { type: "text/csv; charset=utf-8", ext: "csv", label: "CSV" },
  xlsx: { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx", label: "Excel" },
  pdf: { type: "application/pdf", ext: "pdf", label: "PDF" },
  json: { type: "application/json", ext: "json", label: "JSON" },
};

/** A spreadsheet cell: text that starts like a formula is stored as text with an apostrophe, the same rule as CSV. */
const xcell = (v: string | number | boolean | null | undefined) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? { value: v, type: Number } : null;
  if (typeof v === "boolean") return { value: v ? "yes" : "no", type: String };
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return { value: s, type: String };
};

export async function renderFile(format: Format, title: string, sub: string, columns: Column<Row>[], rows: Row[]): Promise<Uint8Array> {
  if (format === "csv") return new TextEncoder().encode("﻿" + toCsv(rows, columns));
  if (format === "json") {
    const out = rows.map((r) => Object.fromEntries(columns.map((c) => [c.header, c.value(r) ?? null])));
    return new TextEncoder().encode(JSON.stringify({ title, filters: sub, exported_at: new Date().toISOString(), rows: out }, null, 2));
  }
  if (format === "xlsx") {
    const data = [
      columns.map((c) => ({ value: c.header, fontWeight: "bold" as const })),
      ...rows.map((r) => columns.map((c) => xcell(c.value(r)))),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buf = await writeXlsxFile(data as any, { columns: columns.map((c) => ({ width: Math.min(40, Math.max(10, c.header.length + 2)) })), sheet: title.slice(0, 31) }).toBuffer();
    return new Uint8Array(buf);
  }
  return tablePdf(title, sub, columns.map((c) => c.header), rows.map((r) => columns.map((c) => {
    const v = c.value(r);
    return typeof v === "boolean" ? (v ? "yes" : "no") : v;
  })));
}

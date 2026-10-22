// CSV for spreadsheets. Pure, no imports, so the export route and the tests share it.

export type Column<T> = { header: string; value: (row: T) => string | number | boolean | null | undefined };

/**
 * One cell. Quotes are doubled and the cell is wrapped when it contains a comma, quote or newline.
 * A text cell that starts with = + - @ (or a tab or return) would be run as a formula by Excel, so it gets a leading
 * apostrophe. That stops a customer who types "=HYPERLINK(...)" as their name from attacking whoever opens the file.
 * Numbers are written as they are, so a negative amount stays a number.
 */
export function cell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (typeof v === "number") s = Number.isFinite(v) ? String(v) : "";
  else {
    s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  }
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows to CSV text with a header line. The byte-order mark is added by the caller that sends the file. */
export function toCsv<T>(rows: T[], columns: Column<T>[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => cell(c.value(r))).join(","));
  return lines.join("\r\n") + "\r\n";
}

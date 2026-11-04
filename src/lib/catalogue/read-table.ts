import "server-only";
import { parseCsv } from "@/lib/catalogue/import";

/** Reads the first sheet of an .xlsx, or a .csv, into a table of strings. A string result is the error to show. */
export async function readTable(file: File): Promise<string[][] | string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsv(await file.text());
  if (name.endsWith(".xlsx")) {
    try {
      const { readSheet } = await import("read-excel-file/node");
      const data = await readSheet(Buffer.from(await file.arrayBuffer()), 1);
      return data.map((r) => r.map((c) => (c === null || c === undefined ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))));
    } catch {
      return "That does not look like a valid Excel (.xlsx) file. Try saving it again, or export it as CSV.";
    }
  }
  return "Upload a .xlsx or .csv file. Older .xls files should be saved as .xlsx first.";
}

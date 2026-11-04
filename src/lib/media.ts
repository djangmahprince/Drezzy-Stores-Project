// Public URLs for files in Supabase Storage. Shared by server and client code.
const base = process.env.NEXT_PUBLIC_SUPABASE_URL;

/** Public URL of a file in a public bucket (media, reviews). Full https URLs are returned unchanged. */
export function publicFile(bucket: "media" | "reviews", path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https:\/\//.test(path) || path.startsWith("/")) return path; // full URLs, and photos shipped with the site in /public
  return base ? `${base.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${path.replace(/^\/+/, "")}` : null;
}

/** A Ghana number as written ("050 131 5862") to the form wa.me wants ("233501315862"). */
export const waNumber = (display: string) => {
  const d = display.replace(/\D/g, "");
  return d.startsWith("233") ? d : d.startsWith("0") ? `233${d.slice(1)}` : d;
};

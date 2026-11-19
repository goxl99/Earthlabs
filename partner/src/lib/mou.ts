/** Partner fields a custom MOU template may use. Must match the list enforced in the database. */
export const MOU_FIELDS = ["partner_name", "partner_id", "contact_name", "district", "state", "gstin", "type_name", "date", "territory"] as const;
export type MouField = (typeof MOU_FIELDS)[number];

/** Parses lines like `{{NAME}} = partner_name` into a placeholder map. Returns an error text for the first bad line. */
export function parseFieldMap(text: string): { map: Record<string, MouField>; error?: string } {
  const map: Record<string, MouField> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim(); if (!line) continue;
    const i = line.indexOf("="); if (i < 1) return { map, error: `Line "${line}" must look like {{NAME}} = partner_name` };
    const key = line.slice(0, i).trim(); const val = line.slice(i + 1).trim();
    if (!key) return { map, error: `Missing placeholder in "${line}"` };
    if (!(MOU_FIELDS as readonly string[]).includes(val)) return { map, error: `Unknown field "${val}". Allowed: ${MOU_FIELDS.join(", ")}` };
    map[key] = val as MouField;
  }
  return { map };
}
const ALLOWED_EXT = ["docx", "pdf", "odt"];
export function templateFileOk(name: string, size: number): string | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXT.includes(ext)) return "Upload a .docx, .pdf or .odt file";
  if (size > 5 * 1024 * 1024) return "File must be under 5 MB";
  return null;
}
export const safeName = (n: string) => n.replace(/[^A-Za-z0-9._-]/g, "_");

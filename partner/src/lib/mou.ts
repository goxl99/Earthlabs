/** Partner fields a custom MOU template may use. Must match the list enforced in the database. */
export const MOU_FIELDS = ["partner_name", "partner_id", "contact_name", "district", "state", "gstin", "type_name", "date", "territory"] as const;
export type MouField = (typeof MOU_FIELDS)[number];
/** What each allowed field fills in, shown beside the template upload form. Same order and names as MOU_FIELDS. */
export const MOU_FIELD_HELP: [MouField, string][] = [
  ["partner_name", "The partner's registered business name"], ["partner_id", "The permanent Partner ID, for example ELP-DLR-0001"],
  ["contact_name", "The partner's contact person"], ["district", "The partner's district"], ["state", "The partner's state"],
  ["gstin", "GST number (blank if the partner has none)"], ["type_name", "Partner type, for example Authorized Dealer"],
  ["date", "The date the agreement is prepared, for example 25 November 2026"], ["territory", "The allocated territory (the district if none is allocated yet)"],
];

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

// ---- Filling a custom template with partner data (build 3) ----
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

export type MouValues = Record<MouField, string>;
export type PartnerForMou = { id: string; name: string; contact_name?: string | null; district: string; state: string; gstin?: string | null; type_name: string; territory?: string | null };

/** Values for every allowed field, taken from the partner record. Missing data becomes an empty string, never "undefined". */
export function mouValues(p: PartnerForMou, on: Date = new Date()): MouValues {
  return {
    partner_name: p.name, partner_id: p.id, contact_name: p.contact_name ?? "", district: p.district, state: p.state,
    gstin: p.gstin ?? "", type_name: p.type_name, territory: p.territory ?? p.district,
    date: on.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }),
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/**
 * Replaces placeholders in a Word document.xml. Word often splits one placeholder across several text runs,
 * so each paragraph's text is joined, replaced, and written back into the first run (other runs of the paragraph are emptied
 * only when a placeholder was found there; untouched paragraphs keep their formatting).
 */
export function fillDocXml(xml: string, map: Record<string, MouField>, values: MouValues): { xml: string; replaced: number } {
  let replaced = 0;
  const out = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (para) => {
    const runs = [...para.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)];
    if (!runs.length) return para;
    const joined = runs.map((m) => unesc(m[1])).join("");
    let text = joined; let hit = false;
    for (const [ph, field] of Object.entries(map)) { if (text.includes(ph)) { text = text.split(ph).join(values[field]); hit = true; replaced++; } }
    if (!hit) return para;
    let i = 0;
    return para.replace(/<w:t((?: [^>]*)?)>([\s\S]*?)<\/w:t>/g, (_m, attrs: string) => {
      const first = i++ === 0;
      return first ? `<w:t xml:space="preserve">${esc(text)}</w:t>` : `<w:t${attrs}></w:t>`;
    });
  });
  return { xml: out, replaced };
}

/** Fills a .docx template and returns the new file bytes. Only .docx can be filled automatically; PDF/ODT templates are sent as uploaded. */
export function fillDocx(bytes: Uint8Array, map: Record<string, MouField>, values: MouValues): { bytes: Uint8Array; replaced: number } {
  const files = unzipSync(bytes);
  const name = "word/document.xml";
  if (!files[name]) throw new Error("This is not a valid .docx file");
  const r = fillDocXml(strFromU8(files[name]), map, values);
  files[name] = strToU8(r.xml);
  return { bytes: zipSync(files), replaced: r.replaced };
}

/** Plain text of a Word (.docx) file, one blank line between paragraphs. Used to attach an agreement template and then fill its {{placeholders}}. */
export function docxToText(bytes: Uint8Array): string {
  const doc = unzipSync(bytes)["word/document.xml"];
  if (!doc) throw new Error("This does not look like a Word (.docx) file");
  const paras = [...strFromU8(doc).matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => [...m[0].matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map((t) => unesc(t[1])).join(""));
  return paras.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

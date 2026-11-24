/** Promise-based dialogs that replace the browser's prompt(), confirm() and alert().
 *  The visual part lives in components/DialogHost.tsx; this file holds the request queue and the field checks so they can be unit tested. */
export type FieldDef = {
  name: string; label: string; type?: "text" | "number" | "textarea" | "select" | "date";
  required?: boolean; value?: string | number; hint?: string; options?: string[]; min?: number; max?: number;
};
export type DialogReq =
  | { kind: "form"; title: string; intro?: string; fields: FieldDef[]; ok: string; danger?: boolean; cols?: 1 | 2; resolve: (v: Record<string, string> | null) => void }
  | { kind: "notice"; title: string; text: string; resolve: () => void };

type Listener = (r: DialogReq) => void;
let listener: Listener | null = null;
const pending: DialogReq[] = [];
export function subscribe(l: Listener) { listener = l; while (pending.length) l(pending.shift()!); return () => { if (listener === l) listener = null; }; }
function push(r: DialogReq) { if (listener) listener(r); else pending.push(r); }

/** Returns the checked values, or an error text for the first wrong field. */
export function checkFields(fields: FieldDef[], values: Record<string, string>): string | null {
  for (const f of fields) {
    const v = (values[f.name] ?? "").trim();
    if (f.required && !v) return `${f.label} is required`;
    if (v && f.type === "number") {
      const n = Number(v);
      if (!Number.isFinite(n)) return `${f.label} must be a number`;
      if (f.min != null && n < f.min) return `${f.label} must be at least ${f.min}`;
      if (f.max != null && n > f.max) return `${f.label} must be at most ${f.max}`;
    }
  }
  return null;
}
/** A form in a modal. Resolves to the values (all strings) or null when cancelled. */
export const askForm = (title: string, fields: FieldDef[], opts: { ok?: string; intro?: string; danger?: boolean; cols?: 1 | 2 } = {}) =>
  new Promise<Record<string, string> | null>((resolve) => push({ kind: "form", title, intro: opts.intro, fields, ok: opts.ok ?? "Save", danger: opts.danger, cols: opts.cols, resolve }));
/** Yes / no question. */
export const askConfirm = async (title: string, text: string, ok = "Confirm", danger = false) =>
  (await askForm(title, [], { ok, intro: text, danger })) !== null;
/** One reason box, required. Resolves to the reason or null. */
export const askReason = async (title: string, label = "Reason", ok = "Submit", danger = false) =>
  (await askForm(title, [{ name: "why", label, type: "textarea", required: true }], { ok, danger }))?.why.trim() ?? null;
export const notify = (title: string, text: string) => new Promise<void>((resolve) => push({ kind: "notice", title, text, resolve }));

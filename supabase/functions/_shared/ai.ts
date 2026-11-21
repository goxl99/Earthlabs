// Pure helpers for the AI recommendation function. No network, no secrets: unit-tested from partner/tests.
// Rule: the model only ever RECOMMENDS. Everything it returns is validated against the facts we sent, and stored as Pending.
export type Facts = {
  ladder: { n: string; limit: number; days: number; min: number }[];
  raw_materials: { id: string; unit: string; on_hand: number; reorder: number; per_day: number; lead_days: number; vendor_active: boolean; incoming: number; avg_actual_days: number | null }[];
  partners: { id: string; credit_level: number; balance: number; orders_90d: number }[];
  vendors: { id: string; credit_level: number; received_orders: number }[];
  pay_and_carry?: { enabled?: boolean };
};
export type Rec = { kind: "reorder" | "lead_time" | "credit" | "scheme" | "promotion"; title: string; reasons: string[]; target_kind?: string; target_id?: string; payload?: Record<string, unknown> };

export const SYSTEM_PROMPT = `You are the analytics assistant for EarthLabs' partner and procurement system.
You RECOMMEND only. Management approves every action; you never approve, change or send anything.
You receive anonymous facts (ids and numbers). Reply with ONLY a JSON array (no prose, no code fences) of at most 12 items:
{"kind":"reorder"|"lead_time"|"credit"|"scheme"|"promotion","title":string,"reasons":[string,...],"target_kind":"raw_material"|"partner"|"vendor","target_id":string,"payload":object}
- reorder: payload {"qty":number}. Only for a raw material whose on_hand plus incoming is below its reorder level or whose cover (on_hand / per_day) is shorter than lead_days, and whose vendor_active is true.
- lead_time: payload {"lead_days":integer}. Only when avg_actual_days is higher than lead_days.
- credit: payload {"to_level":integer}. Move exactly one step up the ladder, only when balance is not positive (no money owed) and orders_90d >= 3 for a partner, or received_orders >= 3 for a vendor.
- scheme / promotion: general suggestions, no payload needed.
Give two to four short, factual reasons using the numbers you were given. Never invent ids or numbers.`;

export function buildUserPrompt(facts: Facts): string { return "Facts:\n" + JSON.stringify(facts); }

const pos = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/** Extracts the JSON array from the model reply and keeps only items that are valid against the facts. */
export function parseRecommendations(text: string, facts: Facts): { recs: Rec[]; dropped: number } {
  const m = text.match(/\[[\s\S]*\]/);
  let raw: unknown[] = [];
  try { raw = m ? JSON.parse(m[0]) : []; } catch { raw = []; }
  if (!Array.isArray(raw)) raw = [];
  const recs: Rec[] = []; let dropped = 0;
  const seen = new Set<string>();
  for (const r of raw.slice(0, 12) as Record<string, unknown>[]) {
    const ok = validate(r, facts);
    const key = ok ? `${ok.kind}|${ok.target_kind ?? ""}|${ok.target_id ?? ""}` : "";
    if (!ok || (ok.target_id && seen.has(key))) { dropped++; continue; }
    seen.add(key); recs.push(ok);
  }
  return { recs, dropped };
}

function validate(r: Record<string, unknown>, f: Facts): Rec | null {
  if (!r || typeof r !== "object") return null;
  const kind = r.kind, title = typeof r.title === "string" ? r.title.trim().slice(0, 200) : "";
  const reasons = Array.isArray(r.reasons) ? (r.reasons as unknown[]).filter((x) => typeof x === "string").map((x) => (x as string).slice(0, 300)).slice(0, 6) : [];
  if (!title || reasons.length === 0) return null;
  const tid = typeof r.target_id === "string" ? r.target_id : "";
  const p = (r.payload && typeof r.payload === "object" ? r.payload : {}) as Record<string, unknown>;
  switch (kind) {
    case "reorder": {
      const m = f.raw_materials.find((x) => x.id === tid);
      if (!m || !m.vendor_active || !pos(p.qty)) return null;
      if (p.qty > Math.max(m.reorder, 1) * 10) return null;           // sanity cap
      return { kind, title, reasons, target_kind: "raw_material", target_id: tid, payload: { qty: Math.round(p.qty * 1000) / 1000 } };
    }
    case "lead_time": {
      const m = f.raw_materials.find((x) => x.id === tid);
      const d = p.lead_days;
      if (!m || m.avg_actual_days == null || typeof d !== "number" || !Number.isInteger(d) || d <= m.lead_days || d > 90) return null;
      return { kind, title, reasons, target_kind: "raw_material", target_id: tid, payload: { lead_days: d } };
    }
    case "credit": {
      const tk = r.target_kind;
      const e = tk === "partner" ? f.partners.find((x) => x.id === tid) : tk === "vendor" ? f.vendors.find((x) => x.id === tid) : undefined;
      const to = p.to_level;
      if (!e || typeof to !== "number" || !Number.isInteger(to) || to !== e.credit_level + 1 || to >= f.ladder.length) return null;
      return { kind, title, reasons, target_kind: tk as string, target_id: tid, payload: { to_level: to } };
    }
    case "scheme": case "promotion": return { kind, title, reasons };
    default: return null;
  }
}

/** Pure helpers for the Performance Matrix and reports. The database computes and enforces everything;
 *  these mirror its rules so the screens can preview a score and so the rules are unit-tested. */
export type Weight = { n: string; w: number };
export type Rule = { n: string; next: string; promote: number; hold: number; q: number; items: { n: string; w: number; lo: number; hi: number; min: number }[] };

export const BANDS: [number, string][] = [[90, "Outstanding"], [80, "Excellent"], [70, "Good"], [60, "Needs Improvement"], [0, "Underperforming"]];
export const bandOf = (s: number | null) => (s == null ? null : BANDS.find(([m]) => s >= m)![1]);

/** Score = points earned / verified weight x 100. Unverified (null) items are left out, never counted as zero. */
export function computeScore(params: (number | null)[], weights: Weight[]): { score: number | null; verified: number } {
  let sw = 0, sv = 0;
  weights.forEach((x, i) => { const v = params[i]; if (v == null) return; sw += x.w; sv += x.w * v; });
  return { score: sw > 0 ? Math.round((sv / sw) * 1000) / 10 : null, verified: sw };
}

export type Direction = "Improving" | "Consistent" | "Declining" | "At risk" | "Inactive" | "Suspended";
export function direction(status: string, score: number | null, prev: number | null): Direction {
  if (status === "Suspended") return "Suspended";
  if (score == null) return "Inactive";
  if (score < 60) return "At risk";
  if (prev == null) return "Consistent";
  const d = score - prev;
  return d >= 2 ? "Improving" : d <= -2 ? "Declining" : "Consistent";
}

export type Assessment = { weighted: number | null; gates: boolean; state: string };
/** One promotion step for a set of actual values. Mirrors assess_promotion(); quartersInARow counts this quarter. */
export function assess(rule: Rule, actuals: (number | null)[], quartersInARow: number): Assessment {
  let tot = 0, known = 0, gates = true;
  rule.items.forEach((it, i) => {
    const a = actuals[i]; if (a == null) return;
    const s = it.hi === it.lo ? 1 : Math.max(0, Math.min(1, (a - it.lo) / (it.hi - it.lo)));
    tot += it.w * s; known += it.w; if (s < it.min) gates = false;
  });
  const weighted = known > 0 ? Math.round((tot / known) * 10000) / 10000 : null;
  const q = weighted != null && weighted >= rule.promote && gates ? quartersInARow : 0;
  let state: string;
  if (weighted == null) state = "Not enough data";
  else if (weighted >= rule.promote && gates && q >= rule.q) state = "Eligible for assessment";
  else if (weighted >= rule.promote && gates) state = `Hold – needs ${rule.q - q} more quarter(s) at the promote score`;
  else if (weighted >= rule.hold) state = "Hold and develop";
  else state = "Corrective plan";
  return { weighted, gates, state };
}

/** Quarter label for a date, e.g. 2026-Q4. */
export const quarterOf = (d: Date) => `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;

/** CSV for a report: quotes and doubled quotes, one header row from the first row's keys, leading =+-@ neutralised against formula injection. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    let s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
}

/** Badge colour per band, as in the prototype (SCORE_BANDS). */
export const bandKind = (band: string | null): "good" | "info" | "warn" | "crit" | "mute" =>
  band === "Outstanding" || band === "Excellent" ? "good" : band === "Good" ? "info" : band === "Needs Improvement" ? "warn" : band === "Underperforming" ? "crit" : "mute";

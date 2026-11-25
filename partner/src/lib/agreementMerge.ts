// Merging a contract's special terms into the Dealer Agreement.
// The AI only PROPOSES: new clauses for a "Schedule C" and, where a special term truly changes a standard clause, an exact-wording amendment.
// This file checks every proposal and applies it with plain code, so the standard wording is never rewritten by the AI, and staff review before anything is saved.

export type SpecialClause = { title: string; text: string };
export type Amendment = { clause: string; find: string; replace: string; why: string };
export type MergeProposal = { clauses: SpecialClause[]; amendments: Amendment[]; warnings: string[] };
export type Skipped = { amendment: Amendment; reason: string };

export const SPECIAL_HEADING = "### Schedule C — Special Terms and Conditions";
export const MAX_SPECIAL = 4000;
const PRECEDENCE = "**C.1 Precedence.** The Special Terms in this Schedule apply to this Dealer only. If a Special Term conflicts with a standard clause of this Agreement, the Special Term prevails for this Dealer only, and every other clause continues to apply.";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Checks the AI's answer. Anything malformed is dropped; nothing from it is trusted as-is. */
export function parseProposal(raw: unknown): MergeProposal {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const clauses = arr(o.clauses).map((c) => ({ title: str((c as SpecialClause)?.title, 120), text: str((c as SpecialClause)?.text, 1800) })).filter((c) => c.title && c.text).slice(0, 12);
  const amendments = arr(o.amendments).map((a) => { const x = a as Amendment; return { clause: str(x?.clause, 20), find: str(x?.find, 1500), replace: str(x?.replace, 1800), why: str(x?.why, 300) }; }).filter((a) => a.find && a.replace && a.find !== a.replace).slice(0, 10);
  const warnings = arr(o.warnings).map((w) => str(w, 400)).filter(Boolean).slice(0, 8);
  return { clauses, amendments, warnings };
}

/** Pulls the JSON object out of a model reply, which may be wrapped in a code fence or a sentence. */
export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

const occurrences = (hay: string, needle: string) => { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; };

/** Removes an earlier Schedule C so merging again replaces it instead of piling up. */
export function stripSpecial(body: string): string {
  const i = body.indexOf(SPECIAL_HEADING); if (i < 0) return body;
  const rest = body.slice(i + SPECIAL_HEADING.length), j = rest.search(/\n#{2,3} /);
  return (body.slice(0, i).replace(/\s+$/, "") + (j >= 0 ? "\n\n" + rest.slice(j).replace(/^\n+/, "") : "")).replace(/\s+$/, "") + "\n";
}

/** Applies a proposal to the agreement text. Amendments need the quoted wording to appear exactly once; the rest are reported, not guessed at. */
export function applyProposal(body: string, p: MergeProposal): { text: string; applied: Amendment[]; skipped: Skipped[] } {
  let text = stripSpecial(body); const applied: Amendment[] = [], skipped: Skipped[] = [];
  for (const a of p.amendments) {
    const n = occurrences(text, a.find);
    if (a.find.length < 12) skipped.push({ amendment: a, reason: "The quoted wording is too short to pin down" });
    else if (n === 0) skipped.push({ amendment: a, reason: "The quoted wording is not in the agreement (it may have changed)" });
    else if (n > 1) skipped.push({ amendment: a, reason: "The quoted wording appears more than once" });
    else { text = text.replace(a.find, () => a.replace); applied.push(a); }
  }
  if (p.clauses.length) {
    const lines = p.clauses.map((c, i) => `**C.${i + 2} ${c.title}.** ${c.text}`);
    text = text.replace(/\s+$/, "") + `\n\n${SPECIAL_HEADING}\n\n${PRECEDENCE}\n\n${lines.join("\n\n")}\n`;
  }
  return { text, applied, skipped };
}

/** The special-terms layer stored with the agreement: the staff's own words and the proposal they approved. */
export function readStored(v: Record<string, string>): MergeProposal | null {
  const s = v.special_proposal; if (!s) return null;
  try { return parseProposal(JSON.parse(s)); } catch { return null; }
}

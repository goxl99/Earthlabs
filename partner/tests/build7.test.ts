import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { computeScore, bandOf, direction, assess, quarterOf, toCsv, type Rule, type Weight } from "../src/lib/performance";
import { navFor } from "../src/lib/roles";

const W: Weight[] = [25, 15, 15, 15, 10, 10, 5, 5].map((w, i) => ({ n: "P" + i, w }));
const dealer: Rule = { n: "Dealer to Distributor", next: "DST", promote: 0.8, hold: 0.6, q: 2, items: [
  { n: "Volume", w: 0.3, lo: 60, hi: 100, min: 0.5 }, { n: "Growth", w: 0.15, lo: 0, hi: 10, min: 0 }, { n: "On-time", w: 0.2, lo: 70, hi: 100, min: 0.75 },
  { n: "Outlets", w: 0.2, lo: 50, hi: 90, min: 0.4 }, { n: "Compliance", w: 0.15, lo: 0, hi: 1, min: 0.6 }] };

describe("monthly score", () => {
  it("weights add to 100 and a full-marks month scores 100", () => {
    expect(W.reduce((a, x) => a + x.w, 0)).toBe(100);
    expect(computeScore(Array(8).fill(1), W)).toEqual({ score: 100, verified: 100 });
  });
  it("leaves unverified items out; it never counts them as zero", () => {
    expect(computeScore([0.8, null, null, null, null, null, null, null], W)).toEqual({ score: 80, verified: 25 });
    expect(computeScore(Array(8).fill(null), W).score).toBeNull();
  });
  it("bands follow 90/80/70/60", () => {
    expect([95, 90, 89.9, 80, 70, 60, 59.9].map(bandOf)).toEqual(["Outstanding", "Outstanding", "Excellent", "Excellent", "Good", "Needs Improvement", "Underperforming"]);
    expect(bandOf(null)).toBeNull();
  });
  it("direction: 2 points up or down moves it, below 60 is at risk, no score is inactive", () => {
    expect(direction("Active", 82, 78)).toBe("Improving");
    expect(direction("Active", 76, 80)).toBe("Declining");
    expect(direction("Active", 80, 79)).toBe("Consistent");
    expect(direction("Active", 55, 80)).toBe("At risk");
    expect(direction("Active", null, 80)).toBe("Inactive");
    expect(direction("Suspended", 90, 80)).toBe("Suspended");
  });
});

describe("promotion assessment", () => {
  it("full marks for one quarter is a hold; two in a row is eligible for management", () => {
    expect(assess(dealer, [100, 10, 100, 90, 1], 1).state).toMatch(/^Hold – needs 1 more quarter/);
    expect(assess(dealer, [100, 10, 100, 90, 1], 2).state).toBe("Eligible for assessment");
  });
  it("a failed minimum cannot be bought with other scores", () => {
    const r = assess(dealer, [100, 10, 70, 90, 1], 5);   // on-time payment at its floor scores 0, below its 0.75 gate
    expect(r.gates).toBe(false); expect(r.weighted).toBeGreaterThanOrEqual(0.8); expect(r.state).toBe("Hold and develop");
  });
  it("no data is not a pass, and a weak quarter is a corrective plan", () => {
    expect(assess(dealer, [null, null, null, null, null], 3).state).toBe("Not enough data");
    expect(assess(dealer, [60, 0, 70, 50, 0], 0).state).toBe("Corrective plan");
  });
  it("labels the quarter", () => { expect(quarterOf(new Date(2026, 10, 21))).toBe("2026-Q4"); expect(quarterOf(new Date(2026, 0, 1))).toBe("2026-Q1"); });
});

describe("CSV export", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(toCsv([{ A: "x,y", B: 'say "hi"', C: "l1\nl2" }])).toBe('A,B,C\n"x,y","say ""hi""","l1\nl2"');
  });
  it("neutralises spreadsheet formulas but keeps negative numbers", () => {
    expect(toCsv([{ A: "=HYPERLINK(\"x\")", B: "-5", C: "+91 98" }]).split("\n")[1]).toBe("\"'=HYPERLINK(\"\"x\"\")\",-5,'+91 98");
  });
  it("an empty report is an empty file", () => { expect(toCsv([])).toBe(""); });
});

describe("who sees the new screens", () => {
  it("performance for partners and the staff who score; reports for staff only", () => {
    expect(navFor("dealer").map((n) => n.href)).toContain("/performance/");
    expect(navFor("distributor").map((n) => n.href)).toContain("/performance/");
    expect(navFor("warehouse").map((n) => n.href)).not.toContain("/performance/");
    expect(navFor("vendor").map((n) => n.href)).not.toContain("/performance/");
    for (const r of ["dealer", "distributor", "vendor"] as const) expect(navFor(r).map((n) => n.href)).not.toContain("/reports/");
    for (const r of ["super_admin", "sales", "accounts", "warehouse"] as const) expect(navFor(r).map((n) => n.href)).toContain("/reports/");
  });
  it("the migration keeps the policy rules in the database, with no secrets", () => {
    const sql = readFileSync(new URL("../../supabase/migrations/20261121000012_performance_matrix_reports.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/Score weights must total 100/); expect(sql).toMatch(/Only Super Admin can decide a promotion/);
    expect(sql).not.toMatch(/sk-ant|service_role|eyJ[A-Za-z0-9_-]{20,}/);
  });
});

import { describe, it, expect } from "vitest";
import { reviewApplication, joinEval, type AppRow, type PartnerLite } from "../src/lib/appreview";

const base: AppRow = { id: "1", type_code: "DLR", business_name: "Mahadev Traders", contact_name: "Kiran", district: "Mehsana", gstin: null, status: "Management Review", answers: { experience_years: "6", outlets: "20", products: "soap and home care", wc: "2", team: "Yes", potential: "4", area: "Mehsana" }, reg_verified: true, reputation: 0.7 };
const P = (o: Partial<PartnerLite>): PartnerLite => ({ id: "ELP-DLR-0001", name: "Shree Traders", type_code: "DLR", status: "Active", district: "Anand", exclusive: false, ...o });

describe("application review", () => {
  it("scores only verified items and never counts unverified as zero", () => {
    const j = joinEval([15, 2, null, null, null]);
    expect(j.rows[2].score).toBeNull();
    expect(j.weighted).toBeCloseTo((0.35 * 0.5 + 0.2 * 0.5) / 0.55, 5);
  });
  it("flags unverified registration as a critical risk", () => {
    const r = reviewApplication({ ...base, reg_verified: false }, [], []);
    expect(r.crit).toBe(true);
    expect(r.summary).toMatch(/do not approve/);
  });
  it("recommends moving ahead when everything is answered and clean", () => {
    const r = reviewApplication(base, [], []);
    expect(r.crit).toBe(false);
    expect(r.comp).toBe(100);
    expect(r.summary).toMatch(/proceed to management review/);
  });
  it("reads the answer keys the current public form already uses", () => {
    const r = reviewApplication({ ...base, answers: { experience_years: "3", area_of_operation: "Patan" } }, [], []);
    expect(r.unanswered).not.toContain("Years of business experience");
    expect(r.unanswered).toContain("Retail outlets currently served");
  });
  it("blocks on an exclusive holder in the same district and warns on overlapping applicants", () => {
    const r = reviewApplication(base, [{ ...base, id: "2", business_name: "Rival Co" }], [P({ district: "Mehsana", exclusive: true })]);
    expect(r.risks.some((x) => x[0] === "crit" && /exclusive rights in Mehsana/.test(x[1]))).toBe(true);
    expect(r.risks.some((x) => /Rival Co/.test(x[1]))).toBe(true);
  });
  it("starts a distributor with a small network as a dealer, and a big one as distributor", () => {
    const d = { ...base, type_code: "DST", answers: { outlets: "40", wc: "1.5", dealers: "3" } };
    expect(reviewApplication(d, [], []).defCat).toBe("DLR");
    expect(reviewApplication({ ...d, answers: { outlets: "200", wc: "2.5", dealers: "12" } }, [], []).defCat).toBe("DST");
  });
  it("reports missing documents only once documents are tracked", () => {
    expect(reviewApplication(base, [], []).miss).toEqual([]);
    const r = reviewApplication({ ...base, answers: { ...base.answers, _docs: { "PAN card": true } } }, [], []);
    expect(r.miss.length).toBe(4);
    expect(r.comp).toBeLessThan(100);
  });
});

import { describe, it, expect } from "vitest";
import { splitGst, creditNoteParts, balanceText, canSubmitProof, canReviewProof } from "../src/lib/money";

describe("GST split", () => {
  it("splits inside the company state into CGST and SGST that add back to the GST", () => {
    const s = splitGst(100.01, "Gujarat");
    expect(s.igst).toBe(0);
    expect(s.cgst + s.sgst).toBeCloseTo(100.01, 2);
    expect(Math.abs(s.cgst - s.sgst)).toBeLessThanOrEqual(0.01);
  });
  it("uses IGST outside the state and ignores case and spaces", () => {
    expect(splitGst(90, "Maharashtra")).toEqual({ cgst: 0, sgst: 0, igst: 90 });
    expect(splitGst(90, " GUJARAT ").igst).toBe(0);
  });
});
describe("credit note parts", () => {
  it("keeps taxable and GST in the invoice proportion and adds back to the amount", () => {
    const p = creditNoteParts(118, 1000, 1180, "Gujarat");
    expect(p.taxable).toBe(100);
    expect(p.cgst + p.sgst + p.igst + p.taxable).toBeCloseTo(118, 2);
    expect(creditNoteParts(59, 1000, 1180, "Kerala").igst).toBe(9);
  });
});
describe("ledger text and proof rules", () => {
  it("describes who owes whom", () => {
    expect(balanceText(1500)).toContain("to pay");
    expect(balanceText(-20)).toContain("in credit");
    expect(balanceText(0)).toBe("Nothing due");
  });
  it("only partners report payment, only on an approved order; only Accounts and Super Admin review", () => {
    expect(canSubmitProof("dealer", "Approved")).toBe(true);
    expect(canSubmitProof("dealer", "Payment Confirmed")).toBe(false);
    expect(canSubmitProof("sales", "Approved")).toBe(false);
    expect(canReviewProof("accounts")).toBe(true);
    expect(canReviewProof("warehouse")).toBe(false);
  });
});

import { changedFields } from "../src/lib/audit";
describe("audit viewer", () => {
  it("lists only the fields that changed", () => {
    expect(changedFields({ id: "A", status: "Approved", total: 1 }, { id: "A", status: "Dispatched", total: 1 })).toEqual(["status"]);
    expect(changedFields(null, { id: "A" })).toEqual(["id"]);
  });
});

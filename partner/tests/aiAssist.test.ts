import { describe, it, expect } from "vitest";
import { QUESTIONS, heading, cell, canRaise } from "@/lib/aiAssist";
describe("AI assistant helpers", () => {
  it("offers the five walkthrough questions", () => { expect(QUESTIONS.map((q) => q.key)).toEqual(["reorder", "delay", "credit", "scheme", "paycarry"]); });
  it("makes readable headings", () => { expect(heading("avg_days_taken")).toBe("Avg days taken"); });
  it("shows a dash for empty cells and keeps numbers", () => { expect(cell(null)).toBe("–"); expect(cell(0)).toBe("0"); expect(cell("RM-01")).toBe("RM-01"); });
  it("only warehouse and super admin can raise a release order from the reorder answer", () => {
    expect(canRaise("reorder", "warehouse")).toBe(true); expect(canRaise("reorder", "super_admin")).toBe(true);
    expect(canRaise("reorder", "sales")).toBe(false); expect(canRaise("reorder", "accounts")).toBe(false); expect(canRaise("delay", "super_admin")).toBe(false);
  });
});

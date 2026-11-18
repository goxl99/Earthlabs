import { describe, it, expect } from "vitest";
import { unitPrice, leadDays } from "../src/lib/pricing";
import { navFor } from "../src/lib/roles";
describe("pricing", () => {
  it("matches the database formula", () => { expect(unitPrice(149, 20)).toBeCloseTo(101.0169, 3); });
  it("adds make-to-order days only when stock is short", () => {
    const o = { confirm: 1, dispatch: 1, make: 7, transit: 2 };
    expect(leadDays(o, 0)).toBe(4); expect(leadDays(o, 10)).toBe(11);
  });
});
describe("navigation", () => {
  it("hides admin screens from partners", () => {
    expect(navFor("dealer").map((n) => n.label)).not.toContain("Approvals");
    expect(navFor("super_admin").map((n) => n.label)).toContain("Approvals");
  });
});

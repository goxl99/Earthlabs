import { describe, it, expect } from "vitest";
import { checkStaffInput, STAFF_ROLES } from "../../supabase/functions/_shared/staffUser";
import { STAFF_ROLES as UI_ROLES } from "../src/lib/staffRoles";
describe("create staff user", () => {
  const ok = { email: " Ravi@EarthLabs.com ", full_name: " Ravi Shah ", role: "sales", department: "Sales", territory: " " };
  it("normalises a valid request", () => { expect(checkStaffInput(ok)).toEqual({ ok: true, v: { email: "ravi@earthlabs.com", full_name: "Ravi Shah", role: "sales", department: "Sales", territory: null } }); });
  it("refuses partner and vendor roles and unknown roles", () => { for (const r of ["dealer", "distributor", "vendor", "root", ""]) expect(checkStaffInput({ ...ok, role: r }).ok).toBe(false); });
  it("refuses a bad e-mail or a missing name", () => { expect(checkStaffInput({ ...ok, email: "nope" }).ok).toBe(false); expect(checkStaffInput({ ...ok, full_name: "R" }).ok).toBe(false); });
  it("keeps the screen and the function on the same role list", () => { expect([...UI_ROLES]).toEqual([...STAFF_ROLES]); });
});

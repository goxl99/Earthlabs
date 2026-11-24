import { describe, it, expect } from "vitest";
import { checkLeadTime, checkPayCarry, aimedAt, visibleToPartner, type Scheme } from "../src/lib/policies";
import { PRICING_TABS } from "../src/lib/pricingTabs";
const lt = { confirm: 1, dispatch: 1, make: 7, transit_in: 2, transit_out: 5, show: true };
const sch = (o: Partial<Scheme> = {}): Scheme => ({ id: "S1", name: "S", active: true, disclosed: true, audience_mode: "all", audience_types: [], audience_partners: [], valid_from: "2026-11-01", valid_to: "2026-12-31", ...o });
describe("policies", () => {
  it("accepts the seeded lead times and rejects bad ones", () => { expect(checkLeadTime(lt)).toBeNull(); expect(checkLeadTime({ ...lt, make: -1 })).toMatch(/Make-to-order/); expect(checkLeadTime({ ...lt, dispatch: 1.5 })).toMatch(/Dispatch/); expect(checkLeadTime({ ...lt, transit_out: NaN })).toMatch(/outside/); });
  it("limits the advance to 1..100", () => { expect(checkPayCarry({ enabled: true, advance_pct: 100 })).toBeNull(); expect(checkPayCarry({ enabled: true, advance_pct: 0 })).toBeTruthy(); expect(checkPayCarry({ enabled: true, advance_pct: 101 })).toBeTruthy(); });
  it("targets schemes by audience", () => {
    expect(aimedAt(sch(), "ELP-DLR-1", "DLR")).toBe(true);
    expect(aimedAt(sch({ audience_mode: "types", audience_types: ["DST"] }), "ELP-DLR-1", "DLR")).toBe(false);
    expect(aimedAt(sch({ audience_mode: "types", audience_types: ["DLR"] }), "ELP-DLR-1", "DLR")).toBe(true);
    expect(aimedAt(sch({ audience_mode: "partners", audience_partners: ["ELP-DLR-1"] }), "ELP-DLR-1", "DLR")).toBe(true);
    expect(aimedAt(sch({ audience_mode: "partners", audience_partners: ["ELP-DLR-2"] }), "ELP-DLR-1", "DLR")).toBe(false);
  });
  it("tells whether a partner can see a scheme today", () => {
    const t = "2026-11-24";
    expect(visibleToPartner(sch(), t)).toBe("Visible"); expect(visibleToPartner(sch({ disclosed: false }), t)).toBe("Hidden"); expect(visibleToPartner(sch({ active: false }), t)).toBe("Inactive");
    expect(visibleToPartner(sch({ valid_to: "2026-11-01" }), t)).toBe("Expired"); expect(visibleToPartner(sch({ valid_from: "2026-12-01" }), t)).toBe("Not started");
  });
  it("lists the eight walkthrough tabs", () => { expect(PRICING_TABS).toHaveLength(8); });
});

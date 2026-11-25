import { describe, it, expect } from "vitest";
import POT from "../public/data/territory-potential.json";
import { coverage, areasBelow, scopeDistricts, scopeName, DEFAULT_MODEL, type CovCount } from "../src/lib/coverage";
import { GJ } from "../src/lib/geo";
import type { PotData } from "../src/lib/potential";

const pot = POT as unknown as PotData;
const counts: CovCount[] = [
  { district: "Vadodara", type_code: "DLR", onboarded: 2, pending: 1 },
  { district: "Vadodara", type_code: "DST", onboarded: 1, pending: 0 },
  { district: "Surat", type_code: "DLR", onboarded: 0, pending: 3 },
  { district: "Surat", type_code: "STK", onboarded: 9, pending: 9 },
];

describe("coverage figures", () => {
  it("works out potential, required, onboarded and pending for one district", () => {
    const c = coverage(["Vadodara"], counts, pot);
    expect(c.potential).toBe(6177);
    expect(c.dealers.required).toBe(Math.ceil(6177 / DEFAULT_MODEL.dealerLpd));
    expect(c.distributors.required).toBe(1);
    expect(c.dealers).toMatchObject({ onboarded: 2, pending: 1 });
    expect(c.distributors).toMatchObject({ onboarded: 1, pending: 0 });
  });
  it("only counts dealers and distributors, and only inside the chosen districts", () => {
    const c = coverage(["Vadodara", "Surat"], counts, pot);
    expect(c.dealers).toMatchObject({ onboarded: 2, pending: 4 });
    expect(c.distributors.onboarded).toBe(1);
    expect(coverage(["Anand"], counts, pot).dealers.onboarded).toBe(0);
  });
  it("every level adds up to the level above it", () => {
    const all = coverage(scopeDistricts({}), counts, pot);
    const sum = areasBelow({}).map((a) => coverage(a.districts, counts, pot));
    expect(sum.reduce((s, c) => s + c.potential, 0)).toBeCloseTo(all.potential, 6);
    expect(sum.reduce((s, c) => s + c.dealers.required, 0)).toBe(all.dealers.required);
    expect(sum.reduce((s, c) => s + c.distributors.required, 0)).toBe(GJ.gd.length);
    expect(sum.reduce((s, c) => s + c.districts, 0)).toBe(GJ.gd.length);
  });
  it("drills from master circle to circle, cluster and district", () => {
    const mc = areasBelow({})[0], ci = areasBelow(mc.next!)[0], cl = areasBelow(ci.next!)[0], d = areasBelow(cl.next!)[0];
    expect(areasBelow(mc.next!).length).toBeGreaterThan(0);
    expect(cl.districts.length).toBeGreaterThan(0);
    expect(areasBelow(d.next!)[0].districts).toEqual([d.key]);
    expect(scopeDistricts(d.next!)).toEqual([d.key]);
    expect(scopeName({})).toBe("Gujarat");
  });
  it("handles missing potential data without breaking", () => {
    const c = coverage(["Vadodara"], counts, null);
    expect(c.potential).toBe(0); expect(c.dealers.required).toBe(0); expect(c.dealers.onboarded).toBe(2);
  });
});

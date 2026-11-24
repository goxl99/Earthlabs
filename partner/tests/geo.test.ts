import { describe, it, expect } from "vitest";
import { GJ, drillSet, fitTo, potential, pos, exclConflict, distFill, dist } from "../src/lib/geo";

describe("Gujarat geography", () => {
  it("has 34 district outlines, each with a cluster, circle and master circle", () => {
    expect(GJ.gd.length).toBe(34);
    GJ.gd.forEach((d) => { expect(GJ.paths[d.n]).toBeTruthy(); expect(GJ.clusters[String(d.cl)]).toContain(d.n); });
  });
  it("drill-down narrows from master circle to a district", () => {
    const all = drillSet({ mc: "1" })!, one = drillSet({ cl: "1" })!;
    expect(one).toEqual(["Vadodara", "Surat", "Ahmedabad"]);
    expect(all.length).toBeGreaterThan(one.length);
    expect(drillSet({})).toBeNull();
    expect(drillSet({ d: "Surat" })).toEqual(["Surat"]);
  });
  it("fitTo keeps the map's aspect ratio", () => { const v = fitTo(["Surat"]); expect(v[2] / v[3]).toBeCloseTo(1160 / 900, 2); });
  it("marker positions are stable and near the district centre", () => {
    const a = pos("ELP-DLR-0001", "Anand"), b = pos("ELP-DLR-0001", "Anand"), c = dist("Anand")!;
    expect(a).toEqual(b); expect(Math.hypot(a[0] - c.x, a[1] - c.y)).toBeLessThan(25);
  });
  it("market potential is higher where there are industrial areas", () => { expect(potential("Ahmedabad")).toBeGreaterThan(potential("Dang")); });
  it("colours districts by coverage", () => { expect(distFill("Anand", "status", true, false)).toBe("#b2dcdd"); expect(distFill("Anand", "status", false, true)).toBe("#fbe6b8"); expect(distFill("Anand", "status", false, false)).toBe("#f1eee0"); });
  it("blocks a second exclusive partner of the same type", () => {
    const ps = [{ id: "ELP-DLR-0001", name: "Shree Krishna", type_code: "DLR", district: "Anand", status: "Active", exclusive: true }];
    expect(exclConflict(ps, "DLR", "Anand", "ELP-DLR-0002", true)).toMatch(/already operates/);
    expect(exclConflict(ps, "DLR", "Anand", "ELP-DLR-0002", false)).toBeNull();
    expect(exclConflict(ps, "DST", "Surat", "ELP-DST-0001", true)).toBeNull();
  });
});

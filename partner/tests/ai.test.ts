import { describe, it, expect } from "vitest";
import { EFFECT, KIND_LABEL, supporting, canAct } from "../src/lib/ai";
describe("AI recommendation cards", () => {
  it("has an effect and label for every kind the database allows", () => { for (const k of ["reorder", "lead_time", "credit", "scheme", "promotion"]) { expect(EFFECT[k]).toBeTruthy(); expect(KIND_LABEL[k]).toBeTruthy(); } });
  it("lists the target and scalar payload values only", () => {
    expect(supporting({ target_kind: "rm", target_id: "RM-1", payload: { qty: 40, lead_days: 9, nested: { a: 1 }, none: null } })).toEqual([["rm", "RM-1"], ["qty", "40"], ["lead days", "9"]]);
    expect(supporting({ target_kind: null, target_id: null, payload: null })).toEqual([]);
  });
  it("lets Super Admin act on pending and deferred items only", () => { expect(canAct("Pending")).toBe(true); expect(canAct("Deferred")).toBe(true); expect(canAct("Approved")).toBe(false); expect(canAct("Dismissed")).toBe(false); });
});

import { describe, it, expect } from "vitest";
import { cleanTerm, emptyFilter, activeFilters } from "../src/lib/partnerFilter";
describe("partner filters", () => {
  it("strips characters that could alter a PostgREST filter", () => { expect(cleanTerm(' a,b%(c)"d\'e\\f* ')).toBe("abcdef"); });
  it("counts only filters that are set", () => {
    expect(activeFilters(emptyFilter)).toBe(0);
    expect(activeFilters({ ...emptyFilter, type: "DLR", district: "  " })).toBe(1);
  });
});

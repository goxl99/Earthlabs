import { describe, it, expect } from "vitest";
import { benefitText, conditions, creditSummary, type MyCredit } from "../src/lib/offers";

const ladder = [{ n: "Pay & carry", limit: 0, days: 0, min: 0 }, { n: "Starter credit", limit: 100000, days: 7, min: 75 }, { n: "Standard credit", limit: 300000, days: 15, min: 85 }];
const base: MyCredit = { partner_id: "ELP-DLR-0001", level: 0, pay_and_carry: true, score: 70, ladder };

describe("offers text", () => {
  it("describes each benefit kind", () => {
    expect(benefitText({ kind: "pct", value: 5, buy: null, get: null })).toBe("5% off");
    expect(benefitText({ kind: "flat", value: 500, buy: null, get: null })).toBe("₹500 off the order");
    expect(benefitText({ kind: "free", value: 0, buy: 10, get: 1 })).toBe("1 free carton per 10 bought");
    expect(benefitText({ kind: "kit", value: 0, buy: null, get: null })).toBe("Free brand kit");
  });
  it("lists only the conditions that apply", () => {
    expect(conditions({ min_cartons: 0, min_value: 0, first_order_only: false })).toEqual([]);
    expect(conditions({ min_cartons: 10, min_value: 25000, first_order_only: true })).toEqual(["Order at least 10 cartons", "Order value of ₹25,000 or more", "First order only"]);
  });
});
describe("credit summary", () => {
  it("pay-and-carry on means pay first even if a higher level is stored", () => {
    expect(creditSummary({ ...base, level: 1 }).payFirst).toBe(true);
  });
  it("level 0 is pay first and shows the gap to the next step", () => {
    const s = creditSummary({ ...base, pay_and_carry: false });
    expect(s.payFirst).toBe(true); expect(s.levelName).toBe("Pay & carry"); expect(s.next?.n).toBe("Starter credit"); expect(s.scoreGap).toBe(5);
  });
  it("a credit level is not pay first when pay-and-carry is off", () => {
    const s = creditSummary({ ...base, level: 1, pay_and_carry: false, score: 90 });
    expect(s.payFirst).toBe(false); expect(s.scoreGap).toBe(0); expect(s.next?.n).toBe("Standard credit");
  });
  it("top of the ladder has no next step", () => {
    const s = creditSummary({ ...base, level: 2, pay_and_carry: false });
    expect(s.next).toBeNull(); expect(s.scoreGap).toBeNull();
  });
});

import { navFor } from "../src/lib/roles";
import { VENDOR_TABS } from "../src/lib/vendorTabs";
describe("vendor portal navigation", () => {
  it("shows the vendor the five walkthrough pages and every tab has a menu entry or tab link", () => {
    const hrefs = navFor("vendor").map((n) => n.href);
    for (const h of ["/dashboard/", "/vendor/", "/vendor/orders/", "/vendor/quotes/", "/vendor/invoices/", "/vendor/performance/", "/notifications/"]) expect(hrefs).toContain(h);
    expect(VENDOR_TABS.map((t) => t.href)).toEqual(["/vendor/", "/vendor/orders/", "/vendor/quotes/", "/vendor/invoices/", "/vendor/performance/"]);
  });
  it("keeps vendor pages away from partners and staff menus", () => {
    for (const r of ["dealer", "distributor", "sales"] as const) expect(navFor(r).map((n) => n.href)).not.toContain("/vendor/invoices/");
  });
});

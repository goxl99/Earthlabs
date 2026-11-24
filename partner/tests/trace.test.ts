import { describe, it, expect } from "vitest";
import { traceBatch } from "../src/lib/trace";
const dns = [{ order_id: "O1", vehicle: "GJ1", lr_no: "L1", batch_ref: "B-100", dispatched_at: "2026-11-01" }, { order_id: "O2", vehicle: null, lr_no: null, batch_ref: "b-100", dispatched_at: "2026-11-02" }, { order_id: "O3", vehicle: null, lr_no: null, batch_ref: "B-200", dispatched_at: "2026-11-03" }];
const orders = [{ id: "O1", partner_id: "P1", status: "Delivered" }];
const lines = [{ order_id: "O1", sku: "S1", cartons: 3 }, { order_id: "O1", sku: "S2", cartons: 2 }, { order_id: "O3", sku: "S1", cartons: 9 }];
describe("batch traceability", () => {
  it("groups the dispatches of one batch, ignoring case", () => { const r = traceBatch("B-100", dns, orders, lines); expect(r.map((x) => x.order_id)).toEqual(["O1", "O2"]); expect(r[0].cartons).toBe(5); expect(r[0].partner_id).toBe("P1"); });
  it("keeps a dispatch whose order cannot be read", () => { expect(traceBatch("B-100", dns, orders, lines)[1]).toMatchObject({ partner_id: "unknown", status: "unknown", cartons: 0 }); });
  it("returns nothing for a blank or unknown batch", () => { expect(traceBatch("  ", dns, orders, lines)).toEqual([]); expect(traceBatch("B-999", dns, orders, lines)).toEqual([]); });
});

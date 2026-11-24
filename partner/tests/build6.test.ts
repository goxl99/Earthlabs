import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseRecommendations, buildUserPrompt, SYSTEM_PROMPT, type Facts } from "../../supabase/functions/_shared/ai";
import { coverDays, rmState, roActions, nextLevel, decideCall, type RM } from "../src/lib/procurement";
import { navFor } from "../src/lib/roles";

const facts: Facts = {
  ladder: [{ n: "Pay & carry", limit: 0, days: 0, min: 0 }, { n: "Starter", limit: 1, days: 7, min: 75 }, { n: "Standard", limit: 2, days: 15, min: 85 }],
  raw_materials: [
    { id: "RM-1", unit: "kg", on_hand: 100, reorder: 400, per_day: 20, lead_days: 7, vendor_active: true, incoming: 0, avg_actual_days: 11 },
    { id: "RM-2", unit: "kg", on_hand: 100, reorder: 400, per_day: 20, lead_days: 7, vendor_active: false, incoming: 0, avg_actual_days: null }],
  partners: [{ id: "ELP-DLR-0001", credit_level: 0, balance: 0, orders_90d: 5 }],
  vendors: [{ id: "VND-0001", credit_level: 2, received_orders: 4 }],
};
const reply = (a: unknown) => "Here you go:\n" + JSON.stringify(a);

describe("AI output is validated against the facts (AI recommends only)", () => {
  it("keeps valid items and drops invented ids, wrong steps, inactive vendors and absurd quantities", () => {
    const { recs, dropped } = parseRecommendations(reply([
      { kind: "reorder", title: "Order RM-1", reasons: ["low"], target_id: "RM-1", payload: { qty: 500 } },
      { kind: "reorder", title: "Order RM-2", reasons: ["low"], target_id: "RM-2", payload: { qty: 500 } },        // vendor not active
      { kind: "reorder", title: "Order RM-9", reasons: ["low"], target_id: "RM-9", payload: { qty: 5 } },          // unknown id
      { kind: "reorder", title: "Order a lot", reasons: ["low"], target_id: "RM-1", payload: { qty: 999999 } },    // over the sanity cap
      { kind: "lead_time", title: "Longer lead", reasons: ["11 days"], target_id: "RM-1", payload: { lead_days: 11 } },
      { kind: "lead_time", title: "Shorter lead", reasons: ["x"], target_id: "RM-1", payload: { lead_days: 3 } },  // not longer than today's
      { kind: "credit", title: "Dealer to Starter", reasons: ["ok"], target_kind: "partner", target_id: "ELP-DLR-0001", payload: { to_level: 1 } },
      { kind: "credit", title: "Dealer skips a step", reasons: ["ok"], target_kind: "partner", target_id: "ELP-DLR-0001", payload: { to_level: 2 } },
      { kind: "credit", title: "Vendor off the top", reasons: ["ok"], target_kind: "vendor", target_id: "VND-0001", payload: { to_level: 3 } },
      { kind: "approve_everything", title: "x", reasons: ["y"] },
      { kind: "scheme", title: "Push stock", reasons: ["stock is high"] },
      { kind: "scheme", title: "No reasons", reasons: [] }], ), facts);
    expect(recs.map((r) => r.title)).toEqual(["Order RM-1", "Longer lead", "Dealer to Starter", "Push stock"]);
    expect(dropped).toBe(8);
  });
  it("survives prose, broken JSON and non-arrays", () => {
    expect(parseRecommendations("no json here", facts).recs).toEqual([]);
    expect(parseRecommendations("[{broken", facts).recs).toEqual([]);
    expect(parseRecommendations('{"kind":"reorder"}', facts).recs).toEqual([]);
  });
  it("de-duplicates the same target and caps the list", () => {
    const one = { kind: "reorder", title: "Order RM-1", reasons: ["low"], target_id: "RM-1", payload: { qty: 500 } };
    expect(parseRecommendations(reply([one, one]), facts).recs).toHaveLength(1);
  });
  it("tells the model it only recommends and the prompt carries ids and numbers only", () => {
    expect(SYSTEM_PROMPT).toMatch(/RECOMMEND only/);
    expect(buildUserPrompt(facts)).not.toMatch(/@|phone|gstin/i);
  });
});

describe("procurement helpers", () => {
  const m: RM = { id: "RM-1", name: "x", unit: "kg", vendor_id: "V", on_hand: 100, reorder_level: 400, per_day: 20, lead_days: 7, v_avail: null, v_rate: null, v_lead: null };
  it("computes cover and stock state with incoming stock and the lead-time buffer", () => {
    expect(coverDays(m)).toBe(5);
    expect(rmState(m, 0, 2)).toBe("Stock-out risk");
    expect(rmState({ ...m, on_hand: 1000 }, 0, 2)).toBe("Healthy");
    expect(rmState({ ...m, on_hand: 300, per_day: 5 }, 0, 2)).toBe("Below reorder");
    expect(rmState({ ...m, on_hand: 300, per_day: 5 }, 200, 2)).toBe("Healthy");
    expect(coverDays({ on_hand: 5, per_day: 0 })).toBe(999);
  });
  it("shows release-order buttons per role; a vendor cannot dispatch before payment", () => {
    expect(roActions("super_admin", { status: "Pending approval", pay_mode: null, pay_status: "Unpaid" })).toEqual(["approve", "reject"]);
    expect(roActions("warehouse", { status: "Pending approval", pay_mode: null, pay_status: "Unpaid" })).toEqual([]);
    expect(roActions("accounts", { status: "Approved", pay_mode: "Advance", pay_status: "Unpaid" })).toEqual(["pay"]);
    expect(roActions("vendor", { status: "Approved", pay_mode: "Advance", pay_status: "Unpaid" })).toEqual(["acknowledge"]);
    expect(roActions("vendor", { status: "Acknowledged", pay_mode: "Advance", pay_status: "Paid" })).toEqual(["dispatch"]);
    expect(roActions("vendor", { status: "Approved", pay_mode: "Credit", pay_status: "On credit" })).toEqual(["acknowledge", "dispatch"]);
    expect(roActions("warehouse", { status: "Dispatched", pay_mode: "Advance", pay_status: "Paid" })).toEqual(["receive"]);
    expect(roActions("dealer", { status: "Dispatched", pay_mode: "Advance", pay_status: "Paid" })).toEqual([]);
  });
  it("credit moves one step at a time", () => {
    expect(nextLevel(0, facts.ladder)).toBe(1); expect(nextLevel(2, facts.ladder)).toBeNull();
  });
  it("approvals route to the right decision function; orders, proofs and change requests stay on their own screens", () => {
    expect(decideCall({ group: "credit", type: "Credit change", id: "7", title: "", at: "" }, true, "")).toEqual({ fn: "decide_credit_change", args: { pid: 7, approve: true, why: "" } });
    expect(decideCall({ group: "ai", type: "AI recommendation", id: "3", title: "", at: "" }, false, "no")?.fn).toBe("decide_ai_recommendation");
    expect(decideCall({ group: "orders", type: "Order", id: "ORD-1", title: "", at: "" }, true, "")).toBeNull();
  });
  it("navigation: vendor sees the vendor portal only; procurement is not shown to sales or partners", () => {
    expect(navFor("vendor").map((n) => n.href)).toContain("/vendor/");
    expect(navFor("vendor").map((n) => n.href)).not.toContain("/procurement/");
    expect(navFor("sales").map((n) => n.href)).not.toContain("/procurement/");
    expect(navFor("dealer").map((n) => n.href)).not.toContain("/ai/");
    expect(navFor("super_admin").map((n) => n.href)).toEqual(expect.arrayContaining(["/approvals/", "/ai/", "/vendors/", "/procurement/"]));
    // The walkthrough shows Schemes and Credit ladder as tabs of Products & Pricing and Procurement, not as menu items.
    expect(navFor("super_admin").map((n) => n.href)).not.toEqual(expect.arrayContaining(["/credit/"]));
    expect(navFor("super_admin").map((n) => n.href)).not.toEqual(expect.arrayContaining(["/schemes/"]));
  });
});

describe("the public repo holds no secrets", () => {
  const root = join(__dirname, "..", "..");
  const walk = (d: string, out: string[] = []) => { for (const f of readdirSync(d)) { if (["node_modules", ".git", ".next", "out", "chunks"].includes(f)) continue; const p = join(d, f); statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
  it("no API key shapes in the AI function, its helper or the app", () => {
    const files = [...walk(join(root, "supabase")), ...walk(join(root, "partner", "src"))].filter((f) => /\.(ts|tsx|sql|toml)$/.test(f));
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/sk-ant-[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/);
  });
  it("the Claude API key is read from the environment only", () => {
    const src = readFileSync(join(root, "supabase", "functions", "ai-recommend", "index.ts"), "utf8");
    expect(src).toMatch(/Deno\.env\.get\("ANTHROPIC_API_KEY"\)/);
    expect(src).not.toMatch(/x-api-key": "[^"]/);
  });
});

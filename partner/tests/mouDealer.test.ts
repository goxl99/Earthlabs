import { describe, it, expect } from "vitest";
import { buildMou, defaultValues, MOU_FIELDS, NA } from "../src/lib/mouDealer";
import { MOU_TEMPLATE_TEXT } from "../src/lib/mouTemplateText";
import { buildSignRequest } from "../../supabase/functions/_shared/leegality";

describe("Dealer MOU builder", () => {
  it("every token in the template is a known field or a computed one", () => {
    const toks = [...new Set([...MOU_TEMPLATE_TEXT.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];
    const known = new Set([...MOU_FIELDS.map((f) => f.key), "security_deposit_text", "noncompete_clause"]);
    expect(toks.filter((t) => !known.has(t))).toEqual([]);
  });
  it("fills the values and reports what is still blank", () => {
    const v = defaultValues({ name: "Shree Traders", contact_name: "A Shah", district: "Vadodara", id: "ELP-DLR-0009", address: "12 Market Road" });
    const r = buildMou({ ...v, pan: "ABCDE1234F", territory: "Vadodara city", mpt_m_vol: "500" });
    expect(r.text).toContain("Shree Traders");
    expect(r.text).toContain("ELP-DLR-0009");
    expect(r.text).toContain("12 Market Road");
    expect(r.text).not.toMatch(/\{\{/);
    expect(r.missing).toContain("mpt_a_vol");
    expect(r.missing).not.toContain("pan");
  });
  it("Not applicable passes through and the security deposit switches wording", () => {
    const v = { ...defaultValues({ name: "X", id: "ELP-DLR-1" }), address: NA };
    expect(buildMou(v).text).toContain("place of business at Not applicable");
    expect(buildMou(v).text).toContain("8.8 Security deposit.** Not applicable.");
    expect(buildMou({ ...v, security_deposit: "25000" }).text).toContain("refundable deposit of ₹25000");
  });
  it("the non-compete clause can be switched off", () => {
    const v = defaultValues({ name: "X", id: "ELP-DLR-1" });
    expect(buildMou({ ...v, noncompete: "No" }).text).toContain("11.5 Competing products.** Not applicable.");
  });
});
describe("Leegality two signers", () => {
  it("builds the partner and the company signatory in order", () => {
    const r = buildSignRequest("P", "a.pdf", "QUJD", [{ name: "Partner", email: "p@x.com" }, { name: "Company", phone: "98765 43210" }], "agr");
    expect(r.invitees.map((i) => i.name)).toEqual(["Partner", "Company"]);
    expect(r.invitees[1].phone).toBe("9876543210");
  });
  it("names the company signatory when its contact is missing", () => {
    expect(() => buildSignRequest("P", "a.pdf", "QUJD", [{ name: "P", email: "p@x.com" }, { name: "C" }], "a")).toThrow(/EarthLabs signatory/);
  });
});

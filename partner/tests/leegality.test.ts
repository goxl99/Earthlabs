import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhook, buildSignRequest, isPdf, webhookMac } from "../../supabase/functions/_shared/leegality";

describe("Leegality webhook MAC", () => {
  const salt = "test-salt-not-real";
  it("accepts the HMAC-SHA1 of the document id (hex or base64) and nothing else", async () => {
    const hex = createHmac("sha1", salt).update("DOC123").digest("hex");
    const b64 = createHmac("sha1", salt).update("DOC123").digest("base64");
    expect((await webhookMac("DOC123", salt)).hex).toBe(hex);
    expect(await verifyWebhook("DOC123", hex, salt)).toBe(true);
    expect(await verifyWebhook("DOC123", hex.toUpperCase(), salt)).toBe(true);
    expect(await verifyWebhook("DOC123", b64, salt)).toBe(true);
    expect(await verifyWebhook("DOC999", hex, salt)).toBe(false);       // MAC of another document
    expect(await verifyWebhook("DOC123", hex, "other-salt")).toBe(false);
    expect(await verifyWebhook("DOC123", "", salt)).toBe(false);
    expect(await verifyWebhook(undefined, hex, salt)).toBe(false);
    expect(await verifyWebhook("DOC123", hex, "")).toBe(false);
  });
});
describe("sign request body", () => {
  it("builds the v3 body with our agreement id as irn and a 10-digit phone", () => {
    const r = buildSignRequest("PROFILE1", "a.pdf", "QUJD", { name: "Ravi", email: "r@example.com", phone: "+91 98765 43210" }, "agr-1");
    expect(r).toEqual({ profileId: "PROFILE1", file: { name: "a.pdf", file: "QUJD" }, invitees: [{ name: "Ravi", email: "r@example.com", phone: "9876543210" }], irn: "agr-1" });
  });
  it("refuses a partner with no way to be reached", () => {
    expect(() => buildSignRequest("P", "a.pdf", "QUJD", { name: "Ravi", phone: "123" }, "x")).toThrow(/e-mail or a 10-digit phone/);
  });
  it("recognises a PDF", () => { expect(isPdf(new TextEncoder().encode("%PDF-1.7 ..."))).toBe(true); expect(isPdf(new TextEncoder().encode("PK\x03\x04"))).toBe(false); });
});

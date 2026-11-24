import { describe, it, expect } from "vitest";
import { rupeesInWords, isIntra, docTitle } from "@/lib/tradeDoc";
describe("trade document helpers", () => {
  it("writes amounts in words with Indian grouping", () => {
    expect(rupeesInWords(118000)).toBe("Rupees One Lakh Eighteen Thousand Only");
    expect(rupeesInWords(1180)).toBe("Rupees One Thousand One Hundred Eighty Only");
    expect(rupeesInWords(25000000)).toBe("Rupees Two Crore Fifty Lakh Only");
    expect(rupeesInWords(0)).toBe("Rupees Zero Only");
    expect(rupeesInWords(99.5)).toBe("Rupees Ninety Nine and Fifty Paise Only");
  });
  it("tells intra-state from inter-state supply", () => { expect(isIntra("Gujarat", " gujarat ")).toBe(true); expect(isIntra("Gujarat", "Maharashtra")).toBe(false); });
  it("names the documents", () => { expect(docTitle("invoice")).toBe("Tax Invoice"); expect(docTitle("vdn")).toBe("Dispatch Note"); expect(docTitle("challan")).toBe("Delivery Challan"); expect(docTitle("proforma")).toBe("Proforma Invoice"); expect(docTitle("po")).toBe("Purchase Order"); });
});

import { numberLabel, verifiable, isVendorDoc, issuerIsPartner } from "@/lib/tradeDoc";
import { verifyDocUrl } from "@/lib/qr";
describe("document kinds", () => {
  it("labels numbers and decides which documents carry a QR", () => {
    expect(numberLabel("proforma")).toBe("Proforma No"); expect(verifiable("invoice")).toBe(true); expect(verifiable("challan")).toBe(true); expect(verifiable("rpo")).toBe(false);
    expect(isVendorDoc("rpo")).toBe(true); expect(isVendorDoc("invoice")).toBe(false); expect(issuerIsPartner("vdn")).toBe(true); expect(issuerIsPartner("rpo")).toBe(false);
  });
  it("builds the public verification link", () => { expect(verifyDocUrl("https://www.earthlabsproducts.com/", "/partner", "ELI/26-27/0001")).toBe("https://www.earthlabsproducts.com/partner/verify/?doc=ELI%2F26-27%2F0001"); });
});

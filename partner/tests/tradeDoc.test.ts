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
  it("names the documents", () => { expect(docTitle("invoice")).toBe("Invoice"); expect(docTitle("challan")).toBe("Delivery Challan"); expect(docTitle("proforma")).toBe("Proforma Invoice"); expect(docTitle("po")).toBe("Purchase Order"); });
});

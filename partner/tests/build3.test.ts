import { describe, it, expect } from "vitest";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { fillDocx, fillDocXml, mouValues, parseFieldMap } from "../src/lib/mou";
import { verifyUrl, qrSvg } from "../src/lib/qr";
import { actionsFor, inr } from "../src/lib/orders";

const partner = { id: "ELP-DLR-0001", name: "Shah & Sons <Traders>", district: "Anand", state: "Gujarat", type_name: "Authorized Dealer", gstin: null };
const map = parseFieldMap("{{NAME}} = partner_name\n{{ID}} = partner_id\n{{DATE}} = date").map;

describe("MOU template filling", () => {
  it("replaces a placeholder that Word split across runs and escapes special characters", () => {
    const xml = `<w:document><w:body><w:p><w:r><w:t>Between EarthLabs and </w:t></w:r><w:r><w:t>{{NA</w:t></w:r><w:r><w:t>ME}}</w:t></w:r></w:p><w:p><w:r><w:t>ID: {{ID}}</w:t></w:r></w:p><w:p><w:r><w:t>Untouched</w:t></w:r></w:p></w:body></w:document>`;
    const r = fillDocXml(xml, map, mouValues(partner));
    expect(r.replaced).toBe(2);
    expect(r.xml).toContain("Between EarthLabs and Shah &amp; Sons &lt;Traders&gt;");
    expect(r.xml).toContain("ID: ELP-DLR-0001");
    expect(r.xml).toContain("<w:t>Untouched</w:t>");
    expect(r.xml).not.toContain("{{");
  });
  it("fills a real .docx archive and keeps the other files", () => {
    const docx = zipSync({ "word/document.xml": strToU8(`<w:p><w:r><w:t>{{NAME}}</w:t></w:r></w:p>`), "[Content_Types].xml": strToU8("<Types/>") });
    const out = fillDocx(docx, map, mouValues(partner));
    const files = unzipSync(out.bytes);
    expect(strFromU8(files["word/document.xml"])).toContain("Shah &amp; Sons");
    expect(strFromU8(files["[Content_Types].xml"])).toBe("<Types/>");
  });
  it("rejects a file that is not a Word document", () => {
    expect(() => fillDocx(zipSync({ "a.txt": strToU8("x") }), map, mouValues(partner))).toThrow(/not a valid .docx/);
  });
  it("never writes 'undefined' for missing partner data", () => {
    const v = mouValues(partner);
    expect(v.gstin).toBe(""); expect(v.contact_name).toBe(""); expect(Object.values(v).join("")).not.toContain("undefined");
  });
});

describe("certificate QR", () => {
  it("points at the public verify page with an upper-case code", () => {
    expect(verifyUrl("https://x.example/", "/partner/", " ab12cd ")).toBe("https://x.example/partner/verify/?code=AB12CD");
  });
  it("produces an SVG", async () => { expect(await qrSvg("https://x.example/partner/verify/?code=AB12CD")).toContain("<svg"); });
});

describe("order buttons per role (mirror of the database workflow)", () => {
  it("only Sales or Super Admin approve; only Accounts or Super Admin confirm payment; only Warehouse or Super Admin dispatch", () => {
    expect(actionsFor("sales", "Pending Approval")).toContain("approve");
    expect(actionsFor("accounts", "Pending Approval")).not.toContain("approve");
    expect(actionsFor("accounts", "Approved")).toEqual(["pay"]);
    expect(actionsFor("sales", "Approved")).not.toContain("pay");
    expect(actionsFor("warehouse", "Payment Confirmed")).toEqual(["dispatch"]);
    expect(actionsFor("sales", "Payment Confirmed")).not.toContain("dispatch");
  });
  it("nothing can be cancelled after dispatch and partners get no buttons", () => {
    expect(actionsFor("super_admin", "Dispatched")).not.toContain("cancel");
    expect(actionsFor("dealer", "Pending Approval")).toEqual([]);
    expect(actionsFor("super_admin", "On hold")).toEqual(["resume", "cancel"]);
  });
  it("formats rupees", () => { expect(inr(125000)).toBe("₹1,25,000"); });
});

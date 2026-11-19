import { describe, it, expect } from "vitest";
import { coverage, summary, whiteSpace, type MapRow } from "../src/lib/territory";
import { parseFieldMap, templateFileOk, safeName } from "../src/lib/mou";

const rows: MapRow[] = [
  { state: "Gujarat", district: "Anand", type_code: "DLR", partners: 1, exclusive_partner: "ELP-DLR-0001" },
  { state: "Gujarat", district: "Surat", type_code: "DLR", partners: 2, exclusive_partner: null },
];
describe("territory coverage", () => {
  it("classifies exclusive, shared and white-space", () => {
    expect(coverage(rows, "Anand", "DLR").cover).toBe("exclusive");
    expect(coverage(rows, "Surat", "DLR").cover).toBe("shared");
    expect(coverage(rows, "Rajkot", "DLR").cover).toBe("open");
    expect(coverage(rows, "Anand", "DST").cover).toBe("open");
  });
  it("summarises and lists white-space", () => {
    const s = summary(rows, "DLR");
    expect(s.exclusive).toBe(1); expect(s.shared).toBe(1); expect(s.open).toBe(s.total - 2);
    expect(whiteSpace(rows, "DLR")).not.toContain("Anand");
  });
});
describe("MOU template mapping", () => {
  it("accepts known fields", () => { expect(parseFieldMap("{{NAME}} = partner_name\n{{ID}}=partner_id").map).toEqual({ "{{NAME}}": "partner_name", "{{ID}}": "partner_id" }); });
  it("rejects unknown fields and malformed lines", () => {
    expect(parseFieldMap("{{X}} = bank_password").error).toMatch(/Unknown field/);
    expect(parseFieldMap("nonsense").error).toMatch(/must look like/);
  });
  it("checks file type and size", () => {
    expect(templateFileOk("a.docx", 1000)).toBeNull();
    expect(templateFileOk("a.exe", 1000)).toMatch(/Upload/);
    expect(templateFileOk("a.pdf", 9 * 1024 * 1024)).toMatch(/5 MB/);
    expect(safeName("../a b.docx")).toBe(".._a_b.docx");
  });
});

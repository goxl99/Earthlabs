import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { readFileSync } from "node:fs";
import { buildXlsx, colName, sheetName } from "../src/lib/xlsx";
import { navFor, NAV } from "../src/lib/roles";

describe("native Excel export", () => {
  const rows = [{ Name: "Shree <Agro> & Co", Amount: 1234.5, Paid: true, Note: "=HYPERLINK(\"http://x\")" }, { Name: "Second", Amount: 0, Paid: false, Note: null }];
  const files = unzipSync(buildXlsx("Orders: Q1/2", rows));
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  it("is a valid package with every required part", () => {
    for (const f of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]) expect(files[f]).toBeTruthy();
    expect(strFromU8(files["xl/workbook.xml"])).toContain('name="Orders  Q1 2"');   // sheet names cannot hold : / \ ? * [ ]
  });
  it("keeps numbers as numbers and text as text, escaped", () => {
    expect(sheet).toContain("<v>1234.5</v>");
    expect(sheet).toContain("Shree &lt;Agro&gt; &amp; Co");
    expect(sheet).toContain('t="b"');
  });
  it("never turns text into a formula (no <f> element, so =HYPERLINK stays inert text)", () => {
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain('t="inlineStr"');
  });
  it("has a bold, frozen header row and handles an empty report", () => {
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1">');
    expect(sheet).toContain('state="frozen"');
    expect(() => buildXlsx("Empty", [])).not.toThrow();
  });
  it("names columns past Z", () => { expect(colName(0)).toBe("A"); expect(colName(25)).toBe("Z"); expect(colName(26)).toBe("AA"); expect(colName(701)).toBe("ZZ"); expect(colName(702)).toBe("AAA"); });
  it("caps the sheet name at 31 characters and never leaves it empty", () => { expect(sheetName("x".repeat(60)).length).toBe(31); expect(sheetName("///")).toBe("Report"); });
  it("strips control characters XML cannot hold", () => { const s = strFromU8(unzipSync(buildXlsx("T", [{ A: "a\u0001b" }]))["xl/worksheets/sheet1.xml"]); expect(s).toContain(">ab<"); });
});

describe("module switches hide menu items, never core ones", () => {
  it("hides a switched-off module for every role", () => {
    expect(navFor("warehouse", { rfq: false }).some((n) => n.href === "/rfq/")).toBe(false);
    expect(navFor("warehouse", {}).some((n) => n.href === "/rfq/")).toBe(true);
    expect(navFor("warehouse", { rfq: true }).some((n) => n.href === "/rfq/")).toBe(true);
  });
  it("core screens carry no module key, so they cannot be hidden", () => {
    for (const h of ["/dashboard/", "/approvals/", "/users/", "/audit/", "/notifications/"]) expect(NAV.find((n) => n.href === h)?.module).toBeUndefined();
  });
  it("every module key is accepted by the database function", () => {
    const sql = readFileSync(new URL("../../supabase/migrations/20261123000016_build9_rfq_network_modules_bom_whatsapp.sql", import.meta.url), "utf8");
    for (const n of NAV) if (n.module) expect(sql, n.module).toContain(`'${n.module}'`);
  });
  it("vendors never see staff RFQ or planning screens; distributors get My network", () => {
    expect(navFor("vendor").map((n) => n.href)).not.toContain("/rfq/");
    expect(navFor("vendor").map((n) => n.href)).not.toContain("/bom/");
    expect(navFor("distributor").map((n) => n.href)).toContain("/network/");
    expect(navFor("accounts").map((n) => n.href)).not.toContain("/network/");
  });
});

describe("no secrets in the new code", () => {
  it("WhatsApp function reads its keys from the environment", () => {
    const f = readFileSync(new URL("../../supabase/functions/send-whatsapp/index.ts", import.meta.url), "utf8");
    expect(f).toContain('Deno.env.get("WA_TOKEN")');
    expect(f).not.toMatch(/EAA[A-Za-z0-9]{20,}/);
  });
});

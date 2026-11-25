import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { parseProposal, extractJson, applyProposal, stripSpecial, readStored, SPECIAL_HEADING } from "../src/lib/agreementMerge";
import { buildMou, defaultValues, fillText } from "../src/lib/mouDealer";
import { MOU_TEMPLATE_TEXT } from "../src/lib/mouTemplateText";
import { docxToText } from "../src/lib/mou";

const base = buildMou(defaultValues({ name: "Shree Krishna Traders", id: "ELP-DLR-0001" })).text;
const CREDIT = "Credit is not available at the start and may be extended later";

describe("Dealer Agreement wording", () => {
  it("no longer calls itself an MOU", () => { expect(MOU_TEMPLATE_TEXT).not.toMatch(/MOU|Memorandum/); expect(base).toMatch(/This Dealer Agreement \(the "Agreement"\)/); });
  it("the wording used in the tests really occurs once", () => { expect(base.split(CREDIT).length - 1).toBe(1); });
});

describe("special terms proposal", () => {
  it("drops malformed and oversized items from the AI's answer", () => {
    const p = parseProposal({ clauses: [{ title: "Credit", text: "The Company shall allow 15 days credit." }, { title: "", text: "x" }, 7], amendments: [{ clause: "4.5", find: "a", replace: "a", why: "same" }, { clause: "4.5", find: "old words here", replace: "new words", why: "y" }], warnings: ["ok", "", 5] });
    expect(p.clauses).toHaveLength(1); expect(p.amendments).toHaveLength(1); expect(p.warnings).toEqual(["ok"]);
    expect(parseProposal(null)).toEqual({ clauses: [], amendments: [], warnings: [] });
  });
  it("reads JSON out of a fenced or chatty reply", () => {
    expect(extractJson('```json\n{"clauses":[]}\n```')).toEqual({ clauses: [] });
    expect(extractJson('Here you go: {"a":1} thanks')).toEqual({ a: 1 });
    expect(extractJson("no json")).toBeNull();
  });
  it("adds Schedule C at the end with a precedence clause, and leaves every other character alone", () => {
    const r = applyProposal(base, { clauses: [{ title: "Credit", text: "The Company shall allow 15 days credit on the first three orders." }], amendments: [], warnings: [] });
    expect(r.text.startsWith(base.trimEnd())).toBe(true);
    expect(r.text).toContain(SPECIAL_HEADING); expect(r.text).toMatch(/C\.1 Precedence/); expect(r.text).toMatch(/C\.2 Credit\./);
  });
  it("merging again replaces Schedule C instead of stacking a second one", () => {
    const once = applyProposal(base, { clauses: [{ title: "A", text: "First special term text." }], amendments: [], warnings: [] }).text;
    const twice = applyProposal(once, { clauses: [{ title: "B", text: "Second special term text." }], amendments: [], warnings: [] }).text;
    expect(twice.split(SPECIAL_HEADING).length - 1).toBe(1); expect(twice).toContain("Second special term"); expect(twice).not.toContain("First special term");
    expect(stripSpecial(twice).trimEnd()).toBe(base.trimEnd());
  });
  it("applies an exact amendment once, and reports ones it cannot place", () => {
    const good = { clause: "4.5", find: CREDIT, replace: "Credit of 15 days is available on the first three orders and may be extended later", why: "special term" };
    const r = applyProposal(base, { clauses: [], amendments: [good, { clause: "9", find: "wording that is not in the agreement", replace: "x", why: "" }, { clause: "1", find: "the", replace: "x", why: "" }, { clause: "2", find: "the Dealer shall", replace: "a dealer shall", why: "" }], warnings: [] });
    expect(r.applied).toEqual([good]); expect(r.text).toContain("Credit of 15 days"); expect(r.text).not.toContain(CREDIT);
    expect(r.skipped.map((s) => s.reason)).toEqual([expect.stringMatching(/not in the agreement/), expect.stringMatching(/too short/), expect.stringMatching(/more than once/)]);
  });
  it("stores and reads back the approved proposal with the agreement fields", () => {
    const p = { clauses: [{ title: "A", text: "Some special term here." }], amendments: [], warnings: [] };
    expect(readStored({ special_proposal: JSON.stringify(p) })).toEqual(p); expect(readStored({})).toBeNull(); expect(readStored({ special_proposal: "{bad" })).toBeNull();
  });
});

describe("attaching a template", () => {
  it("reads the text of a Word file and fills its placeholders from the fields", () => {
    const xml = '<w:document><w:body><w:p><w:r><w:t>Agreement with {{dealer_</w:t></w:r><w:r><w:t>name}} &amp; Co.</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph.</w:t></w:r></w:p></w:body></w:document>';
    const text = docxToText(zipSync({ "word/document.xml": strToU8(xml) }));
    expect(text).toBe("Agreement with {{dealer_name}} & Co.\n\nSecond paragraph.");
    expect(fillText(text, { dealer_name: "Shree Krishna" }).text).toBe("Agreement with Shree Krishna & Co.\n\nSecond paragraph.");
    expect(fillText("Pay {{nobody_knows}}", {}).missing).toEqual(["nobody_knows"]);
  });
  it("refuses a file that is not a Word document", () => { expect(() => docxToText(zipSync({ "x.txt": strToU8("hi") }))).toThrow(/Word/); });
});

import { describe, it, expect } from "vitest";
import { MOU_FIELDS, MOU_FIELD_HELP, parseFieldMap } from "../src/lib/mou";

describe("MOU template help", () => {
  it("documents every allowed field exactly once, in the same order", () => {
    expect(MOU_FIELD_HELP.map(([f]) => f)).toEqual([...MOU_FIELDS]);
    MOU_FIELD_HELP.forEach(([, d]) => expect(d.length).toBeGreaterThan(5));
  });
  it("the example mapping shown on the form is valid", () => {
    expect(parseFieldMap("{{PARTNER_NAME}} = partner_name\n{{PARTNER_ID}} = partner_id").error).toBeUndefined();
  });
});

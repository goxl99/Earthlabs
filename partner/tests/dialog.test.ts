import { describe, it, expect } from "vitest";
import { checkFields, askForm, subscribe } from "../src/lib/dialog";

describe("dialog field checks", () => {
  const fields = [
    { name: "utr", label: "UTR", required: true },
    { name: "amt", label: "Amount", type: "number" as const, required: true, min: 1 },
  ];
  it("requires required fields", () => expect(checkFields(fields, { utr: " ", amt: "5" })).toBe("UTR is required"));
  it("rejects non numbers and values under the minimum", () => {
    expect(checkFields(fields, { utr: "A1", amt: "abc" })).toBe("Amount must be a number");
    expect(checkFields(fields, { utr: "A1", amt: "0" })).toBe("Amount must be at least 1");
  });
  it("accepts good values", () => expect(checkFields(fields, { utr: "A1", amt: "250.5" })).toBeNull());
  it("a form request queued before the host mounts is delivered, and resolves null on cancel", async () => {
    const p = askForm("T", fields);
    let got: any = null;
    const off = subscribe((r) => { got = r; });
    expect(got.kind).toBe("form"); got.resolve(null);
    expect(await p).toBeNull(); off();
  });
});

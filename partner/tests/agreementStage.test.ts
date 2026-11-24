import { describe, it, expect } from "vitest";
import { agreementStage } from "../src/lib/agreementStage";
describe("agreement stage tracker", () => {
  it("walks Draft, Sent, Signed, Active, Certificate", () => {
    expect(agreementStage({ status: "Draft" }, "Agreement Pending", false)).toEqual({ stage: "Draft", index: 0 });
    expect(agreementStage({ status: "Sent" }, "Agreement Pending", false).stage).toBe("Sent for e-sign");
    expect(agreementStage({ status: "Signed" }, "Agreement Pending", false).stage).toBe("Signed");
    expect(agreementStage({ status: "Signed" }, "Active", false).stage).toBe("Active");
    expect(agreementStage({ status: "Signed" }, "Active", true)).toEqual({ stage: "Certificate", index: 4 });
  });
  it("keeps a void agreement off the path and does not skip ahead", () => {
    expect(agreementStage({ status: "Void" }, "Active", true).index).toBe(-1);
    expect(agreementStage({ status: "Sent" }, "Active", true).stage).toBe("Sent for e-sign");
  });
});

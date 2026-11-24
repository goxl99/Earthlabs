import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import DialogHost from "../src/components/DialogHost";
import { askForm, askConfirm } from "../src/lib/dialog";
afterEach(cleanup);
describe("DialogHost", () => {
  it("blocks a required field left empty and then returns the typed values", async () => {
    render(<DialogHost />);
    const p = askForm("Reject invoice", [{ name: "why", label: "Reason", type: "textarea", required: true }], { ok: "Reject" });
    const dlg = await screen.findByRole("dialog");
    expect(dlg.getAttribute("aria-label")).toBe("Reject invoice");
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Reason is required");
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Amount does not match" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(await p).toEqual({ why: "Amount does not match" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("enforces a number range", async () => {
    render(<DialogHost />);
    const p = askForm("Invoice", [{ name: "amt", label: "Amount", type: "number", required: true, min: 1 }], { ok: "Save" });
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain("at least 1");
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await p).toEqual({ amt: "500" });
  });
  it("answers a confirmation yes or no, and Cancel resolves false", async () => {
    render(<DialogHost />);
    const yes = askConfirm("Suspend?", "Sure?", "Suspend", true);
    await screen.findByRole("dialog"); fireEvent.click(screen.getByRole("button", { name: "Suspend" })); expect(await yes).toBe(true);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const no = askConfirm("Suspend?", "Sure?", "Suspend");
    await screen.findByRole("dialog"); fireEvent.click(screen.getByRole("button", { name: "Cancel" })); expect(await no).toBe(false);
  });
  it("closes on Escape", async () => {
    render(<DialogHost />);
    const p = askConfirm("Award?", "Award this quote?", "Award");
    const dlg = await screen.findByRole("dialog"); fireEvent.keyDown(dlg, { key: "Escape" }); expect(await p).toBe(false);
  });
});

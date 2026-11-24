import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";

const rpc = vi.fn(async () => ({ data: null, error: null }));
const rows = [
  { id: "VINV-1", vendor_id: "VND-0001", ro_id: "RO-1", invoice_no: "A-1", invoice_date: "2026-11-01", amount: 1180, file_path: null, status: "Submitted", reason: null, pay_utr: null, created_at: "2026-11-02" },
  { id: "VINV-2", vendor_id: "VND-0001", ro_id: "RO-2", invoice_no: "A-2", invoice_date: "2026-11-01", amount: 500, file_path: null, status: "Accepted", reason: null, pay_utr: null, created_at: "2026-11-02" },
  { id: "VINV-3", vendor_id: "VND-0001", ro_id: "RO-3", invoice_no: "A-3", invoice_date: "2026-11-01", amount: 700, file_path: null, status: "Paid", reason: null, pay_utr: "UTR9", created_at: "2026-11-02" },
];
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => (rpc as any)(...a), storage: { from: () => ({}) },
  from: () => { const q: any = { select: () => q, order: () => q, limit: () => q, in: () => q, then: (r: (v: unknown) => void) => r({ data: rows, error: null }) }; return q; } } }));
vi.mock("@/components/Shell", () => ({ default: ({ children }: { children: (p: unknown) => React.ReactNode }) => <>{children({ role: "accounts" })}</> }));
import { StaffVendorInvoices } from "../src/components/VendorViews";
import DialogHost from "../src/components/DialogHost";
beforeEach(() => rpc.mockClear());
afterEach(cleanup);

describe("staff vendor invoices", () => {
  it("offers the right action for each status", async () => {
    render(<StaffVendorInvoices />);
    await screen.findByText("A-1");
    const row = (no: string) => screen.getByText(no).closest("tr")!;
    const has = (no: string, name: string) => within(row(no)).queryByRole("button", { name }) !== null;
    expect([has("A-1", "Accept"), has("A-1", "Reject"), has("A-1", "Record payment")]).toEqual([true, true, false]);
    expect([has("A-2", "Accept"), has("A-2", "Reject"), has("A-2", "Record payment")]).toEqual([false, false, true]);
    expect([has("A-3", "Accept"), has("A-3", "Reject"), has("A-3", "Record payment")]).toEqual([false, false, false]);
    expect(row("A-3").textContent).toContain("UTR UTR9");
  });
  it("sends the UTR to pay_vendor_invoice", async () => {
    render(<><StaffVendorInvoices /><DialogHost /></>);
    await screen.findByText("A-2");
    fireEvent.click(screen.getByText("A-2").closest("tr")!.querySelector("button")!);
    fireEvent.change(await screen.findByLabelText(/UTR/), { target: { value: "UTR123456" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Record payment" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("pay_vendor_invoice", { iid: "VINV-2", utr: "UTR123456" }));
  });
  it("requires a reason before rejecting an invoice", async () => {
    render(<><StaffVendorInvoices /><DialogHost /></>);
    await screen.findByText("A-1");
    fireEvent.click(screen.getByText("A-1").closest("tr")!.querySelectorAll("button")[1]);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Reject invoice" }));
    expect((await screen.findByRole("alert")).textContent).toContain("is required");
    expect(rpc).not.toHaveBeenCalledWith("decide_vendor_invoice", expect.anything());
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Wrong amount" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reject invoice" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("decide_vendor_invoice", { iid: "VINV-1", accept: false, why: "Wrong amount" }));
  });
});

"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg, when } from "@/components/ui";
import { inr } from "@/lib/orders";
import { balanceText, canReviewProof } from "@/lib/money";
import type { Role } from "@/lib/roles";
import { askForm, askConfirm, askReason, notify } from "@/lib/dialog";

type Inv = { id: string; order_id: string; partner_id: string; issued_on: string; supply_state: string; taxable: number; cgst: number; sgst: number; igst: number; total: number };
type Cn = { id: string; invoice_id: string; partner_id: string; amount: number; reason: string; issued_on: string };
type Led = { id: number; at: string; kind: string; ref: string; debit: number; credit: number; narration: string | null; partner_id: string };
type Proof = { id: number; partner_id: string; order_id: string; utr: string; amount: number; file_path: string | null; note: string | null; status: string; reason: string | null; submitted_at: string };
type Line = { sku: string; name: string; units: number; unit_price: number; amount: number };

function Inner({ role }: { role: Role }) {
  const money = role === "super_admin" || role === "accounts";
  const [inv, setInv] = useState<Inv[]>([]); const [cn, setCn] = useState<Cn[]>([]); const [led, setLed] = useState<Led[]>([]); const [proofs, setProofs] = useState<Proof[]>([]);
  const [open, setOpen] = useState<string | null>(null); const [lines, setLines] = useState<Line[]>([]); const [toInvoice, setToInvoice] = useState<{ id: string; partner_id: string; total: number }[]>([]);
  const [pid, setPid] = useState(""); const [bal, setBal] = useState<number | null>(null); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const load = useCallback(async () => {
    setInv(((await supabase.from("invoices").select("*").order("issued_on", { ascending: false }).limit(50)).data as Inv[]) ?? []);
    setCn(((await supabase.from("credit_notes").select("id,invoice_id,partner_id,amount,reason,issued_on").order("issued_on", { ascending: false }).limit(50)).data as Cn[]) ?? []);
    let l = supabase.from("ledger_entries").select("id,at,kind,ref,debit,credit,narration,partner_id").order("id", { ascending: false }).limit(50); if (pid) l = l.eq("partner_id", pid);
    setLed(((await l).data as Led[]) ?? []);
    if (money) {
      setProofs(((await supabase.from("payment_proofs").select("*").eq("status", "Submitted").order("submitted_at").limit(50)).data as Proof[]) ?? []);
      const { data: os } = await supabase.from("orders").select("id,partner_id,total").in("status", ["Payment Confirmed", "Dispatched", "Delivered"]).order("created_at", { ascending: false }).limit(100);
      const { data: done } = await supabase.from("invoices").select("order_id").limit(500);
      const have = new Set((done ?? []).map((d: { order_id: string }) => d.order_id));
      setToInvoice(((os ?? []) as { id: string; partner_id: string; total: number }[]).filter((o) => !have.has(o.id)));
    }
    if (pid && money) { const { data } = await supabase.rpc("ledger_balance", { pid }); setBal(data as number); } else setBal(null);
  }, [pid, money]);
  useEffect(() => { load(); }, [load]);
  async function call(fn: string, args: Record<string, unknown>) { const { error } = await supabase.rpc(fn, args); setMsg({ ok: !error, t: error ? error.message : "Done" }); load(); }
  async function show(id: string) { if (open === id) { setOpen(null); return; } setOpen(id); setLines(((await supabase.from("invoice_lines").select("sku,name,units,unit_price,amount").eq("invoice_id", id)).data as Line[]) ?? []); }
  async function proofFile(p: Proof) { if (!p.file_path) return; const { data } = await supabase.storage.from("payment-proofs").createSignedUrl(p.file_path, 300); if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener"); }
  return (<><h1>{money ? "Invoices, payments & ledger" : "My invoices & ledger"}</h1><p className="sub">GST invoices, payment verification and partner ledgers. Entries are never edited; corrections use credit and debit notes.</p>{msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    {money && <>
      <h2>Payment proofs to check ({proofs.length})</h2>
      <div className="card"><table><thead><tr><th>Partner</th><th>Order</th><th>UTR</th><th>Amount</th><th>Note</th><th></th></tr></thead><tbody>
        {proofs.map((p) => (<tr key={p.id}><td>{p.partner_id}</td><td>{p.order_id}</td><td>{p.utr}</td><td>{inr(p.amount)}</td><td>{p.note}{p.file_path && <> · <a href="#" onClick={(e) => { e.preventDefault(); proofFile(p); }}>advice</a></>}</td>
          <td style={{ whiteSpace: "nowrap" }}><button className="btn sm" style={{ marginRight: 6 }} disabled={!canReviewProof(role)} onClick={async () => (await askConfirm("Review payment", `Confirm ${inr(p.amount)} with UTR ${p.utr}? Check the bank statement first.`, "Confirm received")) && call("confirm_payment_proof", { proof_id: p.id })}>Confirm received</button>
            <button className="btn sm red" onClick={async () => { const why = await askReason("Reject payment proof", "Reason (the partner sees this)", "Reject", true); if (why) call("reject_payment_proof", { proof_id: p.id, why }); }}>Reject</button></td></tr>))}
        {proofs.length === 0 && <tr><td colSpan={6}>No payment proofs waiting.</td></tr>}</tbody></table></div>
      <h2>Paid orders without an invoice ({toInvoice.length})</h2>
      <div className="card"><table><tbody>{toInvoice.map((o) => <tr key={o.id}><td>{o.id}</td><td>{o.partner_id}</td><td>{inr(o.total)}</td><td><button className="btn" onClick={() => call("issue_invoice", { oid: o.id })}>Issue invoice</button></td></tr>)}
        {toInvoice.length === 0 && <tr><td>Every paid order has an invoice.</td></tr>}</tbody></table></div>
      <h2>Record a payment received</h2>
      <div className="card"><p style={{ margin: 0 }}>For money received outside an order (for example an advance). A UTR can be recorded once only.</p>
        <button className="btn" style={{ marginTop: 8 }} onClick={async () => { const f = await askForm("Record a payment received", [{ name: "pid", label: "Partner ID", required: true, hint: "For example ELP-DLR-0001" }, { name: "utr", label: "UTR / reference number", required: true }, { name: "amt", label: "Amount received (₹)", type: "number", required: true, min: 1 }, { name: "note", label: "Note (optional)" }], { ok: "Record payment" }); if (!f) return; call("record_payment", { pid: f.pid.trim(), utr: f.utr.trim(), amt: Number(f.amt), mode: "Bank transfer", note: f.note.trim() }); }}>Record payment</button></div>
    </>}
    <h2>Invoices</h2>
    <div className="card"><table><thead><tr><th>Invoice</th>{money && <th>Partner</th>}<th>Order</th><th>Date</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th><th></th></tr></thead><tbody>
      {inv.map((i) => (<><tr key={i.id}><td><a href="#" onClick={(e) => { e.preventDefault(); show(i.id); }}>{i.id}</a></td>{money && <td>{i.partner_id}</td>}<td>{i.order_id}</td><td>{when(i.issued_on)}</td><td>{inr(i.taxable)}</td><td>{inr(i.cgst)}</td><td>{inr(i.sgst)}</td><td>{inr(i.igst)}</td><td>{inr(i.total)}</td>
        <td>{money && <button className="btn" onClick={async () => { const f = await askForm(`Credit note against ${i.id}`, [{ name: "a", label: "Amount incl. GST (₹)", type: "number", required: true, min: 1, max: Number(i.total), hint: `Maximum ${inr(i.total)}` }, { name: "why", label: "Reason", type: "textarea", required: true }], { ok: "Issue credit note" }); if (f) call("issue_credit_note", { inv_id: i.id, amt: Number(f.a), why: f.why.trim() }); }}>Credit note</button>}</td></tr>
        {open === i.id && <tr key={i.id + "d"}><td colSpan={10}><table><tbody>{lines.map((l) => <tr key={l.sku}><td>{l.name}</td><td>{l.units} units</td><td>{inr(l.unit_price)} / unit</td><td>{inr(l.amount)}</td></tr>)}</tbody></table>
          <p style={{ margin: "8px 0 0" }}>Place of supply: {i.supply_state}</p></td></tr>}</>))}
      {inv.length === 0 && <tr><td colSpan={10}>No invoices yet.</td></tr>}</tbody></table></div>
    <h2>Credit notes</h2>
    <div className="card"><table><tbody>{cn.map((c) => <tr key={c.id}><td>{c.id}</td>{money && <td>{c.partner_id}</td>}<td>against {c.invoice_id}</td><td>{when(c.issued_on)}</td><td>{inr(c.amount)}</td><td>{c.reason}</td></tr>)}{cn.length === 0 && <tr><td>No credit notes.</td></tr>}</tbody></table></div>
    <h2>Ledger</h2>
    {money && <p><input aria-label="Filter ledger by Partner ID" placeholder="Partner ID, e.g. ELP-DLR-0001" value={pid} onChange={(e) => setPid(e.target.value.trim())} style={{ maxWidth: 280 }} />{bal !== null && <b style={{ marginLeft: 12 }}>{balanceText(bal)}</b>}</p>}
    <div className="card"><table><thead><tr><th>Date</th>{money && <th>Partner</th>}<th>Entry</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Narration</th></tr></thead><tbody>
      {led.map((e) => <tr key={e.id}><td>{when(e.at)}</td>{money && <td>{e.partner_id}</td>}<td>{e.kind.replace("_", " ")}</td><td>{e.ref}</td><td>{e.debit > 0 ? inr(e.debit) : ""}</td><td>{e.credit > 0 ? inr(e.credit) : ""}</td><td>{e.narration}</td></tr>)}
      {led.length === 0 && <tr><td colSpan={7}>No entries yet.</td></tr>}</tbody></table>
      <p style={{ fontSize: 12 }}>Debit = the partner owes EarthLabs (invoice). Credit = money received or credit note. Entries are never edited; mistakes are corrected by a credit note.</p></div></>);
}
export default function Page() { return <Shell page="invoices">{(p) => <Inner role={p.role} />}</Shell>; }

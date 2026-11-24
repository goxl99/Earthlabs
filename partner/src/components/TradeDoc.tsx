"use client";
import { inr } from "@/lib/orders";
import { docTitle, isIntra, rupeesInWords, type Doc } from "@/lib/tradeDoc";

const n = (v: unknown) => Number(v ?? 0);
const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");

/** Printable Tax Invoice (EarthLabs to partner) or Purchase Order (partner to EarthLabs). Same frame, different body. */
export default function TradeDoc({ d }: { d: Doc }) {
  const co = d.company, p = d.partner, x = d.doc, inv = d.kind === "invoice";
  const intra = inv ? isIntra(co.state || "Gujarat", String(x.supply_state ?? "")) : true;
  const total = n(x.total);
  return (
    <article className="tdoc" aria-label={docTitle(d.kind)}>
      <header className="tdoc-head">
        <div><div className="tdoc-co">{co.legal_name || "EarthLabs Innovative Products Pvt. Ltd."}</div>
          <div>{co.address}</div><div>GSTIN {co.gstin}{co.cin ? ` · CIN ${co.cin}` : ""}</div></div>
        <div className="tdoc-title"><h1>{docTitle(d.kind)}</h1>
          <table><tbody><tr><td>{inv ? "Invoice no." : "PO no."}</td><td><b>{String(x.number)}</b></td></tr>
            <tr><td>Date</td><td>{dt(x.date)}</td></tr>
            {inv && <tr><td>Against order</td><td>{String(x.order_id)}</td></tr>}
            {!inv && x.eta_from && <tr><td>Expected delivery</td><td>{dt(x.eta_from)} to {dt(x.eta_to)}</td></tr>}
            {inv && <tr><td>Place of supply</td><td>{String(x.supply_state)}</td></tr>}</tbody></table></div>
      </header>
      <section className="tdoc-parties">
        <div><div className="tdoc-lbl">{inv ? "Bill to" : "Ordered by (buyer)"}</div><b>{p.name}</b><div>{p.address || `${p.district ?? ""}, ${p.state ?? ""}`}</div>
          <div>Partner ID {p.id}{p.gstin ? ` · GSTIN ${p.gstin}` : ""}</div>{p.contact && <div>{p.contact}{p.phone ? ` · ${p.phone}` : ""}</div>}</div>
        <div><div className="tdoc-lbl">{inv ? "Supplier" : "Supplier (seller)"}</div><b>{co.legal_name || "EarthLabs Innovative Products Pvt. Ltd."}</b><div>{co.address}</div><div>GSTIN {co.gstin}</div></div>
      </section>
      <table className="tdoc-lines"><thead><tr><th>#</th><th>Item</th>{!inv && <th>Cartons</th>}<th>Units</th><th>Rate / unit</th><th>Amount</th></tr></thead>
        <tbody>{d.lines.map((l, i) => <tr key={l.sku}><td>{i + 1}</td><td>{l.name}<div className="tdoc-sub">{l.sku}</div></td>{!inv && <td>{l.cartons}</td>}<td>{l.units}</td><td>{inr(l.unit_price)}</td><td>{inr(l.amount)}</td></tr>)}</tbody></table>
      <section className="tdoc-sum">
        <div className="tdoc-words"><div className="tdoc-lbl">Amount in words</div>{rupeesInWords(total)}
          {!inv && Array.isArray(x.applied) && x.applied.length > 0 && <div style={{ marginTop: 8 }}><div className="tdoc-lbl">Schemes applied</div>{(x.applied as { name?: string; amount?: number }[]).map((a, i) => <div key={i}>{a.name} {a.amount ? `(− ${inr(a.amount)})` : ""}</div>)}</div>}
          {inv && <div style={{ marginTop: 8 }}>Payment terms: {d.credit_days > 0 ? `${d.credit_days} days from invoice date` : "Pay and carry (paid before dispatch)"}</div>}</div>
        <table><tbody>
          <tr><td>Taxable value</td><td>{inr(n(x.taxable))}</td></tr>
          {n(x.discount) > 0 && <tr><td>Scheme discount</td><td>− {inr(n(x.discount))}</td></tr>}
          {inv ? (intra ? <><tr><td>CGST</td><td>{inr(n(x.cgst))}</td></tr><tr><td>SGST</td><td>{inr(n(x.sgst))}</td></tr></> : <tr><td>IGST</td><td>{inr(n(x.igst))}</td></tr>) : <tr><td>GST</td><td>{inr(n(x.gst))}</td></tr>}
          <tr className="tdoc-total"><td>Total</td><td>{inr(total)}</td></tr></tbody></table>
      </section>
      <footer className="tdoc-foot">
        <div>{inv ? "This is a computer-generated invoice. Corrections are made by credit or debit note, never by editing this invoice." : "This purchase order is a request to supply. Supply is subject to stock, payment verification and the signed partner agreement."}</div>
        <div className="tdoc-sign">For {co.legal_name || "EarthLabs Innovative Products Pvt. Ltd."}<br /><br />{co.signatory_designation || "Authorised Signatory"}</div>
      </footer>
    </article>
  );
}

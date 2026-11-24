"use client";
import { inr } from "@/lib/orders";
import { docTitle, gstPct, isIntra, issuerIsPartner, rupeesInWords, type Brand, type Doc } from "@/lib/tradeDoc";

const n = (v: unknown) => Number(v ?? 0);
const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
const m2 = (v: number) => "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const stateCodes: Record<string, string> = { gujarat: "24", maharashtra: "27", rajasthan: "08", "madhya pradesh": "23", karnataka: "29", delhi: "07", "tamil nadu": "33", "uttar pradesh": "09" };
const withCode = (s?: string | null, c?: string | null) => (s ? `${s}${c || stateCodes[s.toLowerCase()] ? ` (${c || stateCodes[s.toLowerCase()]})` : ""}` : "");

/** One constant frame for Invoice, Proforma, Delivery Challan and Purchase Order. Only the issuer's logo, details and bank change. */
export default function TradeDoc({ d }: { d: Doc }) {
  const k = d.kind, x = d.doc, p = d.partner;
  const co = d.company as Brand & { legal_name?: string };
  const pb: Brand = d.partner_brand ?? {};
  const fromPartner = issuerIsPartner(k);
  const issuer: Brand = fromPartner ? { legal_name: pb.legal_name || p.name, address: pb.address || p.address || "", state: pb.state || p.state || "", state_code: pb.state_code, gstin: pb.gstin || p.gstin || "", pan: pb.pan, email: pb.email || p.email || "", logo: pb.logo, bank: pb.bank } : { ...co, logo: co.logo || (typeof window === "undefined" ? "" : `${window.location.pathname.split("/doc")[0]}/logo.png`) };
  const buyer: Brand = fromPartner ? { ...co } : { legal_name: p.name, address: p.address || `${p.district ?? ""}, ${p.state ?? ""}`, state: p.state || "", gstin: p.gstin || "", email: p.email || "" };
  const supply = k === "invoice" ? String(x.supply_state ?? "") : (buyer.state || "");
  const intra = isIntra(issuer.state || "Gujarat", supply || issuer.state || "Gujarat");
  const taxable = n(x.taxable) - (k === "invoice" ? 0 : n(x.discount));
  const total = n(x.total);
  const tax = k === "invoice" ? n(x.cgst) + n(x.sgst) + n(x.igst) : n(x.gst);
  const pct = gstPct(k === "invoice" ? n(x.taxable) : taxable, tax) || 18;
  const challan = k === "challan";
  const half = Math.round(tax * 50) / 100;
  const title = docTitle(k);
  const ref = k === "invoice" ? `Order ${String(x.ref ?? x.order_id)}` : "";
  const bank = issuer.bank ?? {};
  const noteLines = challan ? ["Goods dispatched against the order above. Please check quantity and condition on receipt.", "Batch and QA/QC status are fetched from the EarthLabs Batch Management system.", "This is an electronically generated document, no signature is required."]
    : k === "po" ? ["This purchase order is a request to supply, subject to stock, payment verification and the signed partner agreement.", `${pct}% GST applies as per HSN. ${intra ? "Intra-state supply." : "Inter-state supply."}`, "This is an electronically generated document, no signature is required."]
    : [k === "proforma" ? "This is a proforma invoice and not a demand for payment under GST until the tax invoice is issued." : `This invoice is issued against order ${String(x.order_id)}.`,
      intra ? `CGST @ ${pct / 2}% + SGST @ ${pct / 2}% charged. Intra-state supply (${issuer.state || "Gujarat"} → ${buyer.state || issuer.state || "Gujarat"}).` : `IGST @ ${pct}% charged. Inter-state supply.`,
      d.credit_days > 0 ? `Payment due ${d.credit_days} days from invoice date.` : "Payment terms, delivery timeline and freight as mutually agreed.", "This is an electronically generated document, no signature is required."];
  return (
    <article className="tdoc" aria-label={title}>
      <div className="tdoc-bar" />
      <div className="tdoc-pad">
        <header className="tdoc-head">
          <div><h1>{title}</h1>
            <table><tbody>
              <tr><td>{k === "po" ? "PO No" : challan ? "Challan No" : "Invoice No"}</td><td><b>{String(x.number)}</b></td></tr>
              <tr><td>{title.replace("Delivery ", "")} Date</td><td><b>{dt(x.date)}</b></td></tr>
              {ref && <tr><td>Reference</td><td><b>{ref}</b></td></tr>}
              {challan && <><tr><td>Order</td><td><b>{String(x.order_id)}</b></td></tr><tr><td>Vehicle / LR</td><td><b>{[x.vehicle, x.lr_no].filter(Boolean).join(" / ") || "—"}</b></td></tr></>}
              {k === "po" && x.eta_from && <tr><td>Expected</td><td><b>{dt(x.eta_from)} to {dt(x.eta_to)}</b></td></tr>}
            </tbody></table></div>
          <div className="tdoc-logo">{issuer.logo ? <img src={issuer.logo} alt={issuer.legal_name || "Logo"} /> : <div className="tdoc-logo-name">{issuer.legal_name}</div>}</div>
        </header>
        <section className="tdoc-parties">
          <div className="tdoc-card"><h3>{fromPartner ? "Ordered By" : "Billed By"}</h3><b>{issuer.legal_name}</b><div>{issuer.address}</div>
            <div>{issuer.gstin ? `GSTIN: ${issuer.gstin}` : ""}{issuer.pan ? `  ·  PAN: ${issuer.pan}` : ""}</div><div>State: {withCode(issuer.state, issuer.state_code)}</div>{issuer.email && <div>Email: {issuer.email}</div>}</div>
          <div className="tdoc-card"><h3>{fromPartner ? "Supplier" : challan ? "Shipped To" : "Billed To"}</h3><b>{buyer.legal_name}</b><div>{buyer.address}</div>
            <div>{buyer.gstin ? `GSTIN: ${buyer.gstin}` : ""}</div><div>State: {withCode(buyer.state, buyer.state_code)}</div>{buyer.email && <div>Email: {buyer.email}</div>}</div>
        </section>
        <section className="tdoc-supply"><div><b>Country of Supply:</b> India</div><div><b>Place of Supply:</b> {withCode(supply || buyer.state)}</div></section>
        <table className="tdoc-lines"><thead><tr><th>#</th><th>Item</th><th>HSN</th>{!challan && <th>GST</th>}{challan && <th>Cartons</th>}<th>Qty</th>{!challan && <><th>Rate</th><th>Taxable Amt</th>{intra ? <><th>CGST</th><th>SGST</th></> : <th>IGST</th>}<th>Total</th></>}</tr></thead>
          <tbody>{d.lines.map((l, i) => {
            const base = k === "invoice" ? l.amount : l.amount * (taxable / Math.max(n(x.taxable), 1)); const t = Math.round(base * pct) / 100;
            return <tr key={l.sku}><td>{i + 1}.</td><td>{l.name}</td><td>{l.hsn ?? "340130"}</td>{!challan && <td>{pct}%</td>}{challan && <td>{l.cartons}</td>}<td>{l.units}</td>
              {!challan && <><td>{m2(l.unit_price)}</td><td>{m2(base)}</td>{intra ? <><td>{m2(t / 2)}</td><td>{m2(t / 2)}</td></> : <td>{m2(t)}</td>}<td>{m2(base + t)}</td></>}</tr>;
          })}</tbody></table>
        {!challan && <section className="tdoc-sum">
          <div className="tdoc-words"><b>Total (in words) :</b><div>{rupeesInWords(total).replace(/^Rupees /, "").replace(/ Only$/, "").toUpperCase()} RUPEES ONLY</div>
            {!fromPartner && Array.isArray(x.applied) && x.applied.length > 0 && <div className="tdoc-sub">Schemes applied: {(x.applied as { name?: string }[]).map((a) => a.name).join(", ")}</div>}</div>
          <table><tbody>
            <tr><td>Taxable Amount</td><td>{m2(taxable)}</td></tr>
            {intra ? <><tr><td>CGST @ {pct / 2}%</td><td>{m2(k === "invoice" ? n(x.cgst) : half)}</td></tr><tr><td>SGST @ {pct / 2}%</td><td>{m2(k === "invoice" ? n(x.sgst) : half)}</td></tr></> : <tr><td>IGST @ {pct}%</td><td>{m2(tax)}</td></tr>}
            <tr className="tdoc-total"><td>Total (INR)</td><td>{m2(total)}</td></tr></tbody></table>
        </section>}
        {challan && <section className="tdoc-card tdoc-qc"><h3>Batch &amp; QA/QC</h3>
          {d.qc ? <div className="tdoc-bank"><div><span>BATCH CODE</span><b>{d.qc.batch_ref}</b></div><div><span>QA/QC STATUS</span><b>{(d.qc.qc_status || "").toUpperCase()}</b></div><div><span>PRODUCT</span><b>{d.qc.product}</b></div><div><span>BATCH SIZE</span><b>{d.qc.qty} L</b></div></div>
            : <div>{x.batch_ref ? `Batch ${String(x.batch_ref)} — QA/QC status not yet synced from the Batch system.` : "No batch recorded on this dispatch."}</div>}</section>}
        {(!fromPartner && !challan && (bank.account_no || bank.bank)) && <section className="tdoc-card tdoc-bankc"><h3>Bank Details</h3>
          <div className="tdoc-bank"><div><span>ACCOUNT NAME</span><b>{bank.account_name}</b></div><div><span>BANK</span><b>{bank.bank}</b></div><div><span>ACCOUNT NO.</span><b>{bank.account_no}</b></div><div><span>IFSC CODE</span><b>{bank.ifsc}</b></div></div></section>}
        <section className="tdoc-notes"><h3>Terms &amp; Notes</h3><ul>{noteLines.map((t, i) => <li key={i}>{t}</li>)}</ul></section>
      </div>
      <footer className="tdoc-foot">{issuer.legal_name}  ·  {String(issuer.address || "").split(",").slice(-3, -1).join(",").trim()}  ·  GSTIN: {issuer.gstin}  ·  {issuer.email}</footer>
    </article>
  );
}

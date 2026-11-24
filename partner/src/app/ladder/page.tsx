"use client";
import Shell from "@/components/Shell";
import { inr } from "@/lib/orders";

// Illustrative figures from the Partner Performance Matrix sheet, at the volume needed to earn each step.
const LADDER: { code: string; name: string; area: string; takes: string; sachet: number; bottle: number; lpd: number; income: number; open: boolean }[] = [
  { code: "DLR", name: "Authorized Dealer", area: "District", takes: "Non-exclusive by default · brand kit, samples and price list", sachet: 12, bottle: 20, lpd: 50, income: 92102, open: true },
  { code: "DST", name: "Authorized Distributor", area: "Cluster of 2–3 districts", takes: "Active dealer network · warehouse and working capital · priority supply", sachet: 13, bottle: 21, lpd: 25, income: 48794, open: true },
];
function Inner({ role }: { role: string }) {
  const here = role === "distributor" ? "DST" : "DLR";
  return (<><h1>Growth ladder</h1>
    <p className="sub">Every partner starts as a Dealer and can grow to Distributor. Later steps open when EarthLabs switches them on. Growth is earned on verified performance, and management approves each step. Your Partner ID stays the same all the way.</p>
    <div className="card"><table><thead><tr><th>Step</th><th>Territory</th><th>What it takes</th><th>Sachet / bottle margin</th><th>Litres a day*</th><th>Partner income a month*</th><th></th></tr></thead>
      <tbody>{LADDER.map((l, i) => <tr key={l.code}><td><b>{i + 1}. {l.name}</b></td><td>{l.area}</td><td>{l.takes}</td><td>{l.sachet}% / {l.bottle}%</td><td>{l.lpd}{l.code === "DST" ? " ⚠" : ""}</td><td>{inr(l.income)}</td><td>{here === l.code && <b>You are here</b>}</td></tr>)}</tbody></table></div>
    <p className="mini">*Illustrative figures from the Partner Performance Matrix sheet at the volume needed to earn each step. ⚠ The distributor figure is lower than the dealer&apos;s on the sheet and is awaiting confirmation. Stockist steps open later.</p></>);
}
export default function Page() { return <Shell page="ladder">{(p) => <Inner role={p.role} />}</Shell>; }

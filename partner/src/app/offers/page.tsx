"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Badge, Kpi, Msg, when } from "@/components/ui";
import { inr } from "@/lib/orders";
import { benefitText, conditions, creditSummary, type MyCredit, type Offer } from "@/lib/offers";

function Inner() {
  const [offers, setOffers] = useState<Offer[] | null>(null); const [credit, setCredit] = useState<MyCredit | null>(null); const [err, setErr] = useState("");
  useEffect(() => {
    supabase.from("schemes").select("id,name,kind,value,buy,get,min_cartons,min_value,first_order_only,valid_to").order("valid_to").limit(100)
      .then(({ data, error }) => { if (error) setErr(error.message); else setOffers((data as Offer[]) ?? []); });
    supabase.rpc("my_credit").then(({ data, error }) => { if (error) setErr(error.message); else setCredit(data as MyCredit); });
  }, []);
  const s = credit ? creditSummary(credit) : null;
  return (<><h1>Offers &amp; credit</h1>
    <p className="sub">Offers EarthLabs has opened for your business are applied automatically at checkout when your order qualifies. Your credit level shows how you pay today and how it can grow.</p>
    {err && <Msg kind="bad">{err}</Msg>}
    <div className="kpis"><Kpi label="Current level" value={s ? s.levelName : "…"} note={credit?.score != null ? `Latest score ${credit.score}` : undefined} /></div>
    <h2 style={{ marginTop: 18 }}>Offers open for you</h2>
    {offers === null ? <p className="mini">Loading…</p> : offers.length === 0
      ? <div className="card"><p>No offers are open for you right now. When EarthLabs opens an offer for your business it appears here.</p></div>
      : <div className="grid g2">{offers.map((o) => (
        <div className="card" key={o.id}><div className="row"><h3>{o.name}</h3><div className="sp" /><Badge kind="good">{benefitText(o)}</Badge></div>
          {conditions(o).length > 0 && <ul className="mini">{conditions(o).map((c) => <li key={c}>{c}</li>)}</ul>}
          <p className="mini">Valid until {when(o.valid_to)}</p>
          <Link className="btn pri" href="/orders/#place">Use on an order</Link></div>))}</div>}
    <h2 style={{ marginTop: 18 }}>Your credit</h2>
    {credit && s && <div className="card">
      <p>{s.payFirst ? <>You are on <b>pay and carry</b>: payment is made before goods are dispatched. Credit opens one step at a time, based on your payment record and score, and only after EarthLabs management approves it.</> : <>You are on <b>{s.levelName}</b>. Orders can be placed on credit up to your limit.</>}</p>
      {s.next && <p className="mini">Next step: <b>{s.next.n}</b>, which needs a score of {s.next.min} or more{s.scoreGap != null ? (s.scoreGap > 0 ? ` (${s.scoreGap} points to go)` : " (you meet the score)") : ""}.</p>}
      <div className="tw"><table className="t"><thead><tr><th>Level</th><th className="n">Limit</th><th className="n">Credit days</th><th className="n">Minimum score</th></tr></thead>
        <tbody>{credit.ladder.map((l, i) => <tr key={l.n} style={i === credit.level ? { background: "var(--mint)" } : undefined}><td>{i}. {l.n}{i === credit.level && <> <Badge kind="info">You are here</Badge></>}</td><td className="n">{l.limit ? inr(l.limit) : "Pay before dispatch"}</td><td className="n">{l.days || "n/a"}</td><td className="n">{l.min || "n/a"}</td></tr>)}</tbody></table></div></div>}
  </>);
}
export default function Page() { return <Shell page="offers">{(p) => (p.role === "dealer" || p.role === "distributor" ? <Inner /> : <div className="note">Offers &amp; credit is a partner screen. Staff manage offers under Products &amp; pricing and credit under Procurement.</div>)}</Shell>; }

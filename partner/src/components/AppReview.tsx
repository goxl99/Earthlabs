"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { REG_Q } from "@/lib/regQuestions";

type A = { id: string; type_code: string; business_name: string; district: string; gstin: string | null; answers: Record<string, string> | null };
type Other = { name: string; id: string; kind: "partner" | "applicant"; type_code?: string };
// Joining criteria for an Authorized Dealer, from the Partner Performance Matrix: [name, weight, zero-at, full-at, must-pass]
const CRIT: [string, number, number, number, number][] = [["Local reach (outlets served)", .35, 0, 30, .4], ["Financial capacity (working capital x)", .2, 1, 3, .3], ["Market reputation", .2, 0, 1, .5], ["Category fit", .15, 0, 1, 0], ["Team and delivery readiness", .1, 0, 1, .3]];
const PROMOTE = 0.7;
const clamp = (x: number) => Math.max(0, Math.min(1, x));

export default function AppReview({ a }: { a: A }) {
  const [others, setOthers] = useState<Other[]>([]);
  useEffect(() => {
    (async () => {
      const [p, ap] = await Promise.all([
        supabase.from("partners").select("id,name,type_code").eq("district", a.district).neq("status", "Terminated"),
        supabase.from("applications").select("id,business_name,type_code").eq("district", a.district).neq("id", a.id).not("status", "in", "(Rejected)").is("partner_id", null),
      ]);
      setOthers([...((p.data as { id: string; name: string; type_code: string }[]) ?? []).map((x) => ({ id: x.id, name: x.name, kind: "partner" as const, type_code: x.type_code })), ...((ap.data as { id: string; business_name: string }[]) ?? []).map((x) => ({ id: x.id, name: x.business_name, kind: "applicant" as const }))]);
    })();
  }, [a.id, a.district]);
  const an = a.answers ?? {}; const qs = REG_Q[a.type_code] ?? [];
  const yrs = Number(an.years) || 0; const wc = Number(an.wc) || 0; const outlets = Number(an.outlets) || 0;
  const fit = Math.min(1, yrs / 10) * 0.7 + (/soap|clean|fmcg|personal|home|hygiene/i.test(an.products ?? "") ? 0.3 : 0);
  const team = an.team === "Yes" || an.warehouse === "Yes" || a.type_code === "STK" ? 0.8 : 0.3;
  const actual: (number | null)[] = [outlets, wc, null, Math.round(fit * 100) / 100, team];
  const rows = CRIT.map((c, i) => { const v = actual[i]; const s = v == null ? null : clamp((v - c[2]) / (c[3] - c[2])); return { n: c[0], w: c[1], v, s, min: c[4], pass: s == null ? null : s >= c[4] }; });
  const known = rows.filter((r) => r.s != null).reduce((x, r) => x + r.w, 0);
  const score = known ? rows.reduce((x, r) => x + (r.s ?? 0) * (r.s == null ? 0 : r.w), 0) / known : null;
  const failed = rows.some((r) => r.pass === false);
  const risks: { lvl: "crit" | "warn"; t: string }[] = []; const checks: string[] = [];
  if (!a.gstin) checks.push("No GST number. Allowed for small dealers; not a blocker.");
  checks.push("Market reputation is not verified yet. It needs two trade references from the field team.");
  if (a.type_code === "DLR" && wc && wc < 1.2) risks.push({ lvl: "warn", t: `Working capital is only ${wc}x the opening order.` });
  if (an.excl === "Exclusive") risks.push({ lvl: "warn", t: "Asks for exclusive rights. Policy: everyone starts non-exclusive; exclusivity is earned." });
  const same = others.filter((o) => o.kind === "partner" && o.type_code === a.type_code);
  if (same.length) risks.push({ lvl: "warn", t: `Already served in ${a.district} by ${same.map((o) => o.name + " (" + o.id + ")").join(", ")}.` });
  const peers = others.filter((o) => o.kind === "applicant");
  if (peers.length) risks.push({ lvl: "warn", t: `Other open applicants in ${a.district}: ${peers.map((o) => o.name).join(", ")}.` });
  let rec = "Proceed to management review.";
  if (a.type_code === "DST") { const ok = Number(an.outlets) >= 150 && Number(an.wc) >= 2 && Number(an.dealers) >= 10; rec = ok ? "Authorized Distributor: the network supports it." : "Start as an Authorized Dealer and earn the step up. The network is below the distributor profile."; if (!ok) checks.push(`Network of ${an.outlets || "?"} outlets and ${an.dealers || "?"} dealers is below the distributor profile.`); }
  else if (risks.some((r) => r.lvl === "crit")) rec = "Do not approve until the red flags are cleared.";
  else if (failed) rec = "A must-pass criterion is below its minimum. Hold and develop before approving.";
  return (<div className="card" style={{ background: "var(--cream)", marginTop: 8 }}>
    <h3>Suggested category and territory</h3><p>{rec}<br /><span className="mini">Territory: {a.district}</span></p>
    <h3>Joining criteria (Partner Performance Matrix)</h3>
    <table><thead><tr><th>Criterion</th><th>Weight</th><th>Actual</th><th>Score</th><th>Minimum</th></tr></thead><tbody>{rows.map((r) => <tr key={r.n}><td>{r.n}</td><td>{Math.round(r.w * 100)}%</td><td>{r.v == null ? <i>Unverified</i> : r.v}</td><td>{r.s == null ? "—" : Math.round(r.s * 100) + "%"}</td><td>{r.min ? Math.round(r.min * 100) + "%" : "—"} {r.pass === false && <b style={{ color: "#9b3b2c" }}>below</b>}</td></tr>)}</tbody></table>
    <p>{score == null ? "Not enough verified data to score." : <>Joining score on verified items: <b>{(score * 100).toFixed(0)} / 100</b> (promote at {PROMOTE * 100}).</>}</p>
    {(risks.length > 0 || checks.length > 0) && <><h3>Risks and checks</h3><ul>{risks.map((r, i) => <li key={i} style={{ color: r.lvl === "crit" ? "#9b3b2c" : undefined }}>{r.lvl === "crit" ? "🔴 " : "🟠 "}{r.t}</li>)}{checks.map((c, i) => <li key={"c" + i}>🔎 {c}</li>)}</ul></>}
    <h3>Applicant&apos;s answers</h3>
    <table><tbody>{qs.map((q) => <tr key={q[0]}><td>{q[1]}</td><td><b>{an[q[0]] || "—"}</b></td></tr>)}{an.address && <tr><td>Business address</td><td><b>{an.address}</b></td></tr>}{an.other_areas && <tr><td>Other areas</td><td><b>{an.other_areas}</b></td></tr>}</tbody></table>
    <p className="mini">The score is a decision aid. Management approves every application.</p>
  </div>);
}

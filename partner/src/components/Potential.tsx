"use client";
import { useEffect, useState } from "react";
import { loadPotential, forDistrict, forRegion, fmtL, type PotData } from "@/lib/potential";

/** Shows the estimated daily demand when a district (and its region) is chosen. */
export default function PotentialCard({ district }: { district: string }) {
  const [d, setD] = useState<PotData | null>(null);
  useEffect(() => { loadPotential().then(setD).catch(() => setD(null)); }, []);
  if (!d || !district) return null;
  const row = forDistrict(d, district); if (!row) return null;
  const reg = forRegion(d, row.r); const a = d.assumptions;
  return (
    <div className="potential" role="status" aria-live="polite">
      <div className="pot-head"><span>Potential volume</span><small>{district} · {row.r}</small></div>
      <div className="pot-main"><b>{fmtL(row.lpd)}</b><span>litres per day</span></div>
      <div className="pot-grid">
        <div><small>Per month (25 days)</small><b>{fmtL(row.lpd * 25)} L</b></div>
        <div><small>People who can buy</small><b>{fmtL(row.buyers)}</b></div>
        <div><small>{row.r} region total</small><b>{fmtL(reg.lpd)} L/day</b></div>
      </div>
      <p className="pot-note">Indicative planning estimate{row.est ? " (district formed after the 2011 Census, population apportioned)" : ""}. Based on Census 2011 population grown to {a.year}, {a.elig}% eligible, buy rate {a.urban}% urban and {a.rural}% rural, {a.ml} ml per buyer a day. It is not a sales forecast.</p>
    </div>
  );
}

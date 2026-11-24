"use client";
import type { ReactNode } from "react";
/** Colour order used by every chart in the review prototype. */
export const PAL = ["#13595a", "#c89739", "#314452", "#239a9e", "#7b543b"];

export const Legend = ({ items }: { items: string[] }) => <div className="legend">{items.map((n, i) => <span key={n}><i style={{ background: PAL[i] }} />{n}</span>)}</div>;

/** Grouped bar chart, same geometry as the prototype's barChart(). */
export function BarChart({ labels, series, label, unit = "", h = 220 }: { labels: string[]; series: { n: string; v: number[] }[]; label: string; unit?: string; h?: number }) {
  const W = 560, m = { l: 42, r: 10, t: 10, b: 28 }, iw = W - m.l - m.r, ih = h - m.t - m.b;
  const peak = Math.max(0, ...series.flatMap((s) => s.v));
  const max = Math.max(1, Math.ceil(peak * 1.15));
  const gw = iw / Math.max(1, labels.length), bw = Math.min(22, (gw - 10) / series.length);
  return (<>
    <svg viewBox={`0 0 ${W} ${h}`} width="100%" role="img" aria-label={label}>
      {[0, 1, 2, 3, 4].map((i) => { const y = m.t + ih - (ih * i) / 4; return <g key={i}><line x1={m.l} x2={W - m.r} y1={y} y2={y} stroke="#e3e9e3" /><text x={m.l - 6} y={y + 4} fontSize="11" fill="#51626f" textAnchor="end">{Math.round(((max * i) / 4) * 10) / 10}</text></g>; })}
      {labels.map((l, i) => {
        const x0 = m.l + gw * i + (gw - bw * series.length - 2 * (series.length - 1)) / 2;
        return <g key={l}>{series.map((s, j) => { const bh = (ih * s.v[i]) / max, x = x0 + j * (bw + 2), top = m.t + ih - bh;
          return <path key={s.n} d={`M${x},${m.t + ih} V${top + 4} Q${x},${top} ${x + 4},${top} H${x + bw - 4} Q${x + bw},${top} ${x + bw},${top + 4} V${m.t + ih}Z`} fill={PAL[j]}><title>{`${s.n} · ${l}: ${s.v[i]}${unit}`}</title></path>; })}
          <text x={m.l + gw * i + gw / 2} y={h - 8} fontSize="11.5" fill="#51626f" textAnchor="middle">{l}</text></g>;
      })}
    </svg>
    {series.length > 1 && <Legend items={series.map((s) => s.n)} />}
  </>);
}
export const Bar = ({ v }: { v: number }) => <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, v))}%` }} /></div>;
export const Card = ({ title, children }: { title: string; children: ReactNode }) => <div className="card"><h3>{title}</h3>{children}</div>;

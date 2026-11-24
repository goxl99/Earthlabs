"use client";
import type { ReactNode } from "react";
/** Callout box. Same look as the review prototype (.note, .note.ok, .note.bad, .note.ai). */
export const Msg = ({ kind = "note", children }: { kind?: "note" | "ok" | "bad" | "ai"; children: ReactNode }) => <div className={kind === "note" ? "note" : `note ${kind}`}>{children}</div>;
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <div className="field"><label>{label}</label>{children}{hint && <small>{hint}</small>}</div>; }
/** Step indicator used by the registration wizard and application tracking. */
export function Steps({ items, current }: { items: string[]; current: number }) {
  return <div className="steps">{items.map((s, i) => <div key={s} className={`step ${i < current ? "done" : i === current ? "cur" : ""}`}><i>{i < current ? "✓" : i + 1}</i>{s}</div>)}</div>;
}
export const Badge = ({ kind = "", children }: { kind?: "good" | "warn" | "ser" | "crit" | "info" | "mute" | "gold" | ""; children: ReactNode }) => <span className={`badge${kind ? ` b-${kind}` : ""}`}>{children}</span>;
export const Kpi = ({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) => <div className="kpi"><div className="l">{label}</div><div className="v">{value}</div>{note && <div className="d">{note}</div>}</div>;
export const when = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");
export { DISTRICTS } from "@/lib/districts";

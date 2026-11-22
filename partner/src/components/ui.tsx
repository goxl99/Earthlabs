"use client";
import type { ReactNode } from "react";
export const Msg = ({ kind = "note", children }: { kind?: "note" | "ok" | "bad"; children: ReactNode }) => <div className="note" style={kind === "ok" ? { background: "#e7f4ee" } : kind === "bad" ? { background: "#fbe4e0" } : undefined}>{children}</div>;
export function Field({ label, children }: { label: string; children: ReactNode }) { return <div><label>{label}</label>{children}</div>; }
export const when = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");
export { DISTRICTS } from "@/lib/districts";

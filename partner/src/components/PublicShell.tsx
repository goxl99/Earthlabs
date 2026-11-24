"use client";
import Link from "next/link";
import type { ReactNode } from "react";
const LINKS = [["/", "Partner portal home", "home"], ["/register/", "Register", "register"], ["/track/", "Track application", "track"], ["/verify/", "Verify a certificate", "verify"]] as const;
/** Public website frame: top bar plus the four public screens, as in the review prototype. */
export default function PublicShell({ page, children }: { page: "home" | "register" | "track" | "verify"; children: ReactNode }) {
  return (<>
    <div className="top"><Link href="/" className="brand">EarthLabs<small>PARTNER &amp; DISTRIBUTION SYSTEM</small></Link></div>
    <div className="pubwrap">
      <div className="row" style={{ marginBottom: 10 }}>{LINKS.map(([h, l, k]) => <Link key={k} href={h} className={`btn ${page === k ? "pri" : ""}`}>{l}</Link>)}</div>
      {children}
    </div></>);
}

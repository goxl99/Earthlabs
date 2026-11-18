"use client";
import Shell from "@/components/Shell";
export default function Page() { return <Shell page="dashboard">{(p) => (<><h1>Welcome</h1><div className="card">Signed in as {p.role}. Dashboards by role arrive with each module (see docs/BUILD_PLAN.md).</div></>)}</Shell>; }

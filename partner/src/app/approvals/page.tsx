"use client";
import Shell from "@/components/Shell"; import List from "@/components/List";
const cols = [{ key: "kind", label: "Type" }, { key: "summary", label: "Request" }, { key: "status", label: "Status" }, { key: "created_at", label: "Raised" }];
export default function Page() { return <Shell page="approvals">{() => (<><h1>Approvals</h1><List table="change_requests" columns={cols} order="created_at" /></>)}</Shell>; }

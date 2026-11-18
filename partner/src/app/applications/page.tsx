"use client";
import Shell from "@/components/Shell"; import List from "@/components/List";
const cols = [{ key: "business_name", label: "Business" }, { key: "type_code", label: "Type" }, { key: "district", label: "District" }, { key: "status", label: "Status" }, { key: "created_at", label: "Received" }];
export default function Page() { return <Shell page="applications">{() => (<><h1>Applications</h1><List table="applications" columns={cols} order="created_at" /></>)}</Shell>; }

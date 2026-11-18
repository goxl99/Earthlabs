"use client";
import Shell from "@/components/Shell"; import List from "@/components/List";
const cols = [{ key: "id", label: "Partner ID" }, { key: "name", label: "Name" }, { key: "type_code", label: "Type" }, { key: "district", label: "District" }, { key: "status", label: "Status" }];
export default function Page() { return <Shell page="partners">{() => (<><h1>Partners</h1><List table="partners" columns={cols} order="id" /></>)}</Shell>; }

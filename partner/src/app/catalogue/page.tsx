"use client";
import Shell from "@/components/Shell"; import List from "@/components/List";
const cols = [{ key: "sku", label: "SKU" }, { key: "name", label: "Product" }, { key: "mrp", label: "MRP incl. GST" }, { key: "status", label: "Status" }, { key: "restricted", label: "Restricted" }];
export default function Page() { return <Shell page="catalogue">{() => (<><h1>Products &amp; pricing</h1><List table="skus" columns={cols} order="sku" /></>)}</Shell>; }

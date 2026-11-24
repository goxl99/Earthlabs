"use client";
import Shell from "@/components/Shell";
import { StaffVendorInvoices } from "@/components/VendorViews";
export default function Page() { return <Shell page="vendors">{(p) => p.role === "super_admin" || p.role === "accounts" ? <><h1>Vendor invoices</h1><StaffVendorInvoices /></> : <div className="note bad">Only Accounts and Super Admin can open vendor invoices.</div>}</Shell>; }

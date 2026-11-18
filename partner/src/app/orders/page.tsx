"use client";
import Shell from "@/components/Shell"; import Soon from "@/components/Soon";
export default function Page() { return <Shell page="orders">{() => <Soon title="Orders" day={3} note="Ordering with lead-time estimate, payment gate and audit." />}</Shell>; }

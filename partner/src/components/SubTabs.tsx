"use client";
import Link from "next/link";
/** Tab bar that moves between screens which the walkthrough shows as tabs of one page (Products & Pricing, Procurement). */
export default function SubTabs({ items, current }: { items: { href: string; label: string }[]; current: string }) {
  return <div className="tabs" role="tablist">{items.map((t) => <Link key={t.href} href={t.href} role="tab" aria-selected={t.href === current} className="tabbtn">{t.label}</Link>)}</div>;
}

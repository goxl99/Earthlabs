"use client";
import { VendorFrame, OrdersView } from "@/components/VendorViews";
export default function Page() { return <VendorFrame current="/vendor/orders/" title="Purchase orders"><OrdersView /></VendorFrame>; }

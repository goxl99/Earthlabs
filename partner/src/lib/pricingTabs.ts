/** The eight tabs of Products & Pricing, as the walkthrough lists them. Tabs 1 to 5 are views of /catalogue/, picked by the hash. */
export const PRICING_TABS: { href: string; label: string }[] = [
  { href: "/catalogue/", label: "Catalogue & SKUs" }, { href: "/catalogue/#sku-margins", label: "SKU-wise MRP & margins" },
  { href: "/catalogue/#access", label: "Partner-wise SKUs" }, { href: "/catalogue/#prices", label: "Price list by tier" },
  { href: "/catalogue/#margins", label: "Default margin slabs" }, { href: "/schemes/", label: "Schemes & GST" },
  { href: "/schemes/partners/", label: "Schemes by partner" }, { href: "/catalogue/policies/", label: "Policies & weights" },
];
export type CatTab = "products" | "skumargins" | "access" | "prices" | "margins";
export const HASH_TAB: Record<string, CatTab> = { "": "products", "sku-margins": "skumargins", access: "access", prices: "prices", margins: "margins" };

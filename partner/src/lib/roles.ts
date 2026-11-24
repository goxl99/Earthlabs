export type Role = "super_admin" | "sales" | "accounts" | "warehouse" | "dealer" | "distributor" | "vendor";

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin", sales: "Sales", accounts: "Accounts", warehouse: "Warehouse",
  dealer: "Dealer", distributor: "Distributor", vendor: "Vendor",
};

export type NavItem = { key: string; href: string; label: string; icon: string; group?: string; roles: Role[]; module?: string };

const STAFF: Role[] = ["super_admin", "sales", "accounts", "warehouse"];
const PARTNER: Role[] = ["dealer", "distributor"];

/** One place that decides who sees which screen. The database still enforces access with row-level security.
 *  Groups, icons and labels follow the approved review prototype (partner/prototype/review-prototype.html). */
export const NAV: NavItem[] = [
  // Internal portal
  { key: "dash", href: "/dashboard/", label: "Dashboard", icon: "▦", group: "Overview", roles: STAFF },
  { key: "appr", href: "/approvals/", label: "Approvals", icon: "✔", group: "Overview", roles: ["super_admin"] },
  { key: "apps", href: "/applications/", label: "Applications", icon: "✎", group: "Partners", module: "applications", roles: ["super_admin", "sales"] },
  { key: "map", href: "/territory/", label: "Territory Explorer", icon: "◉", group: "Partners", module: "territory", roles: ["super_admin", "sales"] },
  { key: "partners", href: "/partners/", label: "Partners", icon: "☷", group: "Partners", module: "partners", roles: ["super_admin", "sales", "accounts"] },
  { key: "agree", href: "/agreements/", label: "Agreements & Certificates", icon: "✍", group: "Partners", module: "agreements", roles: ["super_admin", "sales", "accounts"] },
  { key: "perf", href: "/performance/", label: "Performance Matrix", icon: "◔", group: "Partners", module: "performance", roles: ["super_admin", "sales", "accounts"] },
  { key: "catalog", href: "/catalogue/", label: "Products & Pricing", icon: "◆", group: "Commercial", module: "catalogue", roles: ["super_admin", "sales", "accounts"] },
  { key: "orders", href: "/orders/", label: "Orders", icon: "▤", group: "Commercial", module: "orders", roles: STAFF },
  { key: "inv", href: "/inventory/", label: "Inventory & Dispatch", icon: "⛟", group: "Commercial", module: "inventory", roles: ["super_admin", "sales", "warehouse"] },
  { key: "proc", href: "/procurement/", label: "Procurement & Raw Materials", icon: "⛁", group: "Commercial", module: "procurement", roles: ["super_admin", "accounts", "warehouse"] },
  { key: "wallet", href: "/wallet/", label: "Document wallet", icon: "▤", group: "Partners", roles: ["super_admin", "sales", "accounts"] },
  { key: "rfq", href: "/rfq/", label: "RFQs & quotes", icon: "❖", group: "Commercial", module: "rfq", roles: ["super_admin", "accounts", "warehouse"] },
  { key: "bom", href: "/bom/", label: "Material planning", icon: "▥", group: "Commercial", module: "bom", roles: ["super_admin", "accounts", "warehouse"] },
  { key: "fin", href: "/invoices/", label: "Invoices & Payments", icon: "₹", group: "Commercial", module: "invoices", roles: ["super_admin", "accounts", "sales"] },
  { key: "ai", href: "/ai/", label: "AI Intelligence", icon: "✦", group: "Intelligence", module: "ai", roles: STAFF },
  { key: "vendors", href: "/vendors/", label: "Vendors", icon: "⚙", group: "Intelligence", module: "vendors", roles: ["super_admin", "accounts", "warehouse"] },
  { key: "reports", href: "/reports/", label: "Reports & Exports", icon: "⇩", group: "Intelligence", module: "reports", roles: STAFF },
  { key: "notif", href: "/notifications/", label: "Notifications", icon: "✉", group: "Admin", roles: STAFF },
  { key: "users", href: "/users/", label: "Users & Access", icon: "☗", group: "Admin", roles: ["super_admin"] },
  { key: "audit", href: "/audit/", label: "Audit Trail", icon: "☰", group: "Admin", roles: ["super_admin"] },
  // Partner portal (dealer, distributor)
  { key: "pdash", href: "/dashboard/", label: "My dashboard", icon: "▦", roles: PARTNER },
  { key: "porder", href: "/orders/#place", label: "Place an order", icon: "＋", roles: PARTNER },
  { key: "pmyord", href: "/orders/", label: "My orders", icon: "▤", roles: PARTNER },
  { key: "pfin", href: "/invoices/", label: "Invoices & ledger", icon: "₹", roles: PARTNER },
  { key: "pperf", href: "/performance/", label: "My performance", icon: "◔", roles: PARTNER },
  { key: "pladder", href: "/ladder/", label: "Growth ladder", icon: "↗", roles: PARTNER },
  { key: "pagree", href: "/agreements/", label: "Agreement & certificate", icon: "✍", module: "agreements", roles: PARTNER },
  { key: "pnet", href: "/network/", label: "My network", icon: "⌘", module: "network", roles: ["distributor"] },
  { key: "poffers", href: "/offers/", label: "Offers & credit", icon: "✱", roles: PARTNER },
  { key: "pnotif", href: "/notifications/", label: "Notifications", icon: "✉", roles: PARTNER },
  // Vendor portal
  { key: "vdash", href: "/dashboard/", label: "My dashboard", icon: "▦", roles: ["vendor"] },
  { key: "vstock", href: "/vendor/", label: "Stock report", icon: "▣", roles: ["vendor"] },
  { key: "vro", href: "/vendor/orders/", label: "Purchase orders", icon: "✉", roles: ["vendor"] },
  { key: "vquote", href: "/vendor/quotes/", label: "Quotations", icon: "❝", roles: ["vendor"] },
  { key: "vinv", href: "/vendor/invoices/", label: "Invoices & payments", icon: "₹", roles: ["vendor"] },
  { key: "vperf", href: "/vendor/performance/", label: "My performance", icon: "★", roles: ["vendor"] },
  { key: "vnotif", href: "/notifications/", label: "Notifications", icon: "✉", roles: ["vendor"] },
];

export type Env = "internal" | "partner" | "vendor";
export const envOf = (r: Role): Env => (r === "vendor" ? "vendor" : r === "dealer" || r === "distributor" ? "partner" : "internal");
export const isStaff = (r: Role) => ["super_admin", "sales", "accounts", "warehouse"].includes(r);
export const navFor = (r: Role, modules: Record<string, boolean> = {}) => NAV.filter((n) => n.roles.includes(r) && !(n.module && modules[n.module] === false));

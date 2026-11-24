export type Role = "super_admin" | "sales" | "accounts" | "warehouse" | "dealer" | "distributor" | "vendor";

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin", sales: "Sales", accounts: "Accounts", warehouse: "Warehouse",
  dealer: "Dealer", distributor: "Distributor", vendor: "Vendor",
};

export type NavItem = { key: string; href: string; label: string; icon: string; group?: string; roles: Role[] };

const STAFF: Role[] = ["super_admin", "sales", "accounts", "warehouse"];
const PARTNER: Role[] = ["dealer", "distributor"];

/** One place that decides who sees which screen. The database still enforces access with row-level security.
 *  Groups, icons and labels follow the approved review prototype (partner/prototype/review-prototype.html). */
export const NAV: NavItem[] = [
  // Internal portal
  { key: "dash", href: "/dashboard/", label: "Dashboard", icon: "▦", group: "Overview", roles: STAFF },
  { key: "appr", href: "/approvals/", label: "Approvals", icon: "✔", group: "Overview", roles: ["super_admin"] },
  { key: "apps", href: "/applications/", label: "Applications", icon: "✎", group: "Partners", roles: ["super_admin", "sales"] },
  { key: "map", href: "/territory/", label: "Territory Explorer", icon: "◉", group: "Partners", roles: ["super_admin", "sales"] },
  { key: "partners", href: "/partners/", label: "Partners", icon: "☷", group: "Partners", roles: ["super_admin", "sales", "accounts"] },
  { key: "agree", href: "/agreements/", label: "Agreements & Certificates", icon: "✍", group: "Partners", roles: ["super_admin", "sales", "accounts"] },
  { key: "perf", href: "/performance/", label: "Performance Matrix", icon: "◔", group: "Partners", roles: ["super_admin", "sales", "accounts"] },
  { key: "catalog", href: "/catalogue/", label: "Products & Pricing", icon: "◆", group: "Commercial", roles: ["super_admin", "sales", "accounts"] },
  { key: "orders", href: "/orders/", label: "Orders", icon: "▤", group: "Commercial", roles: STAFF },
  { key: "inv", href: "/inventory/", label: "Inventory & Dispatch", icon: "⛟", group: "Commercial", roles: ["super_admin", "sales", "warehouse"] },
  { key: "proc", href: "/procurement/", label: "Procurement & Raw Materials", icon: "⛁", group: "Commercial", roles: ["super_admin", "accounts", "warehouse"] },
  { key: "fin", href: "/invoices/", label: "Invoices & Payments", icon: "₹", group: "Commercial", roles: ["super_admin", "accounts", "sales"] },
  { key: "ai", href: "/ai/", label: "AI Intelligence", icon: "✦", group: "Intelligence", roles: STAFF },
  { key: "vendors", href: "/vendors/", label: "Vendors", icon: "⚙", group: "Intelligence", roles: ["super_admin", "accounts", "warehouse"] },
  { key: "reports", href: "/reports/", label: "Reports & Exports", icon: "⇩", group: "Intelligence", roles: STAFF },
  { key: "notif", href: "/notifications/", label: "Notifications", icon: "✉", group: "Admin", roles: STAFF },
  { key: "users", href: "/users/", label: "Users & Access", icon: "☗", group: "Admin", roles: ["super_admin"] },
  { key: "audit", href: "/audit/", label: "Audit Trail", icon: "☰", group: "Admin", roles: ["super_admin"] },
  // Partner portal (dealer, distributor)
  { key: "pdash", href: "/dashboard/", label: "My dashboard", icon: "▦", roles: PARTNER },
  { key: "porder", href: "/orders/#place", label: "Place an order", icon: "＋", roles: PARTNER },
  { key: "pmyord", href: "/orders/", label: "My orders", icon: "▤", roles: PARTNER },
  { key: "pfin", href: "/invoices/", label: "Invoices & ledger", icon: "₹", roles: PARTNER },
  { key: "pperf", href: "/performance/", label: "My performance", icon: "◔", roles: PARTNER },
  { key: "pladder", href: "/performance/#ladder", label: "Growth ladder", icon: "↗", roles: PARTNER },
  { key: "pagree", href: "/agreements/", label: "Agreement & certificate", icon: "✍", roles: PARTNER },
  { key: "pnotif", href: "/notifications/", label: "Notifications", icon: "✉", roles: PARTNER },
  // Vendor portal
  { key: "vdash", href: "/dashboard/", label: "My dashboard", icon: "▦", roles: ["vendor"] },
  { key: "vstock", href: "/vendor/", label: "Stock report", icon: "▣", roles: ["vendor"] },
  { key: "vro", href: "/vendor/#release", label: "Release orders", icon: "✉", roles: ["vendor"] },
  { key: "vnotif", href: "/notifications/", label: "Notifications", icon: "✉", roles: ["vendor"] },
];

export type Env = "internal" | "partner" | "vendor";
export const envOf = (r: Role): Env => (r === "vendor" ? "vendor" : r === "dealer" || r === "distributor" ? "partner" : "internal");
export const isStaff = (r: Role) => ["super_admin", "sales", "accounts", "warehouse"].includes(r);
export const navFor = (r: Role) => NAV.filter((n) => n.roles.includes(r));

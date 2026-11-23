export type Role = "super_admin" | "sales" | "accounts" | "warehouse" | "dealer" | "distributor" | "vendor";

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin", sales: "Sales", accounts: "Accounts", warehouse: "Warehouse",
  dealer: "Dealer", distributor: "Distributor", vendor: "Vendor",
};

export type NavItem = { href: string; label: string; roles: Role[]; module?: string; grp?: string; ic?: string };

/** One place that decides who sees which screen. The database still enforces access with row-level security. */
export const NAV: NavItem[] = [
  { href: "/dashboard/", label: "Dashboard", roles: ["super_admin", "sales", "accounts", "warehouse", "dealer", "distributor", "vendor"], grp: "Overview", ic: "▦" },
  { href: "/approvals/", label: "Approvals", roles: ["super_admin"], grp: "Admin", ic: "✔" },
  { href: "/users/", label: "Users & access", roles: ["super_admin"], grp: "Admin", ic: "☗" },
  { href: "/audit/", label: "Audit trail", roles: ["super_admin"], grp: "Admin", ic: "☰" },
  { href: "/applications/", module: "applications", label: "Applications", roles: ["super_admin", "sales"], grp: "Partners", ic: "✎" },
  { href: "/partners/", module: "partners", label: "Partners", roles: ["super_admin", "sales", "accounts"], grp: "Partners", ic: "☷" },
  { href: "/territory/", module: "territory", label: "Territory", roles: ["super_admin", "sales"], grp: "Partners", ic: "◉" },
  { href: "/agreements/", module: "agreements", label: "Agreements", roles: ["super_admin", "sales", "accounts", "dealer", "distributor"], grp: "Partners", ic: "✍" },
  { href: "/notifications/", label: "Notifications", roles: ["super_admin", "sales", "accounts", "warehouse", "dealer", "distributor", "vendor"], grp: "Admin", ic: "✉" },
  { href: "/catalogue/", module: "catalogue", label: "Products & pricing", roles: ["super_admin", "sales", "accounts"], grp: "Commercial", ic: "◆" },
  { href: "/schemes/", module: "schemes", label: "Schemes", roles: ["super_admin", "sales"], grp: "Commercial", ic: "✱" },
  { href: "/inventory/", module: "inventory", label: "Inventory", roles: ["super_admin", "sales", "warehouse"], grp: "Commercial", ic: "⛟" },
  { href: "/invoices/", module: "invoices", label: "Invoices & ledger", roles: ["super_admin", "accounts", "sales", "dealer", "distributor"], grp: "Commercial", ic: "₹" },
  { href: "/vendors/", module: "vendors", label: "Vendors", roles: ["super_admin", "accounts", "warehouse"], grp: "Intelligence", ic: "⚙" },
  { href: "/procurement/", module: "procurement", label: "Procurement", roles: ["super_admin", "accounts", "warehouse"], grp: "Commercial", ic: "▣" },
  { href: "/performance/", module: "performance", label: "Performance", roles: ["super_admin", "sales", "accounts", "dealer", "distributor"], grp: "Partners", ic: "◔" },
  { href: "/reports/", module: "reports", label: "Reports", roles: ["super_admin", "sales", "accounts", "warehouse"], grp: "Intelligence", ic: "⇩" },
  { href: "/credit/", module: "credit", label: "Credit ladder", roles: ["super_admin", "sales", "accounts"], grp: "Commercial", ic: "◈" },
  { href: "/ai/", module: "ai", label: "AI Intelligence", roles: ["super_admin", "sales", "accounts", "warehouse"], grp: "Intelligence", ic: "✦" },
  { href: "/rfq/", module: "rfq", label: "RFQs & quotes", roles: ["super_admin", "accounts", "warehouse"], grp: "Intelligence", ic: "❖" },
  { href: "/bom/", module: "bom", label: "Material planning", roles: ["super_admin", "accounts", "warehouse"], grp: "Intelligence", ic: "▥" },
  { href: "/network/", module: "network", label: "My network", roles: ["super_admin", "sales", "dealer", "distributor"], grp: "Partners", ic: "⌘" },
  { href: "/vendor/", label: "Vendor portal", roles: ["vendor"], grp: "Vendor", ic: "⚙" },
  { href: "/orders/", module: "orders", label: "Orders", roles: ["super_admin", "sales", "accounts", "warehouse", "dealer", "distributor"], grp: "Commercial", ic: "▤" },
];

export const isStaff = (r: Role) => ["super_admin", "sales", "accounts", "warehouse"].includes(r);
export const navFor = (r: Role, modules: Record<string, boolean> = {}) => NAV.filter((n) => n.roles.includes(r) && !(n.module && modules[n.module] === false));

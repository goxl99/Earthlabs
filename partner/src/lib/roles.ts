export type Role = "super_admin" | "sales" | "accounts" | "warehouse" | "dealer" | "distributor" | "vendor";

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin", sales: "Sales", accounts: "Accounts", warehouse: "Warehouse",
  dealer: "Dealer", distributor: "Distributor", vendor: "Vendor",
};

export type NavItem = { href: string; label: string; roles: Role[] };

/** One place that decides who sees which screen. The database still enforces access with row-level security. */
export const NAV: NavItem[] = [
  { href: "/dashboard/", label: "Dashboard", roles: ["super_admin", "sales", "accounts", "warehouse", "dealer", "distributor", "vendor"] },
  { href: "/approvals/", label: "Approvals", roles: ["super_admin"] },
  { href: "/users/", label: "Users & access", roles: ["super_admin"] },
  { href: "/audit/", label: "Audit trail", roles: ["super_admin"] },
  { href: "/applications/", label: "Applications", roles: ["super_admin", "sales"] },
  { href: "/partners/", label: "Partners", roles: ["super_admin", "sales", "accounts"] },
  { href: "/territory/", label: "Territory", roles: ["super_admin", "sales"] },
  { href: "/agreements/", label: "Agreements", roles: ["super_admin", "sales", "accounts", "dealer", "distributor"] },
  { href: "/notifications/", label: "Notifications", roles: ["super_admin", "sales", "accounts", "warehouse", "dealer", "distributor", "vendor"] },
  { href: "/catalogue/", label: "Products & pricing", roles: ["super_admin", "sales", "warehouse"] },
  { href: "/schemes/", label: "Schemes", roles: ["super_admin", "sales"] },
  { href: "/inventory/", label: "Inventory", roles: ["super_admin", "sales", "warehouse"] },
  { href: "/invoices/", label: "Invoices & ledger", roles: ["super_admin", "accounts", "sales", "dealer", "distributor"] },
  { href: "/vendors/", label: "Vendors", roles: ["super_admin", "accounts", "warehouse"] },
  { href: "/procurement/", label: "Procurement", roles: ["super_admin", "accounts", "warehouse"] },
  { href: "/credit/", label: "Credit ladder", roles: ["super_admin", "sales", "accounts"] },
  { href: "/ai/", label: "AI Intelligence", roles: ["super_admin", "sales", "accounts", "warehouse"] },
  { href: "/vendor/", label: "Vendor portal", roles: ["vendor"] },
  { href: "/orders/", label: "Orders", roles: ["super_admin", "sales", "accounts", "warehouse", "dealer", "distributor"] },
];

export const isStaff = (r: Role) => ["super_admin", "sales", "accounts", "warehouse"].includes(r);
export const navFor = (r: Role) => NAV.filter((n) => n.roles.includes(r));

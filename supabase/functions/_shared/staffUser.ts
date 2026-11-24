// Validation for the create-staff-user function. Pure, so it is unit tested from the partner project.
export const STAFF_ROLES = ["super_admin", "sales", "accounts", "warehouse"] as const;
export type StaffInput = { email: string; full_name: string; role: string; department: string | null; territory: string | null };
export function checkStaffInput(b: Record<string, unknown>): { ok: true; v: StaffInput } | { ok: false; error: string } {
  const email = String(b.email ?? "").trim().toLowerCase();
  const full_name = String(b.full_name ?? "").trim();
  const role = String(b.role ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: "Enter a valid e-mail address" };
  if (full_name.length < 2) return { ok: false, error: "Enter the person's name" };
  if (!(STAFF_ROLES as readonly string[]).includes(role)) return { ok: false, error: "Choose Super Admin, Sales, Accounts or Warehouse. Partners and vendors get logins from their own approval." };
  const clean = (x: unknown) => { const s = String(x ?? "").trim().slice(0, 80); return s || null; };
  return { ok: true, v: { email, full_name: full_name.slice(0, 120), role, department: clean(b.department), territory: clean(b.territory) } };
}

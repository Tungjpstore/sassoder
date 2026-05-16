import type { StaffRoleTemplateCode } from "@/lib/staff-permissions";

export const ROLE_TEMPLATE_CODES = [
  "owner",
  "manager",
  "cashier",
  "waiter",
  "kitchen",
  "marketing",
  "accountant",
  "delivery"
] as const satisfies readonly StaffRoleTemplateCode[];

import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type PublicTenantAdminScope =
  | "customer_order_access"
  | "customer_order_create"
  | "customer_order_history"
  | "customer_order_read"
  | "remote_order_access"
  | "remote_order_create"
  | "remote_order_history"
  | "remote_order_read"
  | "service_request_create";

const allowedScopes = new Set<PublicTenantAdminScope>([
  "customer_order_access",
  "customer_order_create",
  "customer_order_history",
  "customer_order_read",
  "remote_order_access",
  "remote_order_create",
  "remote_order_history",
  "remote_order_read",
  "service_request_create"
]);

export type PublicTenantAdminClient = ReturnType<typeof createAdminSupabaseClient>;

export function createPublicTenantAdminClient(scope: PublicTenantAdminScope) {
  if (!allowedScopes.has(scope)) {
    throw new Error(`Unsupported public tenant admin scope: ${scope}`);
  }

  return createAdminSupabaseClient();
}

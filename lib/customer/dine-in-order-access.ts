import type { OrderStatus, TableBillStatus } from "@/types/domain";

const activePublicOrderStatuses = new Set<OrderStatus>([
  "pending",
  "ordering",
  "completed",
  "waiting_payment",
  "waiting_confirm"
]);

const activePublicBillStatuses = new Set<TableBillStatus>(["open", "waiting_payment", "waiting_confirm"]);

export function canAccessDineInOrder(input: {
  customerSessionId?: string | null;
  orderCustomerSessionId?: string | null;
  orderStatus: OrderStatus;
  billCustomerSessionId?: string | null;
  billStatus?: TableBillStatus | null;
  hasValidTableQr: boolean;
}) {
  const sessionMatchesOrder = Boolean(input.customerSessionId && input.orderCustomerSessionId === input.customerSessionId);
  const sessionMatchesBill = Boolean(input.customerSessionId && input.billCustomerSessionId === input.customerSessionId);
  if (sessionMatchesOrder || sessionMatchesBill) return true;

  if (!input.hasValidTableQr) return false;
  if (activePublicOrderStatuses.has(input.orderStatus)) return true;
  return Boolean(input.billStatus && activePublicBillStatuses.has(input.billStatus));
}

import type { OrderStatus, TableBillStatus } from "@/types/domain";

const activePublicOrderStatuses = new Set<OrderStatus>([
  "pending",
  "ordering",
  "completed",
  "waiting_payment",
  "waiting_confirm"
]);

const activePublicBillStatuses = new Set<TableBillStatus>(["open", "waiting_payment", "waiting_confirm"]);

const mutationSensitiveStatuses = new Set<OrderStatus>(["waiting_payment", "waiting_confirm", "paid"]);
const mutationSensitiveBillStatuses = new Set<TableBillStatus>(["waiting_payment", "waiting_confirm", "paid"]);

export type DineInOrderAccessInput = {
  customerSessionId?: string | null;
  orderCustomerSessionId?: string | null;
  orderStatus: OrderStatus;
  billCustomerSessionId?: string | null;
  billStatus?: TableBillStatus | null;
  hasValidTableQr: boolean;
};

export type DineInOrderAccessOptions = {
  /**
   * Payment/checkout mutations: when the order or bill already has a customer session,
   * require a matching session (QR alone is not enough).
   */
  requireSessionMatchForBoundIdentity?: boolean;
};

export function canAccessDineInOrder(input: DineInOrderAccessInput, options: DineInOrderAccessOptions = {}) {
  const sessionMatchesOrder = Boolean(input.customerSessionId && input.orderCustomerSessionId === input.customerSessionId);
  const sessionMatchesBill = Boolean(input.customerSessionId && input.billCustomerSessionId === input.customerSessionId);
  if (sessionMatchesOrder || sessionMatchesBill) return true;

  const hasBoundIdentity = Boolean(input.orderCustomerSessionId || input.billCustomerSessionId);
  const isSensitiveState =
    mutationSensitiveStatuses.has(input.orderStatus) ||
    Boolean(input.billStatus && mutationSensitiveBillStatuses.has(input.billStatus));

  if (options.requireSessionMatchForBoundIdentity && hasBoundIdentity && isSensitiveState) {
    return false;
  }

  if (!input.hasValidTableQr) return false;
  if (activePublicOrderStatuses.has(input.orderStatus)) return true;
  return Boolean(input.billStatus && activePublicBillStatuses.has(input.billStatus));
}

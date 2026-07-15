/**
 * Pure view helpers for dine-in order presentation and payment totals.
 */

export type DineInPayableOrder = {
  status: string;
  total: number;
  paymentMethod?: "QR" | "CASH" | null;
  bill?: {
    total: number;
    status?: string | null;
    paymentMethod?: "QR" | "CASH" | null;
  } | null;
};

export type DineInOrderEntry = {
  order: DineInPayableOrder & {
    id: string;
    createdAt?: string | null;
  };
};

export function isOpenDineInOrderStatus(status: string) {
  return ["pending", "ordering", "completed", "waiting_payment", "waiting_confirm"].includes(status);
}

export function dineInPayableTotal(entry: DineInOrderEntry) {
  return entry.order.bill?.total ?? entry.order.total;
}

export function dineInPayableMethod(entry: DineInOrderEntry) {
  return entry.order.bill?.paymentMethod ?? entry.order.paymentMethod ?? null;
}

export function isDineInOrderPaid(entry: DineInOrderEntry | null) {
  return Boolean(entry && (entry.order.status === "paid" || entry.order.bill?.status === "paid"));
}

export function shortDineInOrderCode(entry: DineInOrderEntry | null) {
  if (!entry) return "#OD";
  const created = entry.order.createdAt ? new Date(entry.order.createdAt) : new Date();
  const yy = String(created.getFullYear()).slice(-2);
  const mm = String(created.getMonth() + 1).padStart(2, "0");
  const dd = String(created.getDate()).padStart(2, "0");
  return `#OD${yy}${mm}${dd}-${entry.order.id.slice(0, 3).toUpperCase()}`;
}

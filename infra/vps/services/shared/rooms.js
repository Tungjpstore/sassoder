export function restaurantRoom(restaurantId) {
  return `restaurant:${restaurantId}`;
}

export function tableRoom(restaurantId, tableId) {
  return `restaurant:${restaurantId}:table:${tableId}`;
}

export function orderRoom(orderId) {
  return `order:${orderId}`;
}

export const realtimeEvents = [
  "new_order",
  "order_confirmed",
  "kitchen_update",
  "payment_update",
  "staff_notification",
  "table_status_change"
];

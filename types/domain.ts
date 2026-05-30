export type UserRole = "ADMIN" | "STAFF";
export type BusinessType = "CAFE" | "RESTAURANT" | "FAST_FOOD" | "BAR" | "OTHER";

export type OrderStatus =
  | "pending"
  | "ordering"
  | "waiting_payment"
  | "waiting_confirm"
  | "paid"
  | "completed"
  | "cancelled";

export type PaymentMethod = "QR" | "CASH";
export type PaymentStatus = "unpaid" | "waiting_payment" | "waiting_confirm" | "paid" | "failed" | "refunded";
export type OrderBranchAssignmentSource = "delivery_quote" | "single_branch" | "primary_branch" | "manual" | "legacy_backfill";
export type OnlinePaymentMode = "PAY_AFTER" | "QR_PREPAID";
export type FulfillmentType = "DINE_IN" | "PICKUP" | "DELIVERY";
export type DeliveryStatus = "none" | "requested" | "accepted" | "out_for_delivery" | "delivered" | "rejected";
export type TableBillStatus = "open" | "waiting_payment" | "waiting_confirm" | "paid" | "cancelled";

export type PaymentLogStatus = "pending" | "waiting_confirm" | "confirmed" | "failed" | "cancelled" | "refunded";
export type ServiceRequestStatus = "open" | "acknowledged" | "resolved" | "cancelled";
export type ReservationStatus =
  | "draft"
  | "pending"
  | "holding"
  | "waiting_deposit_confirm"
  | "confirmed"
  | "checked_in"
  | "seated"
  | "completed"
  | "cancelled"
  | "rejected"
  | "expired"
  | "no_show";
export type ReservationDepositStatus =
  | "none"
  | "required"
  | "waiting_payment"
  | "waiting_confirm"
  | "paid"
  | "refundable"
  | "forfeited"
  | "refunded";
export type ReservationDepositType = "FIXED" | "PER_PERSON";
export type InventoryMovementType =
  | "receive"
  | "deduct_sale"
  | "adjust_increase"
  | "adjust_decrease"
  | "waste"
  | "rollback"
  | "transfer_in"
  | "transfer_out"
  | "expired"
  | "internal_use"
  | "supplier_return"
  | "reserve"
  | "release_reserve";
export type InventoryCountStatus = "draft" | "submitted" | "applied" | "cancelled";

export type SessionProfile = {
  userId: string;
  email: string;
  role: UserRole;
  accountStatus?: "active" | "blocked";
  restaurantId: string;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    businessType?: BusinessType | null;
    platformStatus?: "active" | "suspended" | "deleted";
  };
};

export type OrderDto = {
  id: string;
  branchId?: string | null;
  branchAssignmentSource?: OrderBranchAssignmentSource | null;
  status: OrderStatus;
  subtotal: number;
  discountAmount: number;
  promotionId?: string | null;
  promotionCode?: string | null;
  total: number;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  paidAt?: string | null;
  fulfillmentType: FulfillmentType;
  customerName?: string | null;
  customerPhone?: string | null;
  customerNote?: string | null;
  deliveryAddress?: string | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  deliveryDistanceKm?: number | null;
  deliveryFee?: number;
  serviceFee?: number;
  deliveryStatus?: DeliveryStatus;
  deliveryRouteGeometry?: {
    type: "LineString";
    coordinates: number[][];
  } | null;
  deliveryRouteDurationMinutes?: number | null;
  deliveryQuoteSnapshot?: import("@/types/supabase").Json | null;
  deliveryTrackingUpdatedAt?: string | null;
  deliveryCourierId?: string | null;
  deliveryAssignedAt?: string | null;
  deliveryCourier?: {
    id: string;
    name: string;
    phone?: string | null;
    status?: "offline" | "available" | "assigned" | "busy" | "paused";
  } | null;
  deliveryCourierLocation?: {
    lat: number;
    lng: number;
    accuracyMeters?: number | null;
    headingDegrees?: number | null;
    speedMps?: number | null;
    capturedAt?: string | null;
  } | null;
  deliveryTrackingSnapshot?: import("@/services/delivery/tracking-snapshot-service").DeliveryTrackingSnapshot | null;
  bill: {
    id: string;
    status: TableBillStatus;
    total: number;
    paymentMethod: PaymentMethod | null;
    createdAt: string;
    updatedAt?: string | null;
    paidAt?: string | null;
    closedAt?: string | null;
  } | null;
  createdAt: string;
  updatedAt?: string | null;
  acceptedAt?: string | null;
  servedAt?: string | null;
  serviceDueAt?: string | null;
  paymentConfig?: {
    bankCode: string | null;
    bankAccount: string | null;
    bankAccountName: string | null;
  };
  restaurant?: {
    name: string | null;
    address: string | null;
    storeLat: number | null;
    storeLng: number | null;
  };
  table: { id?: string; name: string } | null;
  items: Array<{
    quantity: number;
    price: number;
    modifiers?: Array<{
      groupId: string;
      groupName: string;
      optionId: string;
      optionName: string;
      priceDelta: number;
      quantity: number;
      lineTotal: number;
    }>;
    modifierSummary?: string | null;
    note: string | null;
    menuItem: { id?: string; name: string } | null;
  }>;
};

export type ServiceRequestDto = {
  id: string;
  restaurantId: string;
  branchId?: string | null;
  tableId: string | null;
  tableName: string | null;
  customerSessionId: string | null;
  type: "CALL_STAFF";
  status: ServiceRequestStatus;
  message: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
};

export type ReservationDto = {
  id: string;
  branchId?: string | null;
  status: ReservationStatus;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  partySize: number;
  startsAt: string;
  endsAt: string;
  holdExpiresAt: string | null;
  depositRequiredAmount: number;
  depositPaidAmount: number;
  depositStatus: ReservationDepositStatus;
  paymentMethod: PaymentMethod | null;
  customerNote: string | null;
  internalNote: string | null;
  preferredTableAreaId: string | null;
  preferredSeatingZone: "indoor" | "outdoor" | "mixed" | string | null;
  preferredTableKind: "standard" | "vip" | "bar" | "community" | string | null;
  source: string;
  createdAt: string;
  updatedAt: string | null;
  confirmedAt: string | null;
  checkedInAt: string | null;
  seatedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  rejectedAt: string | null;
  expiredAt: string | null;
  noShowAt: string | null;
  seatedTableBillId: string | null;
  tables: Array<{
    id: string;
    branchId?: string | null;
    name: string;
    area: string;
    capacity: number;
    tableAreaId?: string | null;
    floorLabel?: string | null;
    seatingZone?: "indoor" | "outdoor" | "mixed" | string | null;
    tableKind?: "standard" | "vip" | "bar" | "community" | string | null;
  }>;
};

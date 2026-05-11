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
export type OnlinePaymentMode = "PAY_AFTER" | "QR_PREPAID";
export type FulfillmentType = "DINE_IN" | "PICKUP" | "DELIVERY";
export type DeliveryStatus = "none" | "requested" | "accepted" | "out_for_delivery" | "delivered" | "rejected";
export type TableBillStatus = "open" | "waiting_payment" | "waiting_confirm" | "paid" | "cancelled";

export type PaymentLogStatus = "pending" | "waiting_confirm" | "confirmed" | "failed" | "cancelled";
export type ServiceRequestStatus = "open" | "acknowledged" | "resolved" | "cancelled";
export type ReservationStatus =
  | "draft"
  | "holding"
  | "waiting_deposit_confirm"
  | "confirmed"
  | "seated"
  | "completed"
  | "cancelled"
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
    note: string | null;
    menuItem: { id?: string; name: string } | null;
  }>;
};

export type ServiceRequestDto = {
  id: string;
  restaurantId: string;
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
  source: string;
  createdAt: string;
  updatedAt: string | null;
  confirmedAt: string | null;
  seatedAt: string | null;
  cancelledAt: string | null;
  expiredAt: string | null;
  noShowAt: string | null;
  seatedTableBillId: string | null;
  tables: Array<{
    id: string;
    name: string;
    area: string;
    capacity: number;
  }>;
};

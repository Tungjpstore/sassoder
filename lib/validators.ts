import { z } from "zod";
import { STAFF_PERMISSION_KEYS, staffPermissionProfiles } from "@/lib/staff-permissions";
import { authPasswordMaxLength, authPasswordMinLength, authPasswordPolicyPatterns } from "@/lib/auth-password-policy";

export const paymentMethodSchema = z.enum(["QR", "CASH"]);
export const fulfillmentTypeSchema = z.enum(["DINE_IN", "PICKUP", "DELIVERY"]);
export const businessTypeSchema = z.enum(["CAFE", "RESTAURANT", "FAST_FOOD", "BAR", "OTHER"]);

function normalizeNumberInput(value: unknown, emptyValue: unknown) {
  const rawValue = typeof value === "string" ? value.trim() : value;
  if (rawValue === "" || rawValue === null || rawValue === undefined) return emptyValue;
  if (typeof rawValue === "boolean") return Number.NaN;
  return rawValue;
}

const requiredCoordinateInput = (min: number, max: number) =>
  z.preprocess(
    (value) => normalizeNumberInput(value, Number.NaN),
    z.coerce.number().finite().min(min).max(max)
  ) as z.ZodType<number>;
const promotionCodeSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const normalized = value.trim().toUpperCase();
    return normalized.length > 0 ? normalized : undefined;
  },
  z.string().regex(/^[A-Z0-9_-]{3,32}$/).optional()
);
const modifierSelectionSchema = z.object({
  groupId: z.string().uuid(),
  optionId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(50).optional()
});
const optionalCoordinateInput = (min: number, max: number) =>
  z.preprocess(
    (value) => normalizeNumberInput(value, undefined),
    z.coerce.number().finite().min(min).max(max).optional()
  );

const nullableCoordinateInput = (min: number, max: number) =>
  z.preprocess(
    (value) => normalizeNumberInput(value, null),
    z.coerce.number().finite().min(min).max(max).nullable()
  );

const optionalIntegerInput = (min: number, max: number) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().int().min(min).max(max).optional()
  );

const optionalNumberInput = (schema: z.ZodNumber) =>
  z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());

const jsonArrayInput = <T extends z.ZodTypeAny>(schema: T, max: number) =>
  z.preprocess((value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string" || value.trim().length === 0) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, z.array(schema).max(max));

const deliveryAreaPointSchema = z.object({
  lat: requiredCoordinateInput(-90, 90),
  lng: requiredCoordinateInput(-180, 180)
});

const deliveryFeeTierSchema = z.object({
  id: z.string().trim().max(80).optional().or(z.literal("")),
  label: z.string().trim().max(80).optional().or(z.literal("")),
  upToKm: z.preprocess(
    (value) => (value === "" || value === null ? null : value),
    z.coerce.number().finite().min(0).max(200).nullable()
  ),
  fee: z.preprocess(
    (value) => (value === "" || value === null ? null : value),
    z.coerce.number().int().min(0).max(10000000).nullable()
  ),
  contact: z.coerce.boolean().optional()
}).refine((tier) => Boolean(tier.contact) || tier.fee !== null, {
  message: "Mỗi mức phí phải có giá tiền hoặc đánh dấu Liên hệ",
  path: ["fee"]
});

const deliveryExclusionZoneSchema = z.object({
  id: z.string().trim().max(80).optional().or(z.literal("")),
  name: z.string().trim().min(1).max(120),
  areaKm2: z.coerce.number().finite().min(0).max(500).optional().default(0),
  polygon: z.array(deliveryAreaPointSchema).max(30).optional().default([])
});

export const createOrderSchema = z.object({
  restaurantSlug: z.string().min(1),
  tableId: z.string().min(1),
  tableAccessToken: z.string().regex(/^[a-f0-9]{40}$/i).optional(),
  customerSessionId: z.string().uuid().optional(),
  customerNote: z.string().max(300).optional(),
  promotionCode: promotionCodeSchema,
  idempotencyKey: z.string().min(8).max(120).optional(),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        quantity: z.coerce.number().int().min(1).max(50),
        note: z.string().max(200).optional(),
        modifiers: z.array(modifierSelectionSchema).max(30).optional()
      })
    )
    .min(1)
    .max(50)
});

export const checkoutOrderSchema = z.object({
  restaurantSlug: z.string().min(1),
  tableId: z.string().min(1),
  tableAccessToken: z.string().regex(/^[a-f0-9]{40}$/i).optional(),
  customerSessionId: z.string().uuid().optional(),
  paymentMethod: paymentMethodSchema
});

export const customerOrderAccessSchema = z.object({
  restaurantSlug: z.string().min(1),
  tableId: z.string().min(1),
  tableAccessToken: z.string().regex(/^[a-f0-9]{40}$/i).optional(),
  customerSessionId: z.string().uuid().optional()
});

export const remoteOrderAccessSchema = z.object({
  restaurantSlug: z.string().min(1),
  customerSessionId: z.string().uuid()
});

export const remoteOrderSchema = z.object({
  restaurantSlug: z.string().min(1),
  branchId: z.string().uuid().optional().or(z.literal("")),
  customerSessionId: z.string().uuid(),
  customerNote: z.string().max(300).optional(),
  idempotencyKey: z.string().uuid(),
  promotionCode: promotionCodeSchema,
  fulfillmentType: z.enum(["PICKUP", "DELIVERY"]),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().regex(/^[0-9+() .-]{6,24}$/),
  deliveryAddress: z.string().trim().max(240).optional().or(z.literal("")),
  deliveryLat: optionalCoordinateInput(-90, 90),
  deliveryLng: optionalCoordinateInput(-180, 180),
  items: createOrderSchema.shape.items
});

export const deliveryQuoteSchema = z.object({
  restaurantSlug: z.string().min(1),
  subtotal: z.coerce.number().int().min(0).max(100000000),
  deliveryAddress: z.string().trim().max(240).optional().or(z.literal("")),
  deliveryLat: optionalCoordinateInput(-90, 90),
  deliveryLng: optionalCoordinateInput(-180, 180)
});

export const publicOrderHistorySchema = z.object({
  restaurantSlug: z.string().min(1),
  tableId: z.string().min(1),
  tableAccessToken: z.string().regex(/^[a-f0-9]{40}$/i).optional(),
  customerSessionId: z.string().uuid().optional()
});

export const remoteOrderHistorySchema = z.object({
  restaurantSlug: z.string().min(1),
  customerSessionId: z.string().uuid()
});

export const serviceRequestSchema = z.object({
  restaurantSlug: z.string().min(1),
  tableId: z.string().uuid(),
  tableAccessToken: z.string().regex(/^[a-f0-9]{40}$/i).optional(),
  customerSessionId: z.string().uuid().optional(),
  message: z.string().trim().max(160).optional().or(z.literal(""))
});

export const serviceTimerSchema = z.object({
  minutes: z.coerce.number().int().min(1).max(180)
});

export const deliveryStatusSchema = z.object({
  status: z.enum(["accepted", "out_for_delivery", "delivered", "rejected"])
});

export const deliveryLocationSchema = z.object({
  lat: requiredCoordinateInput(-90, 90),
  lng: requiredCoordinateInput(-180, 180),
  accuracyMeters: z.coerce.number().finite().min(0).max(5000).optional() as z.ZodType<number | undefined>,
  headingDegrees: z.coerce.number().finite().min(0).lt(360).optional() as z.ZodType<number | undefined>,
  speedMps: z.coerce.number().finite().min(0).max(80).optional() as z.ZodType<number | undefined>,
  source: z.enum(["admin_dashboard", "driver_app", "manual", "system"]).optional(),
  capturedAt: z.string().datetime().optional() as z.ZodType<string | undefined>,
  note: z.string().trim().max(240).optional().or(z.literal(""))
});

export const deliveryCourierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^[0-9+() .-]{6,24}$/).optional().or(z.literal(""))
});

export const deliveryCourierAssignmentSchema = z.object({
  courierId: z.string().uuid().nullable().optional()
});

export const adminOrderIdSchema = z.object({
  orderId: z.string().uuid()
});

export const adminOrderItemParamsSchema = z.object({
  orderId: z.string().uuid(),
  itemId: z.string().uuid()
});

export const orderItemPreparedSchema = z.object({
  prepared: z.boolean()
});

export const adminOrderCleanupSchema = z.object({
  mode: z.enum(["cancel", "delete_test"]),
  statuses: z
    .array(z.enum(["pending", "ordering", "waiting_payment", "waiting_confirm", "paid", "completed", "cancelled"]))
    .min(1)
    .max(7)
    .optional(),
  olderThanMinutes: z.coerce.number().int().min(0).max(10080).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});

const reservationSeatingZoneInput = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.enum(["indoor", "outdoor", "mixed"]).optional()
);

const reservationTableKindInput = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.enum(["standard", "vip", "bar", "community"]).optional()
);

const reservationTableAreaInput = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.string().uuid().optional()
);

export const reservationAvailabilitySchema = z.object({
  restaurantSlug: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  partySize: z.coerce.number().int().min(1).max(100),
  preferredTableAreaId: reservationTableAreaInput,
  preferredSeatingZone: reservationSeatingZoneInput,
  preferredTableKind: reservationTableKindInput
});

export const createReservationSchema = z.object({
  restaurantSlug: z.string().min(1),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().regex(/^[0-9+() .-]{6,24}$/),
  customerEmail: z.string().trim().email().optional().or(z.literal("")),
  partySize: z.coerce.number().int().min(1).max(100),
  startsAt: z.string().datetime(),
  customerNote: z.string().trim().max(300).optional().or(z.literal("")),
  idempotencyKey: z.string().uuid().optional(),
  tableId: reservationTableAreaInput,
  preferredTableAreaId: reservationTableAreaInput,
  preferredSeatingZone: reservationSeatingZoneInput,
  preferredTableKind: reservationTableKindInput
});

export const reservationFloorSchema = z.object({
  restaurantSlug: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startsAt: z.string().datetime(),
  partySize: z.coerce.number().int().min(1).max(100)
});

export const publicReservationAccessSchema = z.object({
  restaurantSlug: z.string().min(1).optional(),
  token: z.string().min(24).max(160)
});

export const reservationIdSchema = z.object({
  reservationId: z.string().uuid()
});

export const reservationMoveTableSchema = z.object({
  tableId: z.string().uuid()
});

export const reservationSetTablesSchema = z.object({
  tableIds: z.array(z.string().uuid()).min(1).max(8).refine((tableIds) => new Set(tableIds).size === tableIds.length, {
    message: "Không chọn trùng bàn"
  })
});

export const reservationTablePreflightSchema = reservationSetTablesSchema;

export const reservationRescheduleSchema = z.object({
  startsAt: z.string().datetime(),
  tableId: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.string().uuid().optional()
  )
});

export const reservationSettingsSchema = z.object({
  reservationsEnabled: z.coerce.boolean().optional(),
  reservationDepositEnabled: z.coerce.boolean().optional(),
  reservationDepositType: z.enum(["FIXED", "PER_PERSON"]),
  reservationDepositValue: z.coerce.number().int().min(0).max(100000000),
  reservationHoldMinutes: z.coerce.number().int().min(1).max(1440),
  reservationDurationMinutes: z.coerce.number().int().min(15).max(480),
  reservationBufferMinutes: z.coerce.number().int().min(0).max(240),
  reservationMinNoticeMinutes: z.coerce.number().int().min(0).max(10080),
  reservationMaxDaysAhead: z.coerce.number().int().min(1).max(365),
  reservationArrivalGraceMinutes: z.coerce.number().int().min(0).max(240)
}).refine((value) => !value.reservationDepositEnabled || value.reservationDepositValue > 0, {
  message: "Khi bật nhận cọc, số tiền cọc phải lớn hơn 0.",
  path: ["reservationDepositValue"]
});

export const authEmailSchema = z.string().trim().toLowerCase().email();

export const loginSchema = z.object({
  email: authEmailSchema,
  password: z.string().min(8)
});

export const pinLoginSchema = z.object({
  restaurantSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,80}$/),
  pin: z.string().trim().regex(/^\d{4,8}$/)
});

export const staffEmployeeCodeSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "");
  },
  z.string().regex(/^[A-Z0-9]{10,14}$/, "Mã nhân viên không hợp lệ.")
);

const strongPasswordSchema = z
  .string()
  .min(authPasswordMinLength, "Mật khẩu cần ít nhất 10 ký tự.")
  .max(authPasswordMaxLength, "Mật khẩu quá dài.")
  .regex(authPasswordPolicyPatterns.lowercase, "Mật khẩu cần có chữ thường.")
  .regex(authPasswordPolicyPatterns.uppercase, "Mật khẩu cần có chữ hoa.")
  .regex(authPasswordPolicyPatterns.number, "Mật khẩu cần có chữ số.");

export const staffAppLoginSchema = z.object({
  employeeCode: staffEmployeeCodeSchema,
  password: z.string().min(1, "Vui lòng nhập mật khẩu app.").max(authPasswordMaxLength)
});

export const staffAppPasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại.").max(authPasswordMaxLength),
    newPassword: strongPasswordSchema,
    confirmPassword: z.string().min(1, "Vui lòng xác nhận mật khẩu mới.").max(authPasswordMaxLength)
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Xác nhận mật khẩu mới chưa khớp.",
    path: ["confirmPassword"]
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "Mật khẩu mới cần khác mật khẩu hiện tại.",
    path: ["newPassword"]
  });

export const forgotPasswordSchema = z.object({
  email: authEmailSchema
});

export const resetPasswordSchema = z
  .object({
    email: authEmailSchema.optional().or(z.literal("")),
    token: z.string().trim().regex(/^\d{6}$/).optional().or(z.literal("")),
    password: strongPasswordSchema,
    confirmPassword: z.string()
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Mật khẩu xác nhận chưa khớp.",
    path: ["confirmPassword"]
  })
  .refine((value) => (value.email || value.token ? Boolean(value.email && value.token) : true), {
    message: "Vui lòng nhập email và mã OTP gồm 6 chữ số.",
    path: ["token"]
  });

export const emailOtpSchema = z.object({
  email: authEmailSchema,
  token: z.string().trim().regex(/^\d{6}$/)
});

export const resendEmailOtpSchema = z.object({
  email: authEmailSchema
});

export const authEmailStatusSchema = z.object({
  email: authEmailSchema
});

export const registerAccountSchema = z
  .object({
    email: authEmailSchema,
    password: strongPasswordSchema,
    confirmPassword: z.string()
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Mật khẩu xác nhận chưa khớp.",
    path: ["confirmPassword"]
  });

export const restaurantSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/).optional()
});

const onboardingInitialMenuItemSchema = z.object({
  name: z.string().trim().min(2).max(120),
  price: z.coerce.number().int().min(1000).max(100000000),
  categoryName: z.string().trim().max(80).optional().or(z.literal(""))
});

export const onboardingSchema = restaurantSchema.extend({
  businessType: businessTypeSchema,
  customBusinessType: z.string().trim().max(80).optional().or(z.literal("")),
  tableCount: z.coerce.number().int().min(1).max(300),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  storeLat: optionalCoordinateInput(-90, 90),
  storeLng: optionalCoordinateInput(-180, 180),
  hotline: z.string().trim().regex(/^[0-9+() .-]{6,24}$/).optional().or(z.literal("")),
  initialItemName: z.string().trim().max(120).optional().or(z.literal("")),
  initialItemPrice: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().int().min(1).max(100000000).optional()
  ),
  initialItemCategory: z.string().trim().max(80).optional().or(z.literal("")),
  initialMenuItems: jsonArrayInput(onboardingInitialMenuItemSchema, 80),
  brandSlogan: z.string().trim().max(80).optional().or(z.literal("")),
  brandDescription: z.string().trim().max(500).optional().or(z.literal("")),
  generatedLogoUrl: z.string().trim().url().max(2000).optional().or(z.literal("")),
  bankCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,20}$/).optional().or(z.literal("")),
  bankAccount: z.string().trim().regex(/^[0-9]{4,32}$/).optional().or(z.literal("")),
  bankAccountName: z.string().trim().max(120).optional().or(z.literal("")),
  planCode: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{2,32}$/)
    .optional()
    .or(z.literal(""))
});

export const registerOnboardingSchema = onboardingSchema.extend({
  ownerName: z.string().min(2).max(120).optional().or(z.literal("")),
  email: authEmailSchema,
  password: strongPasswordSchema
});

export const paymentSettingsSchema = z.object({
  bankCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,20}$/),
  bankAccount: z.string().trim().regex(/^[0-9]{4,32}$/),
  bankAccountName: z.string().trim().min(2).max(120)
});

export const restaurantSettingsSchema = z.object({
  name: z.string().min(2).max(120),
  businessType: businessTypeSchema.optional().or(z.literal("")),
  contactEmail: z.string().email().optional().or(z.literal("")),
  hotline: z.string().trim().regex(/^[0-9+() .-]{6,24}$/).optional().or(z.literal("")),
  address: z.string().trim().max(240).optional().or(z.literal("")),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  openingTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  closingTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  brandPrimary: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal("")),
  brandAccent: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal("")),
  allowLegacyQr: z.coerce.boolean().optional(),
  notifyNewOrder: z.coerce.boolean().optional(),
  notifyPaymentWaiting: z.coerce.boolean().optional(),
  showPromotionsOnMenu: z.coerce.boolean().optional(),
  receiptFooter: z.string().trim().max(240).optional().or(z.literal("")),
  receiptShowQr: z.coerce.boolean().optional()
});

export const reportScheduleSchema = z.object({
  enabled: z.coerce.boolean().optional(),
  frequency: z.enum(["weekly", "monthly", "yearly"]),
  recipients: z.preprocess(
    (value) =>
      typeof value === "string"
        ? value
            .split(/[\n,;]/)
            .map((email) => email.trim())
            .filter(Boolean)
        : value,
    z.array(z.string().email()).max(10)
  ),
  sendHour: z.coerce.number().int().min(0).max(23),
  sendDayOfWeek: z.coerce.number().int().min(1).max(7),
  sendDayOfMonth: z.coerce.number().int().min(1).max(31),
  sendMonth: z.coerce.number().int().min(1).max(12),
  includeCsv: z.coerce.boolean().optional(),
  includeJson: z.coerce.boolean().optional()
});

const storeBranchBaseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(240).optional().or(z.literal("")),
  latitude: nullableCoordinateInput(-90, 90),
  longitude: nullableCoordinateInput(-180, 180),
  isPrimary: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional()
});

const branchCoordinatePairRefinement = {
  message: "Vui lòng nhập đủ cả vĩ độ và kinh độ chi nhánh.",
  path: ["longitude"] as const
};

export const storeBranchSchema = storeBranchBaseSchema
  .refine((value) => (value.latitude === null) === (value.longitude === null), {
    message: branchCoordinatePairRefinement.message,
    path: [...branchCoordinatePairRefinement.path]
  });

export const updateStoreBranchSchema = storeBranchBaseSchema
  .extend({
    branchId: z.string().uuid()
  })
  .refine((value) => (value.latitude === null) === (value.longitude === null), {
    message: branchCoordinatePairRefinement.message,
    path: [...branchCoordinatePairRefinement.path]
  });

export const orderingSettingsSchema = z.object({
  address: z.string().trim().max(240).optional().or(z.literal("")),
  onlineOrderingEnabled: z.coerce.boolean().optional(),
  pickupEnabled: z.coerce.boolean().optional(),
  deliveryEnabled: z.coerce.boolean().optional(),
  onlinePaymentMode: z.enum(["PAY_AFTER", "QR_PREPAID"]),
  deliveryTrackingEnabled: z.coerce.boolean().optional(),
  mapGeocodingProvider: z.enum(["nominatim", "mapbox", "vietmap", "goong"]),
  mapRoutingProvider: z.enum(["osrm", "mapbox", "vietmap", "goong"]),
  mapDefaultZoom: z.coerce.number().int().min(8).max(18),
  mapDisplayStyle: z.enum(["LIGHT", "DARK"]),
  showStoreMarkerOnOrdering: z.coerce.boolean().optional(),
  showCustomerDistance: z.coerce.boolean().optional(),
  storeLat: optionalCoordinateInput(-90, 90),
  storeLng: optionalCoordinateInput(-180, 180),
  deliveryRadiusKm: z.coerce.number().min(0).max(200),
  freeDeliveryRadiusKm: z.coerce.number().min(0).max(200),
  deliveryBaseFee: z.coerce.number().int().min(0).max(10000000),
  deliveryFeePerKm: z.coerce.number().int().min(0).max(10000000),
  deliveryAreaMode: z.enum(["RADIUS", "CUSTOM"]),
  deliveryAreaName: z.string().trim().max(120).optional().or(z.literal("")),
  deliveryAreaNote: z.string().trim().max(240).optional().or(z.literal("")),
  deliveryAreaWardCount: z.coerce.number().int().min(0).max(10000),
  deliveryAreaPolygon: jsonArrayInput(deliveryAreaPointSchema, 40),
  deliveryExclusionZones: jsonArrayInput(deliveryExclusionZoneSchema, 30),
  deliveryFeeEnabled: z.coerce.boolean().optional(),
  deliveryFeeTiers: jsonArrayInput(deliveryFeeTierSchema, 20),
  minOrderForDelivery: z.coerce.number().int().min(0).max(100000000),
  pickupEtaMinutes: z.coerce.number().int().min(1).max(240),
  deliveryEtaMinutes: z.coerce.number().int().min(1).max(240),
  serviceFeeEnabled: z.coerce.boolean().optional(),
  serviceFeeType: z.enum(["ORDER_PERCENT"]),
  serviceFeePercent: z.coerce.number().min(0).max(100),
  serviceFeeMin: z.coerce.number().int().min(0).max(10000000),
  serviceFeeMax: optionalIntegerInput(0, 10000000),
  allowOutsideDeliveryArea: z.coerce.boolean().optional(),
  showDeliveryEta: z.coerce.boolean().optional(),
  requireOutsideAreaConfirmation: z.coerce.boolean().optional(),
  autoSuggestNearestBranch: z.coerce.boolean().optional()
}).refine((value) => value.freeDeliveryRadiusKm <= value.deliveryRadiusKm, {
  message: "Khoảng miễn phí ship không được lớn hơn bán kính nhận đơn",
  path: ["freeDeliveryRadiusKm"]
}).refine((value) => value.deliveryAreaMode === "RADIUS" || value.deliveryAreaPolygon.length >= 3, {
  message: "Vùng giao tùy chỉnh cần ít nhất 3 điểm trên bản đồ",
  path: ["deliveryAreaPolygon"]
}).refine((value) => value.serviceFeeMax === undefined || value.serviceFeeMax >= value.serviceFeeMin, {
  message: "Phí dịch vụ tối đa không được nhỏ hơn phí tối thiểu",
  path: ["serviceFeeMax"]
});

export const categorySchema = z.object({
  name: z.string().min(2).max(80)
});

export const menuItemSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(2).max(120),
  price: z.coerce.number().int().min(1000).max(100000000),
  image: z.string().url().optional().or(z.literal(""))
});

export const updateMenuItemSchema = menuItemSchema.extend({
  itemId: z.string().min(1),
  isAvailable: z.coerce.boolean().optional()
});

const optionalModifierMaxSelectSchema = z.preprocess(
  (value) => (value === "" || value === null ? null : value),
  z.coerce.number().int().min(0).max(20).nullable()
);

const menuModifierGroupBaseSchema = z.object({
  itemId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  isRequired: z.coerce.boolean().optional(),
  minSelect: z.coerce.number().int().min(0).max(20),
  maxSelect: optionalModifierMaxSelectSchema
});

function normalizeMenuModifierGroupSelection<T extends z.infer<typeof menuModifierGroupBaseSchema>>(value: T): T {
  return {
    ...value,
    minSelect: value.isRequired && value.minSelect === 0 ? 1 : value.minSelect
  };
}

function validateMenuModifierGroupSelection<T extends z.infer<typeof menuModifierGroupBaseSchema>>(schema: z.ZodType<T, z.ZodTypeDef, unknown>) {
  return schema
    .transform(normalizeMenuModifierGroupSelection)
    .refine((value) => value.maxSelect === null || value.maxSelect >= value.minSelect, {
      message: "Số lượng chọn tối đa không được nhỏ hơn tối thiểu",
      path: ["maxSelect"]
    });
}

export const menuModifierGroupSchema = validateMenuModifierGroupSelection(menuModifierGroupBaseSchema);

export const updateMenuModifierGroupSchema = validateMenuModifierGroupSelection(menuModifierGroupBaseSchema.extend({
  groupId: z.string().uuid()
}));

export const menuModifierGroupIdSchema = z.object({
  groupId: z.string().uuid()
});

export const menuModifierOptionSchema = z.object({
  groupId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  priceDelta: z.coerce.number().int().min(0).max(10000000),
  isAvailable: z.coerce.boolean().optional()
});

export const updateMenuModifierOptionSchema = menuModifierOptionSchema.extend({
  optionId: z.string().uuid()
});

export const menuModifierOptionStatusSchema = z.object({
  optionId: z.string().uuid(),
  isAvailable: z.coerce.boolean()
});

export const menuModifierOptionIdSchema = z.object({
  optionId: z.string().uuid()
});

export const tableSchema = z.object({
  name: z.string().min(1).max(80),
  branchId: z.string().uuid().optional().or(z.literal("")),
  area: z.string().trim().min(1).max(80).optional().or(z.literal("")),
  capacity: z.coerce.number().int().min(1).max(50).optional(),
  floorLabel: z.string().trim().min(1).max(80).optional().or(z.literal("")),
  seatingZone: z.enum(["indoor", "outdoor", "mixed"]).optional(),
  tableKind: z.enum(["standard", "vip", "bar", "community"]).optional(),
  reservationPriority: z.coerce.number().int().min(1).max(999).optional(),
  isBookable: z.coerce.boolean().optional(),
  isHidden: z.coerce.boolean().optional(),
  isUnderMaintenance: z.coerce.boolean().optional()
});

export const tableIdSchema = z.object({
  tableId: z.string().uuid()
});

export const updateTableSchema = tableSchema.extend({
  tableId: z.string().uuid()
});

export const tableQrStatusSchema = tableIdSchema.extend({
  qrEnabled: z.coerce.boolean()
});

const promotionBaseSchema = z.object({
  name: z.string().trim().min(2).max(140),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/),
  rewardType: z.enum(["DISCOUNT", "FREE_ITEM"]).default("DISCOUNT"),
  discountScope: z.enum(["ORDER", "DELIVERY_FEE"]).default("ORDER"),
  discountType: z.enum(["PERCENT", "FIXED"]),
  discountValue: z.coerce.number().int().min(1).max(100000000),
  minOrderAmount: z.coerce.number().int().min(0).max(100000000).optional(),
  totalUsageLimit: z.preprocess((value) => (value === "" || value === null ? undefined : value), z.coerce.number().int().min(1).max(100000000).optional()),
  perCustomerUsageLimit: z.preprocess((value) => (value === "" || value === null ? undefined : value), z.coerce.number().int().min(1).max(1000000).optional()),
  freeItemMenuItemId: z.preprocess((value) => (value === "" || value === null ? undefined : value), z.string().uuid().optional()),
  freeItemQuantity: z.preprocess((value) => (value === "" || value === null ? undefined : value), z.coerce.number().int().min(1).max(50).optional()),
  startsAt: z.string().optional().or(z.literal("")),
  endsAt: z.string().optional().or(z.literal("")),
  channels: z.array(z.enum(["IN_STORE", "QR_MENU", "WEBSITE", "EMAIL"])).min(1)
});

function validatePromotionSchema<T extends z.infer<typeof promotionBaseSchema>>(schema: z.ZodType<T, z.ZodTypeDef, unknown>) {
  return schema
    .refine((value) => value.discountType !== "PERCENT" || value.discountValue <= 100, {
      message: "Giảm theo phần trăm không được vượt quá 100%",
      path: ["discountValue"]
    })
    .refine((value) => !value.totalUsageLimit || !value.perCustomerUsageLimit || value.perCustomerUsageLimit <= value.totalUsageLimit, {
      message: "Lượt mỗi khách không được lớn hơn tổng lượt dùng",
      path: ["perCustomerUsageLimit"]
    })
    .refine((value) => value.rewardType !== "FREE_ITEM" || Boolean(value.freeItemMenuItemId), {
      message: "Khuyến mãi quà tặng cần chọn món tặng",
      path: ["freeItemMenuItemId"]
    })
    .refine((value) => value.rewardType !== "FREE_ITEM" || value.discountScope === "ORDER", {
      message: "Quà tặng chỉ áp dụng trên giá trị món",
      path: ["discountScope"]
    })
    .refine((value) => {
      if (!value.startsAt || !value.endsAt) return true;
      return new Date(value.startsAt).getTime() <= new Date(value.endsAt).getTime();
    }, {
      message: "Thời gian kết thúc không được sớm hơn thời gian bắt đầu",
      path: ["endsAt"]
    });
}

export const promotionSchema = validatePromotionSchema(promotionBaseSchema);

export const updatePromotionSchema = validatePromotionSchema(promotionBaseSchema.extend({
  promotionId: z.string().uuid()
}));

export const promotionIdSchema = z.object({
  promotionId: z.string().uuid()
});

export const promotionStatusSchema = promotionIdSchema.extend({
  isActive: z.coerce.boolean()
});

export const promotionDisplaySchema = promotionIdSchema.extend({
  showOnCustomerMenu: z.coerce.boolean()
});

export const inventoryIngredientSchema = z.object({
  categoryId: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(1).max(160),
  unit: z.string().trim().regex(/^[a-zA-Z0-9_%/ .-]{1,24}$/),
  onHandQuantity: z.coerce.number().finite().min(0).max(100000000),
  minimumQuantity: z.coerce.number().finite().min(0).max(100000000),
  referenceUnitCost: z.coerce.number().int().min(0).max(100000000),
  storageArea: z.string().trim().max(80).optional().or(z.literal("")),
  shelfCode: z.string().trim().max(80).optional().or(z.literal("")),
  storageNote: z.string().trim().max(160).optional().or(z.literal("")),
  reorderLeadDays: z.coerce.number().int().min(0).max(60).optional()
});

export const updateInventoryIngredientSchema = inventoryIngredientSchema.extend({
  ingredientId: z.string().uuid()
});

export const inventoryIngredientIdSchema = z.object({
  ingredientId: z.string().uuid()
});

export const inventoryCategorySchema = z.object({
  name: z.string().trim().min(1).max(120)
});

export const inventoryRecipeLineSchema = z.object({
  menuItemId: z.string().uuid(),
  ingredientId: z.string().uuid(),
  quantityPerItem: z.coerce.number().finite().gt(0).max(100000000),
  wastePercent: z.coerce.number().finite().min(0).max(100).optional()
});

export const inventoryRecipeLineIdSchema = z.object({
  recipeLineId: z.string().uuid()
});

export const inventoryMovementSchema = z.object({
  ingredientId: z.string().uuid(),
  movementType: z.enum(["receive", "adjust_increase", "adjust_decrease", "waste", "expired", "internal_use", "supplier_return", "rollback"]),
  quantity: z.coerce.number().finite().gt(0).max(100000000),
  unitCost: z.coerce.number().int().min(0).max(100000000).optional(),
  locationId: z.string().uuid().optional().or(z.literal("")),
  batchId: z.string().uuid().optional().or(z.literal("")),
  stockBalanceId: z.string().uuid().optional().or(z.literal("")),
  reason: z.string().trim().max(240).optional().or(z.literal(""))
});

export const inventorySupplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().regex(/^[0-9+() .-]{6,24}$/, "Số điện thoại nhân viên không hợp lệ."),
  address: z.string().trim().max(240).optional().or(z.literal("")),
  defaultLeadDays: z.coerce.number().int().min(0).max(120).optional(),
  isPreferred: z.coerce.boolean().optional()
});

export const inventoryPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid().optional().or(z.literal("")),
  locationId: z.string().uuid().optional().or(z.literal("")),
  ingredientId: z.string().uuid().optional().or(z.literal("")),
  orderQuantity: optionalNumberInput(z.coerce.number().finite().gt(0).max(100000000)),
  orderUnit: z.string().trim().regex(/^[a-zA-Z0-9_%/ .-]{1,24}$/).optional().or(z.literal("")),
  unitCost: optionalNumberInput(z.coerce.number().int().min(0).max(100000000)),
  expectedDeliveryAt: z.string().trim().max(40).optional().or(z.literal("")),
  expirationDate: z.string().trim().max(20).optional().or(z.literal("")),
  batchCode: z.string().trim().regex(/^[A-Za-z0-9_.:/ -]{1,64}$/).optional().or(z.literal("")),
  note: z.string().trim().max(240).optional().or(z.literal(""))
});

const inventoryPurchaseOrderLineSchema = z.object({
  ingredientId: z.string().uuid(),
  orderQuantity: z.coerce.number().finite().gt(0).max(100000000),
  orderUnit: z.string().trim().regex(/^[a-zA-Z0-9_%/ .-]{1,24}$/).optional().or(z.literal("")),
  unitCost: z.coerce.number().int().min(0).max(100000000),
  expirationDate: z.string().trim().max(20).optional().or(z.literal("")),
  batchCode: z.string().trim().regex(/^[A-Za-z0-9_.:/ -]{1,64}$/).optional().or(z.literal("")),
  note: z.string().trim().max(240).optional().or(z.literal(""))
});

export const inventoryPurchaseOrderRowsSchema = z.object({
  rows: jsonArrayInput(inventoryPurchaseOrderLineSchema, 100)
});

export const inventoryPurchaseOrderIdSchema = z.object({
  purchaseOrderId: z.string().uuid()
});

const inventoryPurchaseOrderReceiptLineSchema = z.object({
  purchaseOrderLineId: z.string().uuid(),
  receivedQuantity: z.coerce.number().finite().gt(0).max(100000000),
  unitCost: optionalNumberInput(z.coerce.number().int().min(0).max(100000000)),
  expirationDate: z.string().trim().max(20).optional().or(z.literal("")),
  batchCode: z.string().trim().regex(/^[A-Za-z0-9_.:/ -]{1,64}$/).optional().or(z.literal("")),
  note: z.string().trim().max(240).optional().or(z.literal(""))
});

export const inventoryPurchaseOrderReceiptRowsSchema = z.object({
  rows: jsonArrayInput(inventoryPurchaseOrderReceiptLineSchema, 100)
});

export const inventoryCountSchema = z.object({
  title: z.string().trim().max(160).optional().or(z.literal("")),
  locationId: z.string().uuid().optional().or(z.literal("")),
  ingredientId: z.string().uuid().optional().or(z.literal("")),
  countedQuantity: optionalNumberInput(z.coerce.number().finite().min(0).max(100000000)),
  note: z.string().trim().max(240).optional().or(z.literal(""))
});

const inventoryCountLineSchema = z.object({
  ingredientId: z.string().uuid(),
  countedQuantity: z.coerce.number().finite().min(0).max(100000000),
  locationId: z.string().uuid().optional().or(z.literal("")),
  note: z.string().trim().max(240).optional().or(z.literal(""))
});

export const inventoryCountRowsSchema = z.object({
  rows: jsonArrayInput(inventoryCountLineSchema, 300)
});

export const inventoryTransferSchema = z.object({
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  ingredientId: z.string().uuid().optional().or(z.literal("")),
  quantity: optionalNumberInput(z.coerce.number().finite().gt(0).max(100000000)),
  unit: z.string().trim().regex(/^[a-zA-Z0-9_%/ .-]{1,24}$/).optional().or(z.literal("")),
  note: z.string().trim().max(240).optional().or(z.literal(""))
}).refine((value) => value.fromLocationId !== value.toLocationId, {
  message: "Kho xuất và kho nhận phải khác nhau.",
  path: ["toLocationId"]
});

const inventoryTransferLineSchema = z.object({
  ingredientId: z.string().uuid(),
  quantity: z.coerce.number().finite().gt(0).max(100000000),
  unit: z.string().trim().regex(/^[a-zA-Z0-9_%/ .-]{1,24}$/).optional().or(z.literal("")),
  batchId: z.string().uuid().optional().or(z.literal("")),
  note: z.string().trim().max(240).optional().or(z.literal(""))
});

export const inventoryTransferRowsSchema = z.object({
  rows: jsonArrayInput(inventoryTransferLineSchema, 100)
});

export const inventoryTransferWorkflowSchema = z.object({
  transferId: z.string().uuid(),
  action: z.enum(["approve", "dispatch", "receive", "cancel"]),
  note: z.string().trim().max(240).optional().or(z.literal("")),
  lines: jsonArrayInput(
    z.object({
      lineId: z.string().uuid(),
      receivedQuantity: z.coerce.number().finite().min(0).max(100000000),
      note: z.string().trim().max(240).optional().or(z.literal(""))
    }),
    100
  ).optional()
});

export const inventoryAlertStatusSchema = z.object({
  alertId: z.string().uuid(),
  status: z.enum(["acknowledged", "resolved", "dismissed"])
});

export const inventoryImportRowsSchema = z.object({
  rows: jsonArrayInput(
    z.object({
      name: z.string().trim().min(1).max(160),
      unit: z.string().trim().regex(/^[a-zA-Z0-9_%/ .-]{1,24}$/),
      quantity: z.coerce.number().finite().min(0).max(100000000),
      minimumQuantity: z.coerce.number().finite().min(0).max(100000000).default(0),
      referenceUnitCost: z.coerce.number().int().min(0).max(100000000).default(0),
      categoryName: z.string().trim().max(120).optional().or(z.literal(""))
    }),
    120
  )
});

const staffDateOfBirthSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày sinh không hợp lệ.")
  .refine((value) => value >= "1900-01-01" && value <= new Date().toISOString().slice(0, 10), "Ngày sinh không hợp lệ.");

const nullableTextInput = (value: unknown) => (value === null || value === undefined ? "" : value);

const staffPinInputSchema = z.preprocess(
  nullableTextInput,
  z.string().trim().regex(/^\d{4,8}$/, "Mã PIN phải gồm 4-8 chữ số.").optional().or(z.literal(""))
);

const staffPhoneInputSchema = z.preprocess(
  nullableTextInput,
  z.string().trim().regex(/^[0-9+() .-]{6,24}$/, "Số điện thoại không hợp lệ.").optional().or(z.literal(""))
);

export const staffInviteSchema = z.object({
  email: z.preprocess(
    (value) => {
      if (typeof value !== "string") return undefined;
      const normalized = value.trim().toLowerCase();
      return normalized.length > 0 ? normalized : undefined;
    },
    z.string().email("Email nhân sự không hợp lệ.").optional()
  ),
  password: z.preprocess(
    (value) => {
      if (typeof value !== "string") return undefined;
      const normalized = value.trim();
      return normalized.length > 0 ? normalized : undefined;
    },
    z.string().min(8, "Mật khẩu nhân sự cần ít nhất 8 ký tự.").optional()
  ),
  pin: staffPinInputSchema,
  fullName: z.string().trim().min(2, "Vui lòng nhập họ tên nhân viên.").max(120, "Họ tên tối đa 120 ký tự."),
  dateOfBirth: staffDateOfBirthSchema.optional().or(z.literal("")),
  hometown: z.string().trim().min(2, "Quê quán cần tối thiểu 2 ký tự.").max(120).optional().or(z.literal("")),
  phone: staffPhoneInputSchema,
  roleCode: z.string().trim().regex(/^[a-z0-9_-]{2,40}$/).default("waiter"),
  branchId: z.string().uuid().optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal(""))
});

export const staffRoleSchema = z.object({
  userId: z.string().uuid(),
  permissionProfile: z.enum(staffPermissionProfiles)
});

export const staffUserSchema = z.object({
  userId: z.string().uuid()
});

export const staffProfileSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  dateOfBirth: staffDateOfBirthSchema.optional().or(z.literal("")),
  hometown: z.string().trim().max(120).optional().or(z.literal("")),
  phone: staffPhoneInputSchema,
  username: z.string().trim().regex(/^[a-z0-9._-]{3,40}$/).optional().or(z.literal("")),
  pin: staffPinInputSchema,
  roleCode: z.string().trim().regex(/^[a-z0-9_-]{2,40}$/),
  branchId: z.string().uuid().optional().or(z.literal("")),
  employmentStatus: z.enum(["active", "suspended", "resigned"]).default("active"),
  emergencyContactName: z.string().trim().max(120).optional().or(z.literal("")),
  emergencyContactPhone: staffPhoneInputSchema,
  notes: z.string().trim().max(500).optional().or(z.literal(""))
});

export const staffAccountStateSchema = z.object({
  userId: z.string().uuid(),
  nextState: z.enum(["active", "suspended", "archived"]),
  reason: z.string().trim().max(240).optional().or(z.literal(""))
});

export const staffAppPasswordResetSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().max(240).optional().or(z.literal(""))
});

export const staffAppPasswordBulkResetSchema = z.object({
  userIds: jsonArrayInput(z.string().uuid(), 200).refine((value) => value.length >= 1, "Cần chọn ít nhất một nhân viên để cấp lại mật khẩu."),
  reason: z.string().trim().max(240).optional().or(z.literal(""))
});

export const staffSelfProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: staffPhoneInputSchema,
  dateOfBirth: staffDateOfBirthSchema.optional().or(z.literal("")),
  hometown: z.string().trim().max(120).optional().or(z.literal(""))
});

export const staffIncidentReportSchema = z.object({
  staffMemberId: z.string().uuid(),
  branchId: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(5).max(1000),
  severity: z.enum(["low", "normal", "high", "urgent"]).default("normal")
});

export const staffIncidentStatusUpdateSchema = z.object({
  incidentId: z.string().uuid(),
  status: z.enum(["reviewing", "resolved", "dismissed"]),
  note: z.string().trim().max(240).optional().or(z.literal(""))
});

export const staffRolePermissionUpdateSchema = z.object({
  roleId: z.string().uuid(),
  permissions: z.array(z.enum(STAFF_PERMISSION_KEYS)).min(1).max(STAFF_PERMISSION_KEYS.length)
});

export const staffRoleCloneSchema = z.object({
  sourceRoleId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(240).optional().or(z.literal(""))
});

const deviceFingerprintSchema = z.string().trim().regex(/^[a-zA-Z0-9._:-]{12,160}$/);
const attendanceTrustBooleanSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "on", "yes"].includes(normalized)) return true;
  if (["false", "0", "off", "no", ""].includes(normalized)) return false;
  return value;
}, z.boolean());

export const staffSessionHeartbeatSchema = z.object({
  branchId: z.string().uuid().optional().or(z.literal("")),
  sessionType: z.enum(["dashboard", "mobile", "kiosk", "pwa"]).default("dashboard"),
  loginMethod: z.enum(["password", "pin", "recovery"]).default("password"),
  deviceFingerprint: deviceFingerprintSchema,
  deviceName: z.string().trim().max(120).optional().or(z.literal("")),
  metadata: z.record(z.unknown()).optional().default({})
});

export const staffSessionForceLogoutSchema = z
  .object({
    sessionId: z.string().uuid().optional().or(z.literal("")),
    staffMemberId: z.string().uuid().optional().or(z.literal("")),
    reason: z.string().trim().max(240).optional().or(z.literal(""))
  })
  .refine((value) => Boolean(value.sessionId || value.staffMemberId), {
    message: "Cần chọn phiên hoặc nhân sự để buộc đăng xuất."
  });

export const staffAttendanceQrTokenCreateSchema = z.object({
  branchId: z.string().uuid(),
  expiresInMinutes: z.coerce.number().int().min(1).max(5).default(1),
  mode: z.enum(["single_use", "daily_branch"]).default("daily_branch")
});

export const staffAttendanceWifiNetworkRegisterSchema = z.object({
  branchId: z.string().uuid(),
  label: z.string().trim().min(2).max(80).optional().or(z.literal(""))
});

const shiftTimeSchema = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ ca phải theo định dạng HH:mm.");
const shiftDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phân ca không hợp lệ.");

const staffShiftTemplateBaseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  branchId: z.string().uuid().optional().or(z.literal("")),
  startTime: shiftTimeSchema,
  endTime: shiftTimeSchema,
  allowedLateMinutes: z.coerce.number().int().min(0).max(180).default(10),
  overtimeThresholdMinutes: z.coerce.number().int().min(0).max(720).default(30),
  attendanceRadiusMeters: z.coerce.number().int().min(50).max(150).default(80),
  recurringWeekdays: jsonArrayInput(z.coerce.number().int().min(0).max(6), 7).default([])
});

export const staffShiftTemplateSchema = staffShiftTemplateBaseSchema
  .refine((value) => value.startTime !== value.endTime, {
    message: "Giờ bắt đầu và kết thúc ca không được trùng nhau.",
    path: ["endTime"]
  });

export const staffShiftTemplateUpdateSchema = staffShiftTemplateBaseSchema
  .extend({
    shiftId: z.string().uuid("Ca làm cần sửa không hợp lệ.")
  })
  .refine((value) => value.startTime !== value.endTime, {
    message: "Giờ bắt đầu và kết thúc ca không được trùng nhau.",
    path: ["endTime"]
  });

export const staffShiftAssignmentSchema = z.object({
  staffMemberId: z.string().uuid(),
  shiftId: z.string().uuid(),
  scheduledDate: shiftDateSchema,
  note: z.string().trim().max(240).optional().or(z.literal(""))
});

export const staffShiftAssignmentUpdateSchema = staffShiftAssignmentSchema.extend({
  shiftAssignmentId: z.string().uuid("Ca phân công cần sửa không hợp lệ.")
});

export const staffShiftAssignmentCancelSchema = z.object({
  shiftAssignmentId: z.string().uuid("Ca làm cần huỷ không hợp lệ."),
  note: z.string().trim().max(240).optional().or(z.literal(""))
});

export const staffOperationalRequestSchema = z
  .object({
    requestType: z.enum(["leave_request", "shift_swap", "overtime"]),
    staffMemberId: z.string().uuid().optional().or(z.literal("")),
    branchId: z.string().uuid().optional().or(z.literal("")),
    shiftAssignmentId: z.string().uuid().optional().or(z.literal("")),
    targetStaffMemberId: z.string().uuid().optional().or(z.literal("")),
    leaveType: z.enum(["paid", "unpaid", "sick", "emergency", "other"]).optional().or(z.literal("")),
    fromDate: shiftDateSchema.optional().or(z.literal("")),
    toDate: shiftDateSchema.optional().or(z.literal("")),
    overtimeMinutes: optionalIntegerInput(15, 720),
    reason: z.string().trim().max(500).optional().or(z.literal(""))
  })
  .superRefine((value, context) => {
    if (value.requestType === "leave_request") {
      if (!value.fromDate) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Cần chọn ngày bắt đầu nghỉ.",
          path: ["fromDate"]
        });
      }

      if (!value.toDate) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Cần chọn ngày kết thúc nghỉ.",
          path: ["toDate"]
        });
      }

      if (value.fromDate && value.toDate && value.toDate < value.fromDate) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Ngày kết thúc nghỉ phải sau ngày bắt đầu.",
          path: ["toDate"]
        });
      }

      if (value.fromDate && value.toDate && value.toDate >= value.fromDate) {
        const from = new Date(`${value.fromDate}T00:00:00.000Z`).getTime();
        const to = new Date(`${value.toDate}T00:00:00.000Z`).getTime();
        const days = Math.floor((to - from) / 86_400_000) + 1;
        if (days > 31) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Một yêu cầu nghỉ phép chỉ được tối đa 31 ngày.",
            path: ["toDate"]
          });
        }
      }
    }

    if (value.requestType === "shift_swap") {
      if (!value.shiftAssignmentId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Cần chọn ca muốn đổi.",
          path: ["shiftAssignmentId"]
        });
      }

      if (value.staffMemberId && value.targetStaffMemberId && value.staffMemberId === value.targetStaffMemberId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Người nhận đổi ca phải khác nhân viên tạo yêu cầu.",
          path: ["targetStaffMemberId"]
        });
      }
    }

    if (value.requestType === "overtime") {
      if (!value.fromDate) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Cần chọn ngày tăng ca.",
          path: ["fromDate"]
        });
      }

      if (!value.overtimeMinutes) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Cần nhập số phút tăng ca.",
          path: ["overtimeMinutes"]
        });
      }
    }
  });

export const staffReviewCreateSchema = z.object({
  staffMemberId: z.string().uuid(),
  periodLabel: z.string().trim().min(2).max(80),
  score: z.coerce.number().min(1).max(5),
  note: z.string().trim().max(500).optional().or(z.literal(""))
});

export const staffContractCreateSchema = z
  .object({
    staffMemberId: z.string().uuid(),
    contractType: z.enum(["official", "probation", "part_time", "service", "other"]).default("official"),
    templateCode: z.enum(["restaurant_fixed_term", "restaurant_indefinite", "restaurant_part_time", "restaurant_probation"]).default("restaurant_fixed_term"),
    contractNumber: z.string().trim().max(80).optional().or(z.literal("")),
    jobTitle: z.string().trim().max(120).optional().or(z.literal("")),
    workLocation: z.string().trim().max(240).optional().or(z.literal("")),
    salaryAmount: z.preprocess(
      (value) => (value === "" || value === null ? undefined : value),
      z.coerce.number().min(0).max(1_000_000_000).optional()
    ),
    salaryPaymentMethod: z.string().trim().max(160).optional().or(z.literal("")),
    workingTime: z.string().trim().max(600).optional().or(z.literal("")),
    restTime: z.string().trim().max(600).optional().or(z.literal("")),
    startDate: shiftDateSchema,
    endDate: shiftDateSchema.optional().or(z.literal("")),
    eSignatureStatus: z.enum(["draft", "pending_employee", "pending_employer", "signed", "declined", "voided"]).default("draft"),
    eContractProvider: z.string().trim().max(120).optional().or(z.literal("")),
    eContractId: z.string().trim().max(160).optional().or(z.literal("")),
    signedDocumentUrl: z.string().trim().url("Link hợp đồng đã ký không hợp lệ.").optional().or(z.literal("")),
    note: z.string().trim().max(500).optional().or(z.literal(""))
  })
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    message: "Ngày kết thúc hợp đồng phải sau ngày bắt đầu.",
    path: ["endDate"]
  });

export const staffDocumentCreateSchema = z.object({
  staffMemberId: z.string().uuid(),
  documentName: z.string().trim().min(2).max(160),
  documentType: z.enum(["identity_card", "health_certificate", "contract", "training", "other"]).default("other"),
  fileUrl: z.string().trim().url("Link tài liệu không hợp lệ.").optional().or(z.literal("")),
  status: z.enum(["complete", "missing", "expired"]).default("complete"),
  note: z.string().trim().max(500).optional().or(z.literal(""))
});

export const staffDeviceCreateSchema = z
  .object({
    staffMemberId: z.string().uuid().optional().or(z.literal("")),
    deviceName: z.string().trim().min(2).max(160),
    deviceType: z.enum(["phone", "tablet", "pos", "cash_drawer", "other"]).default("other"),
    serialNumber: z.string().trim().max(120).optional().or(z.literal("")),
    deviceFingerprint: deviceFingerprintSchema.optional().or(z.literal("")),
    trustedForAttendance: attendanceTrustBooleanSchema.optional().default(false),
    issuedAt: shiftDateSchema,
    note: z.string().trim().max(500).optional().or(z.literal(""))
  })
  .refine((value) => !value.trustedForAttendance || Boolean(value.deviceFingerprint), {
    message: "Thiết bị cần fingerprint trước khi duyệt chấm công.",
    path: ["deviceFingerprint"]
  });

export const staffDeviceTrustUpdateSchema = z.object({
  deviceId: z.string().uuid(),
  trustedForAttendance: attendanceTrustBooleanSchema,
  reason: z.string().trim().max(240).optional().or(z.literal(""))
});

const attendanceDeviceInfoSchema = z
  .record(z.unknown())
  .optional()
  .default({});

const attendanceLatSchema = optionalCoordinateInput(-90, 90);
const attendanceLngSchema = optionalCoordinateInput(-180, 180);

function hasPartialCoordinatePair(value: { lat?: number; lng?: number }) {
  return (value.lat === undefined && value.lng !== undefined) || (value.lat !== undefined && value.lng === undefined);
}

function isLocationBoundAttendanceSource(source: "gps" | "qr" | "wifi" | "manual" | "offline_sync") {
  return source !== "manual";
}

function hasAttendanceDeviceFingerprint(value: { deviceInfo?: Record<string, unknown> }) {
  const fingerprint = value.deviceInfo?.deviceFingerprint ?? value.deviceInfo?.fingerprint ?? value.deviceInfo?.device_fingerprint;
  return typeof fingerprint === "string" && fingerprint.trim().length >= 12;
}

const attendanceCaptureBaseSchema = z.object({
  staffMemberId: z.string().uuid().optional().or(z.literal("")),
  branchId: z.string().uuid().optional().or(z.literal("")),
  lat: attendanceLatSchema,
  lng: attendanceLngSchema,
  accuracyMeters: optionalIntegerInput(0, 5000),
  capturedAt: z.string().datetime().optional(),
  deviceInfo: attendanceDeviceInfoSchema,
  qrToken: z.string().trim().min(24).max(240).optional().or(z.literal("")),
  note: z.string().trim().max(240).optional().or(z.literal(""))
});

export const attendanceClockInSchema = attendanceCaptureBaseSchema
  .extend({
    shiftAssignmentId: z.string().uuid().optional().or(z.literal("")),
    source: z.enum(["gps", "qr", "wifi", "manual", "offline_sync"]).default("gps"),
    offlineQueueKey: z.string().trim().regex(/^[a-zA-Z0-9._:-]{8,120}$/).optional().or(z.literal(""))
  })
  .superRefine((value, context) => {
    if (hasPartialCoordinatePair(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cần gửi đủ cả vĩ độ và kinh độ.",
        path: ["lat"]
      });
    }

    if (isLocationBoundAttendanceSource(value.source) && (value.lat === undefined || value.lng === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Chấm công GPS cần vị trí thiết bị.",
        path: ["lat"]
      });
    }

    if (isLocationBoundAttendanceSource(value.source) && value.accuracyMeters === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Chấm công GPS cần độ chính xác vị trí.",
        path: ["accuracyMeters"]
      });
    }

    if (value.source !== "manual" && !hasAttendanceDeviceFingerprint(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Chấm công cần fingerprint thiết bị để chống gian lận.",
        path: ["deviceInfo"]
      });
    }

    if (value.source === "qr" && !value.qrToken?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Chấm công QR cần mã QR hợp lệ tại chi nhánh.",
        path: ["qrToken"]
      });
    }
  });

export const attendanceClockOutSchema = attendanceCaptureBaseSchema
  .extend({
    attendanceLogId: z.string().uuid().optional().or(z.literal("")),
    source: z.enum(["gps", "qr", "wifi", "manual", "offline_sync"]).default("gps")
  })
  .superRefine((value, context) => {
    if (hasPartialCoordinatePair(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cần gửi đủ cả vĩ độ và kinh độ.",
        path: ["lat"]
      });
    }

    if (isLocationBoundAttendanceSource(value.source) && (value.lat === undefined || value.lng === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Kết ca GPS cần vị trí thiết bị.",
        path: ["lat"]
      });
    }

    if (isLocationBoundAttendanceSource(value.source) && value.accuracyMeters === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Kết ca GPS cần độ chính xác vị trí.",
        path: ["accuracyMeters"]
      });
    }

    if (value.source !== "manual" && !hasAttendanceDeviceFingerprint(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Kết ca cần fingerprint thiết bị để chống gian lận.",
        path: ["deviceInfo"]
      });
    }

    if (value.source === "qr" && !value.qrToken?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Kết ca QR cần mã QR hợp lệ tại chi nhánh.",
        path: ["qrToken"]
      });
    }
  });

export const attendanceApprovalReviewSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    note: z.string().trim().max(240).optional().or(z.literal(""))
  })
  .superRefine((value, context) => {
    if (value.decision === "rejected" && !value.note?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Từ chối yêu cầu cần ghi lý do để đối soát công/lương.",
        path: ["note"]
      });
    }
  });

const attendanceManualDateTimeSchema = z.string().trim().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})?$/,
  "Thời gian công phải theo định dạng ngày giờ hợp lệ."
);

function parseAttendanceManualDateTimeMs(value: string) {
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})?$/.test(value)
    ? value.replace(/(Z|[+-]\d{2}:\d{2})?$/, ":00$1")
    : value;
  const normalized = hasExplicitTimezone ? withSeconds : `${withSeconds}+07:00`;
  return new Date(normalized).getTime();
}

export const attendanceManualAdjustmentSchema = z
  .object({
    attendanceLogId: z.string().uuid("Bản ghi công cần sửa không hợp lệ."),
    staffMemberId: z.string().uuid("Nhân sự cần sửa công không hợp lệ."),
    clockInAt: attendanceManualDateTimeSchema,
    clockOutAt: attendanceManualDateTimeSchema.optional().or(z.literal("")),
    note: z.string().trim().min(2, "Sửa công cần ghi lý do.").max(240)
  })
  .refine((value) => {
    if (!value.clockOutAt) return true;
    const clockInAt = parseAttendanceManualDateTimeMs(value.clockInAt);
    const clockOutAt = parseAttendanceManualDateTimeMs(value.clockOutAt);
    return Number.isFinite(clockInAt) && Number.isFinite(clockOutAt) && clockOutAt > clockInAt;
  }, {
    message: "Giờ kết ca phải sau giờ vào ca.",
    path: ["clockOutAt"]
  });


const percentSchema = z.coerce.number().finite().min(0).max(100);
const moneySchema = z.coerce.number().int().min(0).max(1_000_000_000);

export const staffPayrollDeductionsSchema = z
  .object({
    bhxhEmployeePercent: percentSchema,
    bhytEmployeePercent: percentSchema,
    bhtnEmployeePercent: percentSchema,
    bhxhEmployerPercent: percentSchema,
    bhytEmployerPercent: percentSchema,
    bhtnEmployerPercent: percentSchema,
    enablePersonalIncomeTax: z.coerce.boolean().optional(),
    personalRelief: moneySchema,
    dependentReliefPerPerson: moneySchema,
    insuranceBaseMin: moneySchema,
    insuranceBaseMax: moneySchema
  })
  .refine((value) => value.insuranceBaseMax >= value.insuranceBaseMin, {
    message: "Trần BHXH phải lớn hơn hoặc bằng sàn BHXH.",
    path: ["insuranceBaseMax"]
  });

export const staffPayrollProfileSchema = z.object({
  staffMemberId: z.string().uuid(),
  baseSalary: moneySchema,
  hourlyRate: z.preprocess(
    (value) => (value === "" || value === null ? null : value),
    z.coerce.number().int().min(0).max(1_000_000_000).nullable()
  ),
  dependentCount: z.coerce.number().int().min(0).max(20),
  enrolledInInsurance: z.coerce.boolean().optional(),
  applyPersonalIncomeTax: z.coerce.boolean().optional(),
  insuranceBaseAmount: z.preprocess(
    (value) => (value === "" || value === null ? null : value),
    z.coerce.number().int().min(0).max(1_000_000_000).nullable()
  ),
  note: z.string().trim().max(500).optional().or(z.literal(""))
});

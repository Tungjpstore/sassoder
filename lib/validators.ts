import { z } from "zod";
import { staffPermissionProfiles } from "@/lib/staff-permissions";
import { authPasswordMaxLength, authPasswordMinLength, authPasswordPolicyPatterns } from "@/lib/auth-password-policy";

export const paymentMethodSchema = z.enum(["QR", "CASH"]);
export const fulfillmentTypeSchema = z.enum(["DINE_IN", "PICKUP", "DELIVERY"]);
export const businessTypeSchema = z.enum(["CAFE", "RESTAURANT", "FAST_FOOD", "BAR", "OTHER"]);

const coordinateSchema = z.coerce.number().finite();
const promotionCodeSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const normalized = value.trim().toUpperCase();
    return normalized.length > 0 ? normalized : undefined;
  },
  z.string().regex(/^[A-Z0-9_-]{3,32}$/).optional()
);
const optionalCoordinateInput = (min: number, max: number) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().finite().min(min).max(max).optional()
  );

const optionalIntegerInput = (min: number, max: number) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().int().min(min).max(max).optional()
  );

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
  lat: z.coerce.number().finite().min(-90).max(90),
  lng: z.coerce.number().finite().min(-180).max(180)
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
        note: z.string().max(200).optional()
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
  customerSessionId: z.string().uuid().optional(),
  customerNote: z.string().max(300).optional(),
  idempotencyKey: z.string().min(8).max(120).optional(),
  promotionCode: promotionCodeSchema,
  fulfillmentType: z.enum(["PICKUP", "DELIVERY"]),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().regex(/^[0-9+() .-]{6,24}$/),
  deliveryAddress: z.string().trim().max(240).optional().or(z.literal("")),
  deliveryLat: coordinateSchema.min(-90).max(90).optional(),
  deliveryLng: coordinateSchema.min(-180).max(180).optional(),
  items: createOrderSchema.shape.items
});

export const deliveryQuoteSchema = z.object({
  restaurantSlug: z.string().min(1),
  subtotal: z.coerce.number().int().min(0).max(100000000),
  deliveryAddress: z.string().trim().max(240).optional().or(z.literal("")),
  deliveryLat: coordinateSchema.min(-90).max(90).optional(),
  deliveryLng: coordinateSchema.min(-180).max(180).optional()
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
  lat: coordinateSchema.min(-90).max(90),
  lng: coordinateSchema.min(-180).max(180),
  accuracyMeters: z.coerce.number().finite().min(0).max(5000).optional(),
  headingDegrees: z.coerce.number().finite().min(0).lt(360).optional(),
  speedMps: z.coerce.number().finite().min(0).max(80).optional(),
  source: z.enum(["admin_dashboard", "driver_app", "manual", "system"]).optional(),
  capturedAt: z.string().datetime().optional(),
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

export const reservationAvailabilitySchema = z.object({
  restaurantSlug: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  partySize: z.coerce.number().int().min(1).max(100)
});

export const createReservationSchema = z.object({
  restaurantSlug: z.string().min(1),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().regex(/^[0-9+() .-]{6,24}$/),
  customerEmail: z.string().trim().email().optional().or(z.literal("")),
  partySize: z.coerce.number().int().min(1).max(100),
  startsAt: z.string().datetime(),
  customerNote: z.string().trim().max(300).optional().or(z.literal("")),
  idempotencyKey: z.string().min(8).max(120).optional()
});

export const publicReservationAccessSchema = z.object({
  restaurantSlug: z.string().min(1).optional(),
  token: z.string().min(24).max(160)
});

export const reservationIdSchema = z.object({
  reservationId: z.string().uuid()
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

const strongPasswordSchema = z
  .string()
  .min(authPasswordMinLength, "Mật khẩu cần ít nhất 10 ký tự.")
  .max(authPasswordMaxLength, "Mật khẩu quá dài.")
  .regex(authPasswordPolicyPatterns.lowercase, "Mật khẩu cần có chữ thường.")
  .regex(authPasswordPolicyPatterns.uppercase, "Mật khẩu cần có chữ hoa.")
  .regex(authPasswordPolicyPatterns.number, "Mật khẩu cần có chữ số.");

export const forgotPasswordSchema = z.object({
  email: authEmailSchema
});

export const resetPasswordSchema = z
  .object({
    password: strongPasswordSchema,
    confirmPassword: z.string()
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Mật khẩu xác nhận chưa khớp.",
    path: ["confirmPassword"]
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

export const tableSchema = z.object({
  name: z.string().min(1).max(80),
  area: z.string().trim().min(1).max(80).optional().or(z.literal("")),
  capacity: z.coerce.number().int().min(1).max(50).optional()
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

export const promotionSchema = z.object({
  name: z.string().trim().min(2).max(140),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/),
  discountType: z.enum(["PERCENT", "FIXED"]),
  discountValue: z.coerce.number().int().min(1).max(100000000),
  minOrderAmount: z.coerce.number().int().min(0).max(100000000).optional(),
  startsAt: z.string().optional().or(z.literal("")),
  endsAt: z.string().optional().or(z.literal("")),
  channels: z.array(z.enum(["IN_STORE", "QR_MENU", "WEBSITE", "EMAIL"])).min(1)
}).refine((value) => value.discountType !== "PERCENT" || value.discountValue <= 100, {
  message: "Giảm theo phần trăm không được vượt quá 100%",
  path: ["discountValue"]
});

export const promotionIdSchema = z.object({
  promotionId: z.string().uuid()
});

export const promotionStatusSchema = promotionIdSchema.extend({
  isActive: z.coerce.boolean()
});

export const promotionDisplaySchema = promotionIdSchema.extend({
  showOnCustomerMenu: z.coerce.boolean()
});

export const staffInviteSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  permissionProfile: z.enum(staffPermissionProfiles).default("service")
});

export const staffRoleSchema = z.object({
  userId: z.string().uuid(),
  permissionProfile: z.enum(staffPermissionProfiles)
});

export const staffUserSchema = z.object({
  userId: z.string().uuid()
});

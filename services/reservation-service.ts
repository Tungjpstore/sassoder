import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildVietQrUrl } from "@/lib/vietqr";
import { resolveReservationClosureDepositDisposition } from "@/lib/reservations/deposit-policy";
import { ensureReservationDepositLogEvent, reservationDepositTransitionKey } from "@/services/payment-log-service";
import {
  rankReservationTablesForAssignment,
  reservationAssignmentReason,
  type ReservationAssignableTable,
  type ReservationAssignmentPreferences,
  type ReservationAssignmentTableSignal
} from "@/services/reservation-assignment";
import {
  buildReservationAnalytics,
  DEFAULT_RESERVATION_ANALYTICS_WINDOW_DAYS,
  type ReservationAnalyticsRow
} from "@/services/reservation-analytics";
import { isReservationPastNoShowGrace, reservationNoShowAvailableAt, roundUpToSlotBoundary } from "@/services/reservation-time";
import { invalidateRestaurantDashboardCache } from "@/services/restaurant-service";
import { assertFeatureEntitlement } from "@/services/subscription-service";
import { assertPublicTenantActive, isPublicTenantActive } from "@/services/tenant-status-guard";
import { buildTelegramReservationSnapshot, enqueueTelegramNotification } from "@/services/telegram-event-queue";
import type { PaymentMethod, ReservationDepositStatus, ReservationDepositType, ReservationDto, ReservationStatus } from "@/types/domain";
import type { Database, Json } from "@/types/supabase";

type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"];
type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
type ReservationInsert = Database["public"]["Tables"]["reservations"]["Insert"];
type ReservationDbStatus = ReservationRow["status"];
type ReservationSupabaseClient = SupabaseClient<Database>;
type ReservationLockRow = Database["public"]["Tables"]["reservation_table_locks"]["Row"] & {
  table?:
    | { id: string; name: string; area: string; capacity: number; table_area_id?: string | null; floor_label?: string | null; seating_zone?: string | null; table_kind?: string | null }
    | { id: string; name: string; area: string; capacity: number; table_area_id?: string | null; floor_label?: string | null; seating_zone?: string | null; table_kind?: string | null }[]
    | null;
};
type ReservationActiveLock = Pick<Database["public"]["Tables"]["reservation_table_locks"]["Row"], "id" | "reservation_id" | "restaurant_id" | "table_id" | "starts_at" | "ends_at" | "status">;
type ReservationNoShowCronRow = Pick<ReservationRow, "id" | "restaurant_id" | "status" | "starts_at" | "party_size"> & {
  locks?: Array<{ table_id: string | null; status: string }> | null;
  restaurant?: { reservation_arrival_grace_minutes: number | null } | Array<{ reservation_arrival_grace_minutes: number | null }> | null;
};
type ReservationNotificationOutboxRow = {
  id: string;
  restaurant_id: string;
  reservation_id: string;
  channel: string;
};
type ReservationPreflightTableRow = CandidateReservationTable & {
  qr_enabled: boolean;
};
type ReservationPreflightLockRow = {
  id: string;
  reservation_id: string;
  table_id: string;
  starts_at: string;
  ends_at: string;
  reservation?: {
    id: string;
    customer_name: string;
    status: ReservationStatus | string;
    starts_at: string;
    ends_at: string;
    party_size: number;
  } | Array<{
    id: string;
    customer_name: string;
    status: ReservationStatus | string;
    starts_at: string;
    ends_at: string;
    party_size: number;
  }> | null;
};
type ReservationPreflightBillRow = {
  id: string;
  table_id: string | null;
  status: string;
  total: number;
  reservation_id: string | null;
};
type ReservationPreflightOrderRow = {
  id: string;
  table_id: string | null;
  status: string;
  total: number;
  bill_id: string | null;
};
type ReservationPreflightIssue = { code: string; message: string; tableId?: string; tableName?: string };
type ReservationPreflightSignal = { code: string; tone: "neutral" | "green" | "yellow" | "blue" | "red"; label: string };

type CandidateReservationTable = ReservationAssignableTable & {
  table_area_id: string | null;
  floor_label: string | null;
  seating_zone: "indoor" | "outdoor" | "mixed";
  table_kind: "standard" | "vip" | "bar" | "community";
  reservation_priority: number;
  is_bookable: boolean;
  is_hidden: boolean;
  is_under_maintenance: boolean;
};

export type ReservationSettings = Pick<
  RestaurantRow,
  | "id"
  | "name"
  | "slug"
  | "platform_status"
  | "deleted_at"
  | "bank_code"
  | "bank_account"
  | "bank_account_name"
  | "logo_url"
  | "address"
  | "store_lat"
  | "store_lng"
  | "hotline"
  | "contact_email"
  | "opening_time"
  | "closing_time"
  | "reservations_enabled"
  | "reservation_deposit_enabled"
  | "reservation_deposit_type"
  | "reservation_deposit_value"
  | "reservation_hold_minutes"
  | "reservation_duration_minutes"
  | "reservation_buffer_minutes"
  | "reservation_min_notice_minutes"
  | "reservation_max_days_ahead"
  | "reservation_arrival_grace_minutes"
>;

export type ReservationPayment = ReturnType<typeof buildVietQrUrl> & { method: "QR" };
export type ReservationStatusTimelineItem = {
  id: string;
  fromStatus: ReservationStatus | string | null;
  toStatus: ReservationStatus | string;
  actorType: "customer" | "merchant" | "staff" | "system";
  note: string | null;
  metadata: Json;
  createdAt: string;
};

export type ReservationSeatingZone = "indoor" | "outdoor" | "mixed";
export type ReservationTableKind = "standard" | "vip" | "bar" | "community";
type NormalizedReservationPreferences = {
  preferredTableAreaId: string | null;
  preferredSeatingZone: ReservationSeatingZone | null;
  preferredTableKind: ReservationTableKind | null;
};

export type ReservationTableAreaOption = {
  id: string;
  name: string;
  floorLabel: string | null;
  seatingZone: ReservationSeatingZone;
};

export type ReservationPreferenceOptions = {
  tableAreas: ReservationTableAreaOption[];
  seatingZones: ReservationSeatingZone[];
  tableKinds: ReservationTableKind[];
};

export type PublicReservationResult = {
  reservation: ReservationDto;
  token?: string;
  payment: ReservationPayment | null;
  timeline?: ReservationStatusTimelineItem[];
};

export type ReservationAvailabilitySlot = {
  startsAt: string;
  endsAt: string;
  available: boolean;
  tableCount: number;
  bestTableName: string | null;
  availabilityLevel: "sold_out" | "low" | "medium" | "high";
  recommendationLabel: string;
  recommendationReason: string;
};

const VN_UTC_OFFSET_MINUTES = 7 * 60;
const ACTIVE_BILL_AVOIDANCE_MINUTES = 120;
const ASSIGNMENT_ROTATION_WINDOW_MINUTES = 120;
const ASSIGNMENT_LOCK_LOOKBACK_MINUTES = 180;
const ASSIGNMENT_LOCK_LOOKAHEAD_MINUTES = 240;
const activeHoldStatuses = ["holding", "waiting_deposit_confirm"] satisfies ReservationDbStatus[];
const closedReservationStatuses = ["completed", "cancelled", "rejected", "expired", "no_show"] satisfies ReservationDbStatus[];

const reservationSelect =
  "id,restaurant_id,status,customer_name,customer_phone,customer_email,party_size,starts_at,ends_at,hold_expires_at,deposit_required_amount,deposit_paid_amount,deposit_status,payment_method,customer_note,internal_note,preferred_table_area_id,preferred_seating_zone,preferred_table_kind,source,idempotency_key,seated_table_bill_id,created_at,updated_at,confirmed_at,checked_in_at,seated_at,completed_at,cancelled_at,rejected_at,expired_at,no_show_at,locks:reservation_table_locks(id,table_id,starts_at,ends_at,status,table:tables(id,name,area,capacity,table_area_id,floor_label,seating_zone,table_kind))";

const legacyReservationSelect =
  "id,restaurant_id,status,customer_name,customer_phone,customer_email,party_size,starts_at,ends_at,hold_expires_at,deposit_required_amount,deposit_paid_amount,deposit_status,payment_method,customer_note,internal_note,source,idempotency_key,seated_table_bill_id,created_at,updated_at,confirmed_at,checked_in_at,seated_at,completed_at,cancelled_at,rejected_at,expired_at,no_show_at,locks:reservation_table_locks(id,table_id,starts_at,ends_at,status,table:tables(id,name,area,capacity,table_area_id,floor_label,seating_zone,table_kind))";

const candidateTableSelect =
  "id,name,area,capacity,table_area_id,floor_label,seating_zone,table_kind,reservation_priority,is_bookable,is_hidden,is_under_maintenance";
const reservationPreflightTableSelect =
  "id,name,area,capacity,table_area_id,floor_label,seating_zone,table_kind,reservation_priority,is_bookable,is_hidden,is_under_maintenance,qr_enabled";

const reservationAnalyticsSelect =
  "id,status,party_size,starts_at,created_at,deposit_required_amount,deposit_paid_amount,deposit_status,locks:reservation_table_locks(table:tables(name,area,capacity,floor_label))";

const reservationSettingsSelect =
  "id,name,slug,platform_status,deleted_at,bank_code,bank_account,bank_account_name,logo_url,address,store_lat,store_lng,hotline,contact_email,opening_time,closing_time,reservations_enabled,reservation_deposit_enabled,reservation_deposit_type,reservation_deposit_value,reservation_hold_minutes,reservation_duration_minutes,reservation_buffer_minutes,reservation_min_notice_minutes,reservation_max_days_ahead,reservation_arrival_grace_minutes";
const reservationIdempotencyKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstOrNull<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isMissingReservationPreferenceColumns(error: unknown) {
  const message = String((error as { message?: unknown } | null | undefined)?.message ?? "");
  return (
    message.includes("reservations.preferred_table_area_id") ||
    message.includes("reservations.preferred_seating_zone") ||
    message.includes("reservations.preferred_table_kind")
  );
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function assertReservationIdempotencyKey(idempotencyKey?: string) {
  if (idempotencyKey && !reservationIdempotencyKeyPattern.test(idempotencyKey)) {
    throw new AppError("Mã chống gửi trùng không hợp lệ.", 400);
  }
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function money(value: number) {
  return value.toLocaleString("vi-VN");
}

function timeOfDay(value: string | null, fallback: string) {
  return (value || fallback).slice(0, 5);
}

function vnDateString(date: Date) {
  return new Date(date.getTime() + VN_UTC_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

function vnDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00+07:00`);
}

function dayBounds(date: string, settings: ReservationSettings) {
  const start = vnDateTime(date, timeOfDay(settings.opening_time, "09:00"));
  let end = vnDateTime(date, timeOfDay(settings.closing_time, "22:00"));
  if (end <= start) end = addMinutes(end, 24 * 60);
  return { start, end };
}

function overlap(lockStart: Date, lockEnd: Date, targetStart: Date, targetEnd: Date) {
  return lockStart < targetEnd && lockEnd > targetStart;
}

function calculateDepositAmount(settings: ReservationSettings, partySize: number) {
  if (!settings.reservation_deposit_enabled) return 0;
  const value = Number(settings.reservation_deposit_value);
  if (value <= 0) return 0;
  return settings.reservation_deposit_type === "PER_PERSON" ? value * partySize : value;
}

function isActiveHoldStatus(status: ReservationStatus) {
  return activeHoldStatuses.some((item) => item === status);
}

function isClosedReservationStatus(status: ReservationStatus) {
  return closedReservationStatuses.some((item) => item === status);
}

function normalizeReservationSeatingZone(value?: string | null): ReservationSeatingZone | null {
  if (value === "indoor" || value === "outdoor" || value === "mixed") return value;
  return null;
}

function normalizeReservationTableKind(value?: string | null): ReservationTableKind | null {
  if (value === "standard" || value === "vip" || value === "bar" || value === "community") return value;
  return null;
}

function normalizeReservationPreferences(input: ReservationAssignmentPreferences): NormalizedReservationPreferences {
  return {
    preferredTableAreaId: input.preferredTableAreaId || null,
    preferredSeatingZone: normalizeReservationSeatingZone(input.preferredSeatingZone),
    preferredTableKind: normalizeReservationTableKind(input.preferredTableKind)
  };
}

function reservationPreferenceMetadata(preferences: ReservationAssignmentPreferences) {
  return {
    preferredTableAreaId: preferences.preferredTableAreaId ?? null,
    preferredSeatingZone: preferences.preferredSeatingZone ?? null,
    preferredTableKind: preferences.preferredTableKind ?? null
  };
}

function hasExpiredHold(reservation: Pick<ReservationDto, "status" | "holdExpiresAt">, now = new Date()) {
  if (!isActiveHoldStatus(reservation.status) || !reservation.holdExpiresAt) return false;
  return new Date(reservation.holdExpiresAt).getTime() <= now.getTime();
}

function assertReservationInsideOperatingHours(settings: ReservationSettings, startsAt: Date, endsAt: Date) {
  const candidateDates = [vnDateString(startsAt), vnDateString(addMinutes(startsAt, -24 * 60))];
  const isInsideOperatingWindow = candidateDates.some((date) => {
    const { start, end } = dayBounds(date, settings);
    return startsAt >= start && endsAt <= end;
  });

  if (!isInsideOperatingWindow) {
    throw new AppError("Khung giờ đặt bàn nằm ngoài giờ phục vụ của quán.", 400);
  }
}

function slotAvailabilityHint(slotStart: Date, tableCount: number) {
  if (tableCount <= 0) {
    return {
      availabilityLevel: "sold_out" as const,
      recommendationLabel: "Hết bàn",
      recommendationReason: "Không còn bàn phù hợp cho số khách này."
    };
  }

  const localHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      hour12: false
    }).format(slotStart)
  );

  if (tableCount <= 1) {
    return {
      availabilityLevel: "low" as const,
      recommendationLabel: "Sắp hết",
      recommendationReason: "Chỉ còn một bàn phù hợp, nên giữ chỗ sớm."
    };
  }

  if (localHour >= 18 && localHour <= 20) {
    return {
      availabilityLevel: "medium" as const,
      recommendationLabel: "Giờ đẹp",
      recommendationReason: "Khung giờ phù hợp cho bữa tối hoặc đi nhóm."
    };
  }

  if (tableCount >= 4) {
    return {
      availabilityLevel: "high" as const,
      recommendationLabel: "Rộng chỗ",
      recommendationReason: "Còn nhiều bàn phù hợp, dễ sắp xếp vị trí."
    };
  }

  return {
    availabilityLevel: "medium" as const,
    recommendationLabel: "Còn bàn",
    recommendationReason: "Có bàn phù hợp với số khách bạn chọn."
  };
}

function reservationPayment(
  settings: ReservationSettings,
  reservation: Pick<ReservationDto, "id" | "depositRequiredAmount" | "paymentMethod" | "status" | "depositStatus">
): ReservationPayment | null {
  if (reservation.depositRequiredAmount <= 0 || reservation.paymentMethod !== "QR") return null;
  if (!isActiveHoldStatus(reservation.status)) return null;
  if (!["waiting_payment", "waiting_confirm"].includes(reservation.depositStatus)) return null;
  if (!settings.bank_code || !settings.bank_account) return null;

  return {
    method: "QR",
    ...buildVietQrUrl({
      amount: reservation.depositRequiredAmount,
      orderId: reservation.id,
      prefix: "RESV",
      config: {
        bank: settings.bank_code,
        account: settings.bank_account,
        accountName: settings.bank_account_name ?? undefined
      }
    })
  };
}

function mapReservation(row: ReservationRow & { locks?: ReservationLockRow[] | null }): ReservationDto {
  const locks = row.locks ?? [];
  const lifecycle = row as ReservationRow & {
    checked_in_at?: string | null;
    completed_at?: string | null;
    rejected_at?: string | null;
  };

  return {
    id: row.id,
    status: row.status as ReservationStatus,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    partySize: row.party_size,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    holdExpiresAt: row.hold_expires_at,
    depositRequiredAmount: row.deposit_required_amount,
    depositPaidAmount: row.deposit_paid_amount,
    depositStatus: row.deposit_status as ReservationDepositStatus,
    paymentMethod: row.payment_method as PaymentMethod | null,
    customerNote: row.customer_note,
    internalNote: row.internal_note,
    preferredTableAreaId: row.preferred_table_area_id ?? null,
    preferredSeatingZone: row.preferred_seating_zone ?? null,
    preferredTableKind: row.preferred_table_kind ?? null,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confirmedAt: row.confirmed_at,
    checkedInAt: lifecycle.checked_in_at ?? null,
    seatedAt: row.seated_at,
    completedAt: lifecycle.completed_at ?? null,
    cancelledAt: row.cancelled_at,
    rejectedAt: lifecycle.rejected_at ?? null,
    expiredAt: row.expired_at,
    noShowAt: row.no_show_at,
    seatedTableBillId: row.seated_table_bill_id,
    tables: locks
      .filter((lock) => lock.status === "active")
      .map((lock) => firstOrNull(lock.table))
      .filter(
        (table): table is { id: string; name: string; area: string; capacity: number; table_area_id?: string | null; floor_label?: string | null; seating_zone?: string | null; table_kind?: string | null } =>
          Boolean(table)
      )
      .map((table) => ({
        id: table.id,
        name: table.name,
        area: table.area,
        capacity: table.capacity,
        tableAreaId: table.table_area_id ?? null,
        floorLabel: table.floor_label ?? null,
        seatingZone: table.seating_zone ?? null,
        tableKind: table.table_kind ?? null
      }))
  };
}

const reservationReminderNotifications = [
  {
    key: "customer_arrival_2h",
    audience: "customer",
    leadMinutes: 120,
    title: "Sắp đến giờ đặt bàn",
    body: "Lịch đặt bàn của bạn sắp tới giờ. Vui lòng đến đúng giờ để quán giữ bàn."
  },
  {
    key: "merchant_table_prep_30m",
    audience: "merchant",
    leadMinutes: 30,
    title: "Chuẩn bị bàn đặt trước",
    body: "Một lịch đặt đã gần tới giờ. Vui lòng kiểm tra bàn giữ và trạng thái cọc."
  }
] as const;

function reservationNotificationCopy(input: { toStatus: ReservationStatus | string; note?: string | null }) {
  if (input.note === "reservation_deposit_confirmed") {
    return { title: "Cọc đặt bàn đã được xác nhận", body: "Lịch đặt của bạn đã chắc bàn. Vui lòng đến đúng giờ đã đặt." };
  }
  if (input.note === "reservation_rescheduled") {
    return { title: "Quán đã cập nhật giờ giữ bàn", body: "Vui lòng kiểm tra lại thời gian đến trong lịch đặt bàn của bạn." };
  }
  if (input.note === "reservation_table_moved" || input.note === "reservation_tables_merged") {
    return { title: "Quán đã cập nhật bàn giữ", body: "Bàn giữ đã được điều chỉnh để phù hợp tình trạng bàn thực tế." };
  }
  if (input.note === "reservation_checked_in") {
    return { title: "Đã check-in đặt bàn", body: "Quán đã ghi nhận khách tới nơi." };
  }
  if (input.note === "reservation_seated") {
    return { title: "Khách đã được nhận vào bàn", body: "Bạn có thể gọi món bằng QR tại bàn." };
  }
  if (input.note === "reservation_deposit_refunded") {
    return { title: "Cọc đã được đánh dấu hoàn", body: "Quán đã ghi nhận hoàn cọc thủ công cho lịch đặt này." };
  }
  if (input.toStatus === "confirmed") {
    return { title: "Lịch đặt bàn đã được xác nhận", body: "Quán đã xác nhận lịch đặt. Vui lòng đến đúng giờ để giữ bàn." };
  }
  if (input.toStatus === "cancelled") {
    return { title: "Lịch đặt bàn đã huỷ", body: "Lịch đặt đã dừng xử lý. Nếu cần hỗ trợ, vui lòng gọi quán." };
  }
  if (input.toStatus === "rejected") {
    return { title: "Quán chưa thể nhận lịch", body: "Quán chưa thể nhận lịch này. Bạn có thể chọn khung giờ khác." };
  }
  if (input.toStatus === "expired") {
    return { title: "Lịch giữ bàn đã hết hạn", body: "Thời gian giữ bàn đã hết. Vui lòng tạo lịch mới nếu vẫn cần đặt bàn." };
  }
  if (input.toStatus === "no_show") {
    return { title: "Lịch được ghi nhận không đến", body: "Lịch này đã được ghi nhận là khách không đến." };
  }
  if (input.toStatus === "completed") {
    return { title: "Phiên bàn đã hoàn tất", body: "Cảm ơn bạn đã sử dụng dịch vụ của quán." };
  }
  return null;
}

async function enqueueReservationNotification(
  supabase: ReservationSupabaseClient,
  input: {
    restaurantId: string;
    reservationId: string;
    toStatus: ReservationStatus | string;
    note?: string | null;
    metadata?: Record<string, string | number | boolean | null | undefined>;
  }
) {
  const copy = reservationNotificationCopy(input);
  if (!copy) return;

  const { error } = await (supabase as any).from("reservation_notification_outbox").insert({
    restaurant_id: input.restaurantId,
    reservation_id: input.reservationId,
    audience: "customer",
    channel: "in_app",
    status: "queued",
    title: copy.title,
    body: copy.body,
    payload: {
      toStatus: input.toStatus,
      note: input.note ?? null,
      ...(input.metadata ?? {})
    }
  });

  if (error) {
    console.error("reservation_notification_enqueue_failed", {
      reservationId: input.reservationId,
      toStatus: input.toStatus,
      error: error.message
    });
  }
}

function reservationReminderDedupeKey(reservationId: string, reminderKey: string) {
  return `reservation:${reservationId}:reminder:${reminderKey}`.toLowerCase();
}

function scheduledReminderAt(startsAt: Date, leadMinutes: number) {
  return new Date(Math.max(Date.now(), addMinutes(startsAt, -leadMinutes).getTime())).toISOString();
}

async function scheduleReservationReminderNotifications(
  supabase: ReservationSupabaseClient,
  input: {
    restaurantId: string;
    reservationId: string;
    startsAt: string;
    partySize: number;
    customerName?: string | null;
  }
) {
  const startsAt = new Date(input.startsAt);
  if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() <= Date.now()) return;

  const rows = reservationReminderNotifications.map((reminder) => ({
    restaurant_id: input.restaurantId,
    reservation_id: input.reservationId,
    audience: reminder.audience,
    channel: "in_app",
    status: "queued",
    title: reminder.title,
    body: reminder.body,
    scheduled_at: scheduledReminderAt(startsAt, reminder.leadMinutes),
    dedupe_key: reservationReminderDedupeKey(input.reservationId, reminder.key),
    payload: {
      kind: reminder.key,
      startsAt: startsAt.toISOString(),
      leadMinutes: reminder.leadMinutes,
      partySize: input.partySize,
      customerName: input.customerName ?? null
    }
  }));

  const { error } = await (supabase as any).from("reservation_notification_outbox").upsert(rows, {
    onConflict: "restaurant_id,dedupe_key"
  });

  if (error) {
    console.error("reservation_reminder_schedule_failed", {
      reservationId: input.reservationId,
      error: error.message
    });
  }
}

async function skipQueuedReservationReminderNotifications(
  supabase: ReservationSupabaseClient,
  input: {
    restaurantId: string;
    reservationId: string;
    reason: string;
  }
) {
  const { error } = await (supabase as any)
    .from("reservation_notification_outbox")
    .update({ status: "skipped", error_message: input.reason })
    .eq("restaurant_id", input.restaurantId)
    .eq("reservation_id", input.reservationId)
    .eq("status", "queued")
    .like("dedupe_key", `reservation:${input.reservationId}:reminder:%`);

  if (error) {
    console.error("reservation_reminder_skip_failed", {
      reservationId: input.reservationId,
      reason: input.reason,
      error: error.message
    });
  }
}

export async function processDueReservationNotifications(
  restaurantId?: string,
  options: {
    limit?: number;
    maxBatches?: number;
  } = {}
) {
  const supabase = createAdminSupabaseClient();
  const limit = options.limit ?? 250;
  const maxBatches = options.maxBatches ?? 1;
  let batches = 0;
  let scanned = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let hasMore = false;

  while (batches < maxBatches) {
    const now = new Date().toISOString();
    let query = (supabase as any)
      .from("reservation_notification_outbox")
      .select("id,restaurant_id,reservation_id,channel")
      .eq("status", "queued")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(limit);

    if (restaurantId) query = query.eq("restaurant_id", restaurantId);
    const { data, error } = await query;
    throwIfSupabaseError(error);

    const rows = (data ?? []) as ReservationNotificationOutboxRow[];
    if (rows.length === 0) break;

    batches += 1;
    scanned += rows.length;
    hasMore = rows.length === limit;

    for (const row of rows) {
      const statusPatch =
        row.channel === "in_app"
          ? { status: "sent", sent_at: now, error_message: null }
          : { status: "skipped", error_message: `unsupported_channel:${row.channel}` };

      const { data: updated, error: updateError } = await (supabase as any)
        .from("reservation_notification_outbox")
        .update(statusPatch)
        .eq("id", row.id)
        .eq("restaurant_id", row.restaurant_id)
        .eq("status", "queued")
        .select("id,status");

      if (updateError) {
        failed += 1;
        console.error("reservation_notification_process_failed", {
          reservationId: row.reservation_id,
          channel: row.channel,
          error: updateError.message
        });
        continue;
      }

      const updatedStatus = (updated?.[0]?.status ?? null) as string | null;
      if (updatedStatus === "sent") sent += 1;
      if (updatedStatus === "skipped") skipped += 1;
    }

    if (rows.length < limit) {
      hasMore = false;
      break;
    }
  }

  return { batches, scanned, sent, skipped, failed, hasMore: hasMore && batches === maxBatches };
}

async function recordReservationStatusChange(
  supabase: ReservationSupabaseClient,
  input: {
    restaurantId: string;
    reservationId: string;
    fromStatus: ReservationStatus | string | null;
    toStatus: ReservationStatus | string;
    actorType: "customer" | "merchant" | "staff" | "system";
    actorUserId?: string | null;
    note?: string | null;
    metadata?: Record<string, string | number | boolean | null | undefined>;
  }
) {
  if (input.fromStatus === input.toStatus && !input.note) return;
  const { error } = await (supabase as any).from("reservation_status_logs").insert({
    restaurant_id: input.restaurantId,
    reservation_id: input.reservationId,
    from_status: input.fromStatus,
    to_status: input.toStatus,
    actor_type: input.actorType,
    actor_user_id: input.actorUserId ?? null,
    note: input.note ?? null,
    metadata: input.metadata ?? {}
  });

  if (error) {
    console.error("reservation_status_log_failed", {
      reservationId: input.reservationId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      error: error.message
    });
    return;
  }

  await enqueueReservationNotification(supabase, input);
}

async function recordReservationCustomerRiskEvent(
  supabase: ReservationSupabaseClient,
  input: {
    restaurantId: string;
    reservation: Pick<ReservationDto, "id" | "customerName" | "customerPhone" | "depositPaidAmount" | "depositStatus" | "partySize" | "startsAt">;
    eventType: "no_show" | "deposit_forfeited" | "refund_due" | "refund_completed" | "deposit_cancelled";
    severity: "watch" | "risk" | "blocked";
    metadata?: Record<string, string | number | boolean | null | undefined>;
  }
) {
  const { error } = await (supabase as any).from("reservation_customer_risk_events").insert({
    restaurant_id: input.restaurantId,
    reservation_id: input.reservation.id,
    customer_phone: input.reservation.customerPhone.replace(/\s+/g, ""),
    customer_name: input.reservation.customerName,
    event_type: input.eventType,
    severity: input.severity,
    metadata: {
      partySize: input.reservation.partySize,
      startsAt: input.reservation.startsAt,
      depositPaidAmount: input.reservation.depositPaidAmount,
      depositStatus: input.reservation.depositStatus,
      ...(input.metadata ?? {})
    }
  });

  if (error) {
    console.error("reservation_customer_risk_event_failed", {
      reservationId: input.reservation.id,
      eventType: input.eventType,
      error: error.message
    });
  }
}

async function applyReservationClosureDepositDisposition(
  supabase: ReservationSupabaseClient,
  input: {
    restaurantId: string;
    reservation: ReservationDto;
    closure: "merchant_cancel" | "customer_cancel" | "reject" | "no_show" | "expired";
    source: string;
  }
) {
  const disposition = resolveReservationClosureDepositDisposition(input.reservation, input.closure);
  if (!disposition) return null;

  if (disposition.nextDepositStatus !== input.reservation.depositStatus) {
    const { error } = await supabase
      .from("reservations")
      .update({ deposit_status: disposition.nextDepositStatus })
      .eq("id", input.reservation.id)
      .eq("restaurant_id", input.restaurantId);
    throwIfSupabaseError(error);
  }

  await ensureReservationDepositLogEvent(supabase, {
    reservationId: input.reservation.id,
    restaurantId: input.restaurantId,
    method: input.reservation.paymentMethod ?? "QR",
    status: disposition.logStatus,
    amount: Math.max(input.reservation.depositPaidAmount, input.reservation.depositRequiredAmount),
    source: input.source,
    transitionKey: reservationDepositTransitionKey(input.reservation.id, `${input.closure}-${disposition.nextDepositStatus}`),
    rawData: {
      closure: input.closure,
      disposition: disposition.nextDepositStatus,
      label: disposition.label
    }
  });

  if (disposition.riskEventType) {
    await recordReservationCustomerRiskEvent(supabase, {
      restaurantId: input.restaurantId,
      reservation: input.reservation,
      eventType: disposition.riskEventType,
      severity: disposition.riskEventType === "deposit_forfeited" ? "risk" : "watch",
      metadata: {
        closure: input.closure,
        disposition: disposition.nextDepositStatus
      }
    });
  }

  return disposition;
}

async function listReservationStatusTimeline(restaurantId: string, reservationId: string): Promise<ReservationStatusTimelineItem[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("reservation_status_logs")
    .select("id,from_status,to_status,actor_type,note,metadata,created_at")
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", reservationId)
    .order("created_at", { ascending: true })
    .limit(40);

  throwIfSupabaseError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actorType: row.actor_type,
    note: row.note,
    metadata: row.metadata ?? {},
    createdAt: row.created_at
  }));
}

async function recordOccupancyEvent(
  supabase: ReservationSupabaseClient,
  input: {
    restaurantId: string;
    tableId?: string | null;
    tableBillId?: string | null;
    reservationId?: string | null;
    eventType: "reservation_created" | "reservation_cancelled" | "reservation_no_show" | "reservation_checked_in" | "reservation_seated" | "reservation_completed" | "table_released";
    partySize?: number | null;
    metadata?: Record<string, string | number | boolean | null | undefined>;
  }
) {
  const { error } = await (supabase as any).from("occupancy_logs").insert({
    restaurant_id: input.restaurantId,
    table_id: input.tableId ?? null,
    table_bill_id: input.tableBillId ?? null,
    reservation_id: input.reservationId ?? null,
    event_type: input.eventType,
    party_size: input.partySize ?? null,
    metadata: input.metadata ?? {}
  });

  if (error) {
    console.error("occupancy_log_failed", {
      reservationId: input.reservationId,
      eventType: input.eventType,
      error: error.message
    });
  }
}

async function recordReservationTableOccupancyEvents(
  supabase: ReservationSupabaseClient,
  input: {
    restaurantId: string;
    reservation: Pick<ReservationDto, "id" | "partySize" | "tables">;
    eventType: "reservation_cancelled" | "reservation_no_show" | "reservation_checked_in" | "reservation_seated" | "reservation_completed";
    tableBillId?: string | null;
    metadata?: Record<string, string | number | boolean | null | undefined>;
  }
) {
  const tableIds = input.reservation.tables.length > 0 ? input.reservation.tables.map((table) => table.id) : [null];
  await Promise.all(
    tableIds.map((tableId, index) =>
      recordOccupancyEvent(supabase, {
        restaurantId: input.restaurantId,
        tableId,
        tableBillId: input.tableBillId ?? null,
        reservationId: input.reservation.id,
        eventType: input.eventType,
        partySize: input.reservation.partySize,
        metadata: {
          ...(input.metadata ?? {}),
          tableRole: index === 0 ? "primary" : "merged",
          tableCount: tableIds.length
        }
      })
    )
  );
}

async function recordReservationLockOccupancyEvents(
  supabase: ReservationSupabaseClient,
  input: {
    restaurantId: string;
    reservationId: string;
    partySize?: number | null;
    locks?: Array<{ table_id: string | null; status: string }> | null;
    eventType: "reservation_no_show";
    metadata?: Record<string, string | number | boolean | null | undefined>;
  }
) {
  const activeLocks = input.locks?.filter((lock) => lock.status === "active") ?? [];
  const tableIds = activeLocks.length > 0 ? activeLocks.map((lock) => lock.table_id) : [null];
  await Promise.all(
    tableIds.map((tableId, index) =>
      recordOccupancyEvent(supabase, {
        restaurantId: input.restaurantId,
        tableId,
        reservationId: input.reservationId,
        eventType: input.eventType,
        partySize: input.partySize,
        metadata: {
          ...(input.metadata ?? {}),
          tableRole: index === 0 ? "primary" : "merged",
          tableCount: tableIds.length
        }
      })
    )
  );
}

async function getSettingsBySlug(slug: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("restaurants")
    .select(reservationSettingsSelect)
    .eq("slug", slug)
    .maybeSingle();

  throwIfSupabaseError(error);
  const settings = data as ReservationSettings | null;
  return isPublicTenantActive(settings) ? settings : null;
}

export const getPublicReservationSettingsBySlug = getSettingsBySlug;

async function getReservationPreferenceOptions(restaurantId: string): Promise<ReservationPreferenceOptions> {
  const supabase = createAdminSupabaseClient();
  const [areasResult, tablesResult] = await Promise.all([
    (supabase as any)
      .from("table_areas")
      .select("id,name,floor_label,seating_zone")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("tables")
      .select("table_area_id,seating_zone,table_kind")
      .eq("restaurant_id", restaurantId)
      .eq("is_bookable", true)
      .eq("is_hidden", false)
      .eq("is_under_maintenance", false)
  ]);

  throwIfSupabaseError(areasResult.error);
  throwIfSupabaseError(tablesResult.error);

  const tableAreas = ((areasResult.data ?? []) as Array<{
    id: string;
    name: string;
    floor_label: string | null;
    seating_zone: ReservationSeatingZone;
  }>);

  const tables = (tablesResult.data ?? []) as Array<{
    table_area_id: string | null;
    seating_zone: ReservationSeatingZone | null;
    table_kind: ReservationTableKind | null;
  }>;
  const bookableAreaIds = new Set(tables.map((table) => table.table_area_id).filter((value): value is string => Boolean(value)));
  const bookableTableAreas = tableAreas.filter((area) => bookableAreaIds.has(area.id)).map((area) => ({
    id: area.id,
    name: area.name,
    floorLabel: area.floor_label,
    seatingZone: area.seating_zone
  }));
  const seatingZones = Array.from(new Set(tables.map((table) => table.seating_zone).filter((value): value is ReservationSeatingZone => Boolean(value))));
  const tableKinds = Array.from(new Set(tables.map((table) => table.table_kind).filter((value): value is ReservationTableKind => Boolean(value))));

  return { tableAreas: bookableTableAreas, seatingZones, tableKinds };
}

export async function getPublicReservationPreferenceOptionsBySlug(slug: string) {
  const settings = await getSettingsBySlug(slug);
  if (!settings) return null;
  return getReservationPreferenceOptions(settings.id);
}

export async function getReservationSettings(restaurantId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("restaurants")
    .select(reservationSettingsSelect)
    .eq("id", restaurantId)
    .single();

  throwIfSupabaseError(error);
  return data as ReservationSettings;
}

export async function expireReservationHolds(
  restaurantId?: string,
  options: {
    limit?: number;
    maxBatches?: number;
  } = {}
) {
  const supabase = createAdminSupabaseClient();
  const limit = options.limit ?? 250;
  const maxBatches = options.maxBatches ?? 1;
  let batches = 0;
  let expired = 0;
  let hasMore = false;

  while (batches < maxBatches) {
    const now = new Date().toISOString();
    let query = supabase
      .from("reservations")
      .select("id,restaurant_id,status")
      .in("status", activeHoldStatuses)
      .lt("hold_expires_at", now)
      .limit(limit);

    if (restaurantId) query = query.eq("restaurant_id", restaurantId);
    const { data, error } = await query;
    throwIfSupabaseError(error);

    const rows = data ?? [];
    if (rows.length === 0) break;

    batches += 1;
    hasMore = rows.length === limit;

    const ids = rows.map((row) => row.id);
    const { error: reservationError } = await supabase
      .from("reservations")
      .update({ status: "expired", expired_at: now })
      .in("id", ids);
    throwIfSupabaseError(reservationError);

    const { error: lockError } = await supabase
      .from("reservation_table_locks")
      .update({ status: "released" })
      .in("reservation_id", ids);
    throwIfSupabaseError(lockError);

    for (const row of rows) {
      await recordReservationStatusChange(supabase, {
        restaurantId: row.restaurant_id,
        reservationId: row.id,
        fromStatus: row.status,
        toStatus: "expired",
        actorType: "system",
        note: "reservation_hold_expired"
      });
      await skipQueuedReservationReminderNotifications(supabase, {
        restaurantId: row.restaurant_id,
        reservationId: row.id,
        reason: "reservation_expired"
      });
      invalidateRestaurantDashboardCache(row.restaurant_id);
    }
    expired += rows.length;

    if (rows.length < limit) {
      hasMore = false;
      break;
    }
  }

  return { batches, expired, hasMore: hasMore && batches === maxBatches };
}

export async function markOverdueReservationNoShows(
  restaurantId?: string,
  options: {
    limit?: number;
    maxBatches?: number;
  } = {}
) {
  const supabase = createAdminSupabaseClient();
  const limit = options.limit ?? 250;
  const maxBatches = options.maxBatches ?? 1;
  let batches = 0;
  let scanned = 0;
  let noShow = 0;
  let hasMore = false;

  while (batches < maxBatches) {
    const now = new Date();
    const nowIso = now.toISOString();
    let query = supabase
      .from("reservations")
      .select("id,restaurant_id,status,starts_at,party_size,locks:reservation_table_locks(table_id,status),restaurant:restaurants(reservation_arrival_grace_minutes)")
      .eq("status", "confirmed")
      .lt("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(limit);

    if (restaurantId) query = query.eq("restaurant_id", restaurantId);
    const { data, error } = await query;
    throwIfSupabaseError(error);

    const rows = (data ?? []) as unknown as ReservationNoShowCronRow[];
    if (rows.length === 0) break;

    batches += 1;
    scanned += rows.length;

    const eligibleRows = rows.filter((row) => {
      const restaurant = firstOrNull(row.restaurant);
      const graceMinutes = Number(restaurant?.reservation_arrival_grace_minutes ?? 0);
      return isReservationPastNoShowGrace(row.starts_at, graceMinutes, now);
    });

    if (eligibleRows.length === 0) {
      hasMore = false;
      break;
    }

    const eligibleIds = eligibleRows.map((row) => row.id);
    const { data: updated, error: updateError } = await supabase
      .from("reservations")
      .update({ status: "no_show", no_show_at: nowIso })
      .in("id", eligibleIds)
      .eq("status", "confirmed")
      .select("id");
    throwIfSupabaseError(updateError);

    const updatedIds = new Set((updated ?? []).map((row) => row.id));
    const updatedRows = eligibleRows.filter((row) => updatedIds.has(row.id));
    if (updatedRows.length > 0) {
      const { error: lockError } = await supabase
        .from("reservation_table_locks")
        .update({ status: "released" })
        .in("reservation_id", Array.from(updatedIds))
        .eq("status", "active");
      throwIfSupabaseError(lockError);

      for (const row of updatedRows) {
        const reservation = await getFreshReservationById(row.id, row.restaurant_id);
        const depositDisposition = await applyReservationClosureDepositDisposition(supabase, {
          restaurantId: row.restaurant_id,
          reservation,
          closure: "no_show",
          source: "reservation_auto_no_show"
        });
        await recordReservationCustomerRiskEvent(supabase, {
          restaurantId: row.restaurant_id,
          reservation,
          eventType: "no_show",
          severity: depositDisposition?.nextDepositStatus === "forfeited" ? "risk" : "watch",
          metadata: {
            source: "cron",
            depositDisposition: depositDisposition?.nextDepositStatus ?? null
          }
        });
        await recordReservationStatusChange(supabase, {
          restaurantId: row.restaurant_id,
          reservationId: row.id,
          fromStatus: row.status,
          toStatus: "no_show",
          actorType: "system",
          note: "reservation_auto_no_show",
          metadata: depositDisposition ? { depositDisposition: depositDisposition.nextDepositStatus } : undefined
        });
        await recordReservationLockOccupancyEvents(supabase, {
          restaurantId: row.restaurant_id,
          reservationId: row.id,
          eventType: "reservation_no_show",
          partySize: row.party_size,
          locks: row.locks,
          metadata: { source: "cron" }
        });
        await skipQueuedReservationReminderNotifications(supabase, {
          restaurantId: row.restaurant_id,
          reservationId: row.id,
          reason: "reservation_auto_no_show"
        });
        invalidateRestaurantDashboardCache(row.restaurant_id);
      }
    }

    noShow += updatedRows.length;
    hasMore = rows.length === limit && eligibleRows.length === rows.length;
    if (!hasMore) break;
  }

  return { batches, scanned, noShow, hasMore: hasMore && batches === maxBatches };
}

export async function runReservationLifecycleAutomation(
  restaurantId?: string,
  options: {
    limit?: number;
    maxBatches?: number;
  } = {}
) {
  const holds = await expireReservationHolds(restaurantId, options);
  const noShows = await markOverdueReservationNoShows(restaurantId, options);
  const notifications = await processDueReservationNotifications(restaurantId, options);
  return {
    holds,
    noShows,
    notifications,
    hasMore: holds.hasMore || noShows.hasMore || notifications.hasMore
  };
}

async function getActiveLocks(restaurantId: string, startsAt: Date, endsAt: Date, excludeReservationId?: string) {
  const supabase = createAdminSupabaseClient();
  let query = supabase
    .from("reservation_table_locks")
    .select("id,reservation_id,restaurant_id,table_id,starts_at,ends_at,status")
    .eq("restaurant_id", restaurantId)
    .eq("status", "active")
    .lt("starts_at", endsAt.toISOString())
    .gt("ends_at", startsAt.toISOString());

  if (excludeReservationId) query = query.neq("reservation_id", excludeReservationId);
  const { data, error } = await query;
  throwIfSupabaseError(error);
  return data ?? [];
}

async function getNearbyActiveLocks(restaurantId: string, startsAt: Date, endsAt: Date, excludeReservationId?: string) {
  return getActiveLocks(
    restaurantId,
    addMinutes(startsAt, -ASSIGNMENT_LOCK_LOOKBACK_MINUTES),
    addMinutes(endsAt, ASSIGNMENT_LOCK_LOOKAHEAD_MINUTES),
    excludeReservationId
  );
}

async function validateReservationPreferences(restaurantId: string, preferences: ReservationAssignmentPreferences) {
  const normalized = normalizeReservationPreferences(preferences);
  if (!normalized.preferredTableAreaId) return normalized;

  const supabase = createAdminSupabaseClient();
  const { data, error } = await (supabase as any)
    .from("table_areas")
    .select("id")
    .eq("id", normalized.preferredTableAreaId)
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .maybeSingle();

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Khu vực bàn đã chọn không còn khả dụng.", 400);
  return normalized;
}

async function getCandidateTables(restaurantId: string, partySize: number, preferences: ReservationAssignmentPreferences = {}) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("tables")
    .select(candidateTableSelect)
    .eq("restaurant_id", restaurantId)
    .eq("is_bookable", true)
    .eq("is_hidden", false)
    .eq("is_under_maintenance", false)
    .gte("capacity", partySize)
    .order("capacity", { ascending: true })
    .order("reservation_priority", { ascending: true })
    .order("name", { ascending: true });

  throwIfSupabaseError(error);
  return rankReservationTablesForAssignment((data ?? []) as CandidateReservationTable[], partySize, preferences);
}

function normalizeReservationTableIds(tableIds: string[]) {
  const uniqueTableIds = Array.from(new Set(tableIds));
  if (uniqueTableIds.length === 0) throw new AppError("Vui lòng chọn ít nhất một bàn giữ chỗ.", 400);
  if (uniqueTableIds.length !== tableIds.length) throw new AppError("Vui lòng không chọn trùng bàn khi ghép bàn.", 400);
  return uniqueTableIds;
}

async function getBookableTablesByIds(restaurantId: string, tableIds: string[]) {
  const uniqueTableIds = normalizeReservationTableIds(tableIds);
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("tables")
    .select(candidateTableSelect)
    .eq("restaurant_id", restaurantId)
    .in("id", uniqueTableIds);

  throwIfSupabaseError(error);
  const tableById = new Map((data ?? []).map((table) => [table.id, table as CandidateReservationTable]));
  const orderedTables = uniqueTableIds.map((tableId) => tableById.get(tableId));
  if (orderedTables.some((table) => !table)) throw new AppError("Một số bàn đã chọn không tồn tại trong quán.", 400);

  const unavailableTable = orderedTables.find((table) => table && (!table.is_bookable || table.is_hidden || table.is_under_maintenance));
  if (unavailableTable) throw new AppError(`Bàn ${unavailableTable.name} không khả dụng cho đặt trước.`, 400);
  return orderedTables.filter((table): table is CandidateReservationTable => Boolean(table));
}

async function getActiveReservationLocks(restaurantId: string, reservationId: string): Promise<ReservationActiveLock[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("reservation_table_locks")
    .select("id,reservation_id,restaurant_id,table_id,starts_at,ends_at,status")
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", reservationId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  throwIfSupabaseError(error);
  return (data ?? []) as ReservationActiveLock[];
}

async function getAvailableTables(
  restaurantId: string,
  partySize: number,
  startsAt: Date,
  endsAt: Date,
  preferences: ReservationAssignmentPreferences = {},
  excludeReservationId?: string
) {
  const [tables, locks, activeBillTableIds] = await Promise.all([
    getCandidateTables(restaurantId, partySize, preferences),
    getNearbyActiveLocks(restaurantId, startsAt, endsAt, excludeReservationId),
    getActiveBillTableIds(restaurantId)
  ]);
  const availableTables = tables.filter(
    (table) =>
      !hasNearTermActiveBill(table.id, startsAt, activeBillTableIds) &&
      !locks.some((lock) => lock.table_id === table.id && overlap(new Date(lock.starts_at), new Date(lock.ends_at), startsAt, endsAt))
  );
  return rankAvailableTablesForSlot(availableTables, locks, activeBillTableIds, partySize, startsAt, endsAt, preferences);
}

async function getAvailabilityContext(restaurantId: string, partySize: number, startsAt: Date, endsAt: Date, preferences: ReservationAssignmentPreferences = {}) {
  const [tables, locks, activeBillTableIds] = await Promise.all([
    getCandidateTables(restaurantId, partySize, preferences),
    getNearbyActiveLocks(restaurantId, startsAt, endsAt),
    getActiveBillTableIds(restaurantId)
  ]);

  return { tables, locks, activeBillTableIds };
}

async function getActiveBillTableIds(restaurantId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("table_bills")
    .select("table_id")
    .eq("restaurant_id", restaurantId)
    .in("status", ["open", "waiting_payment", "waiting_confirm"]);

  throwIfSupabaseError(error);
  return new Set((data ?? []).map((bill) => bill.table_id));
}

function minutesBetween(left: Date, right: Date) {
  return Math.round((right.getTime() - left.getTime()) / 60_000);
}

function buildAssignmentSignals(
  tables: Array<Pick<CandidateReservationTable, "id">>,
  locks: Array<{ table_id: string | null; starts_at: string; ends_at: string }>,
  startsAt: Date,
  endsAt: Date,
  activeBillTableIds: Set<string>
): ReservationAssignmentTableSignal[] {
  return tables.map((table) => {
    const tableLocks = locks.filter((lock) => lock.table_id === table.id);
    const previousLockEnds = tableLocks
      .map((lock) => new Date(lock.ends_at))
      .filter((lockEnd) => lockEnd <= startsAt)
      .sort((left, right) => right.getTime() - left.getTime());
    const nextLockStarts = tableLocks
      .map((lock) => new Date(lock.starts_at))
      .filter((lockStart) => lockStart >= endsAt)
      .sort((left, right) => left.getTime() - right.getTime());

    return {
      tableId: table.id,
      minutesSincePreviousReservation: previousLockEnds[0] ? minutesBetween(previousLockEnds[0], startsAt) : null,
      minutesUntilNextReservation: nextLockStarts[0] ? minutesBetween(endsAt, nextLockStarts[0]) : null,
      nearbyReservationCount: tableLocks.length,
      hasActiveBill: activeBillTableIds.has(table.id)
    };
  });
}

function rankAvailableTablesForSlot<T extends CandidateReservationTable>(
  tables: T[],
  locks: Array<{ table_id: string | null; starts_at: string; ends_at: string }>,
  activeBillTableIds: Set<string>,
  partySize: number,
  startsAt: Date,
  endsAt: Date,
  preferences: ReservationAssignmentPreferences
) {
  return rankReservationTablesForAssignment(tables, partySize, preferences, {
    rotationWindowMinutes: ASSIGNMENT_ROTATION_WINDOW_MINUTES,
    tableSignals: buildAssignmentSignals(tables, locks, startsAt, endsAt, activeBillTableIds)
  });
}

function hasNearTermActiveBill(tableId: string, startsAt: Date, activeBillTableIds: Set<string>) {
  if (!activeBillTableIds.has(tableId)) return false;
  return startsAt.getTime() <= addMinutes(new Date(), ACTIVE_BILL_AVOIDANCE_MINUTES).getTime();
}

function tableSetCapacity(tables: Array<Pick<CandidateReservationTable, "capacity">>) {
  return tables.reduce((total, table) => total + Number(table.capacity), 0);
}

function reservationTableLockReservation(lock: ReservationPreflightLockRow) {
  return firstOrNull(lock.reservation);
}

async function getReservationTablePreflightContext(input: {
  restaurantId: string;
  reservationId: string;
  tableIds: string[];
  startsAt: Date;
  lockEnd: Date;
}) {
  const supabase = createAdminSupabaseClient();
  const [tablesResult, locksResult, billsResult, ordersResult] = await Promise.all([
    supabase
      .from("tables")
      .select(reservationPreflightTableSelect)
      .eq("restaurant_id", input.restaurantId)
      .in("id", input.tableIds),
    (supabase as any)
      .from("reservation_table_locks")
      .select("id,reservation_id,table_id,starts_at,ends_at,reservation:reservations(id,customer_name,status,starts_at,ends_at,party_size)")
      .eq("restaurant_id", input.restaurantId)
      .eq("status", "active")
      .in("table_id", input.tableIds)
      .neq("reservation_id", input.reservationId)
      .lt("starts_at", input.lockEnd.toISOString())
      .gt("ends_at", input.startsAt.toISOString()),
    supabase
      .from("table_bills")
      .select("id,table_id,status,total,reservation_id")
      .eq("restaurant_id", input.restaurantId)
      .in("status", ["open", "waiting_payment", "waiting_confirm"])
      .in("table_id", input.tableIds),
    supabase
      .from("orders")
      .select("id,table_id,status,total,bill_id")
      .eq("restaurant_id", input.restaurantId)
      .in("status", ["pending", "ordering", "waiting_payment", "waiting_confirm", "completed"])
      .in("table_id", input.tableIds)
  ]);

  throwIfSupabaseError(tablesResult.error);
  throwIfSupabaseError(locksResult.error);
  throwIfSupabaseError(billsResult.error);
  throwIfSupabaseError(ordersResult.error);

  return {
    tables: (tablesResult.data ?? []) as ReservationPreflightTableRow[],
    locks: (locksResult.data ?? []) as ReservationPreflightLockRow[],
    bills: (billsResult.data ?? []) as ReservationPreflightBillRow[],
    orders: (ordersResult.data ?? []) as ReservationPreflightOrderRow[]
  };
}

export async function preflightReservationTables(restaurantId: string, reservationId: string, tableIds: string[]) {
  const reservation = await getFreshReservationById(reservationId, restaurantId);
  const normalizedTableIds = normalizeReservationTableIds(tableIds);
  const currentLocks = await getActiveReservationLocks(restaurantId, reservationId);
  const settings = currentLocks.length === 0 ? await getReservationSettingsByAdmin(restaurantId) : null;
  const startsAt = new Date(currentLocks[0]?.starts_at ?? reservation.startsAt);
  const lockEnd = currentLocks[0]?.ends_at ? new Date(currentLocks[0].ends_at) : addMinutes(new Date(reservation.endsAt), Number(settings?.reservation_buffer_minutes ?? 0));
  const context = await getReservationTablePreflightContext({
    restaurantId,
    reservationId,
    tableIds: normalizedTableIds,
    startsAt,
    lockEnd
  });
  const tableById = new Map(context.tables.map((table) => [table.id, table]));
  const totalCapacity = context.tables.reduce((sum, table) => sum + Number(table.capacity), 0);
  const blockers: Array<{ code: string; message: string; tableId?: string; tableName?: string }> = [];
  const warnings: Array<{ code: string; message: string; tableId?: string; tableName?: string }> = [];
  const missingTableIds = normalizedTableIds.filter((tableId) => !tableById.has(tableId));

  for (const tableId of missingTableIds) {
    blockers.push({ code: "missing_table", tableId, message: "Một số bàn đã chọn không tồn tại trong quán." });
  }
  if (reservation.seatedTableBillId || reservation.status === "seated") {
    blockers.push({ code: "already_seated", message: "Lịch đã vào bàn. Hãy đổi bàn trong hóa đơn đang phục vụ." });
  }
  if (isClosedReservationStatus(reservation.status)) {
    blockers.push({ code: "closed_reservation", message: "Không thể đổi bàn cho lịch đặt đã kết thúc." });
  }
  if (totalCapacity < reservation.partySize) {
    blockers.push({
      code: "under_capacity",
      message: `Nhóm bàn đã chọn chỉ đủ ${totalCapacity} khách, cần tối thiểu ${reservation.partySize} khách.`
    });
  }

  const tableSummaries = normalizedTableIds.map((tableId) => {
    const table = tableById.get(tableId);
    const tableLocks = context.locks.filter((lock) => lock.table_id === tableId);
    const tableBills = context.bills.filter((bill) => bill.table_id === tableId);
    const tableOrders = context.orders.filter((order) => order.table_id === tableId);
    const signals: Array<{ code: string; tone: "neutral" | "green" | "yellow" | "blue" | "red"; label: string }> = [];
    const conflicts = tableLocks.map((lock) => {
      const lockReservation = reservationTableLockReservation(lock);
      return {
        reservationId: lock.reservation_id,
        customerName: lockReservation?.customer_name ?? "Lịch khác",
        status: lockReservation?.status ?? "confirmed",
        partySize: lockReservation?.party_size ?? null,
        startsAt: lock.starts_at,
        endsAt: lock.ends_at
      };
    });

    if (!table) {
      signals.push({ code: "missing_table", tone: "red", label: "Không tồn tại" });
      return {
        id: tableId,
        name: "Bàn không tồn tại",
        area: null,
        capacity: 0,
        floorLabel: null,
        seatingZone: null,
        tableKind: null,
        qrEnabled: false,
        isBookable: false,
        isHidden: true,
        isUnderMaintenance: false,
        activeBillCount: 0,
        activeOrderCount: 0,
        unpaidTotal: 0,
        conflicts,
        signals
      };
    }

    if (!table.is_bookable || table.is_hidden || table.is_under_maintenance) {
      blockers.push({ code: "unbookable_table", tableId: table.id, tableName: table.name, message: `Bàn ${table.name} không khả dụng cho đặt trước.` });
      signals.push({ code: "unbookable", tone: "red", label: "Không nhận đặt" });
    }
    if (conflicts.length > 0) {
      blockers.push({ code: "reservation_conflict", tableId: table.id, tableName: table.name, message: `Bàn ${table.name} đang có lịch giữ chỗ chồng giờ.` });
      signals.push({ code: "conflict", tone: "red", label: `${conflicts.length} chồng lịch` });
    }
    if (tableBills.length > 0) {
      warnings.push({ code: "active_bill", tableId: table.id, tableName: table.name, message: `Bàn ${table.name} đang có phiên bàn mở hoặc chờ thanh toán.` });
      signals.push({ code: "active_bill", tone: "blue", label: "Có bill mở" });
    }
    if (tableOrders.length > 0) {
      warnings.push({ code: "active_orders", tableId: table.id, tableName: table.name, message: `Bàn ${table.name} đang có đơn/order gắn bàn.` });
      signals.push({ code: "active_orders", tone: "blue", label: "Có order" });
    }
    if (!table.qr_enabled) {
      warnings.push({ code: "qr_disabled", tableId: table.id, tableName: table.name, message: `QR của bàn ${table.name} đang tắt.` });
      signals.push({ code: "qr_disabled", tone: "yellow", label: "QR tắt" });
    }
    if (table.capacity < reservation.partySize) {
      signals.push({ code: "needs_merge", tone: "yellow", label: "Cần ghép" });
    }
    if (table.table_kind === "vip") signals.push({ code: "vip", tone: "blue", label: "VIP" });
    if (table.seating_zone === "outdoor") signals.push({ code: "outdoor", tone: "yellow", label: "Ngoài trời" });

    return {
      id: table.id,
      name: table.name,
      area: table.area,
      capacity: table.capacity,
      floorLabel: table.floor_label,
      seatingZone: table.seating_zone,
      tableKind: table.table_kind,
      qrEnabled: table.qr_enabled,
      isBookable: table.is_bookable,
      isHidden: table.is_hidden,
      isUnderMaintenance: table.is_under_maintenance,
      activeBillCount: tableBills.length,
      activeOrderCount: tableOrders.length,
      unpaidTotal: tableBills.reduce((sum, bill) => sum + Number(bill.total), 0) + tableOrders.reduce((sum, order) => sum + Number(order.total), 0),
      conflicts,
      signals
    };
  });

  return {
    reservationId,
    partySize: reservation.partySize,
    startsAt: startsAt.toISOString(),
    lockEnd: lockEnd.toISOString(),
    tableIds: normalizedTableIds,
    tableCount: normalizedTableIds.length,
    totalCapacity,
    capacityGap: Math.max(0, reservation.partySize - totalCapacity),
    canSave: blockers.length === 0,
    blockers,
    warnings,
    tables: tableSummaries
  };
}

async function assertReservationTablesAvailable(input: {
  restaurantId: string;
  reservationId: string;
  partySize: number;
  tableIds: string[];
  startsAt: Date;
  lockEnd: Date;
}) {
  const tableIds = normalizeReservationTableIds(input.tableIds);
  const [tables, locks, activeBillTableIds] = await Promise.all([
    getBookableTablesByIds(input.restaurantId, tableIds),
    getActiveLocks(input.restaurantId, input.startsAt, input.lockEnd, input.reservationId),
    getActiveBillTableIds(input.restaurantId)
  ]);

  const capacity = tableSetCapacity(tables);
  if (capacity < input.partySize) {
    throw new AppError(`Nhóm bàn đã chọn chỉ đủ ${capacity} khách, cần tối thiểu ${input.partySize} khách.`, 400);
  }

  const busyTableNames = tables
    .filter((table) => locks.some((lock) => lock.table_id === table.id) || hasNearTermActiveBill(table.id, input.startsAt, activeBillTableIds))
    .map((table) => table.name);
  if (busyTableNames.length > 0) {
    throw new AppError(`Một số bàn đang bận trong khung giờ này: ${busyTableNames.join(", ")}.`, 409);
  }

  return tables;
}

async function safelyRollbackReservationTableLocks(
  supabase: ReservationSupabaseClient,
  input: {
    restaurantId: string;
    insertedLockIds: string[];
    updatedLocks: ReservationActiveLock[];
    releasedLocks: ReservationActiveLock[];
  }
) {
  try {
    if (input.insertedLockIds.length > 0) {
      await supabase.from("reservation_table_locks").update({ status: "released" }).eq("restaurant_id", input.restaurantId).in("id", input.insertedLockIds);
    }
    for (const lock of input.updatedLocks) {
      await supabase
        .from("reservation_table_locks")
        .update({ starts_at: lock.starts_at, ends_at: lock.ends_at, status: "active" })
        .eq("id", lock.id)
        .eq("restaurant_id", input.restaurantId);
    }
    for (const lock of input.releasedLocks) {
      await supabase
        .from("reservation_table_locks")
        .update({ starts_at: lock.starts_at, ends_at: lock.ends_at, status: "active" })
        .eq("id", lock.id)
        .eq("restaurant_id", input.restaurantId);
    }
  } catch (rollbackError) {
    console.error("reservation_table_lock_rollback_failed", {
      restaurantId: input.restaurantId,
      insertedLockIds: input.insertedLockIds,
      error: rollbackError instanceof Error ? rollbackError.message : "unknown"
    });
  }
}

async function replaceReservationTableLocks(input: {
  supabase: ReservationSupabaseClient;
  restaurantId: string;
  reservationId: string;
  currentLocks: ReservationActiveLock[];
  tableIds: string[];
  startsAt: Date;
  lockEnd: Date;
}) {
  const startsAtIso = input.startsAt.toISOString();
  const lockEndIso = input.lockEnd.toISOString();
  const tableIds = normalizeReservationTableIds(input.tableIds);
  const targetTableIdSet = new Set(tableIds);
  const lockByTableId = new Map<string, ReservationActiveLock>();
  const duplicateLocks: ReservationActiveLock[] = [];
  const insertedLockIds: string[] = [];
  const updatedLocks: ReservationActiveLock[] = [];
  const releasedLocks: ReservationActiveLock[] = [];

  for (const lock of input.currentLocks) {
    if (lockByTableId.has(lock.table_id)) {
      duplicateLocks.push(lock);
      continue;
    }
    lockByTableId.set(lock.table_id, lock);
  }

  const rollback = () =>
    safelyRollbackReservationTableLocks(input.supabase, {
      restaurantId: input.restaurantId,
      insertedLockIds,
      updatedLocks,
      releasedLocks
    });

  try {
    for (const tableId of tableIds) {
      const existingLock = lockByTableId.get(tableId);
      if (existingLock) {
        if (existingLock.starts_at === startsAtIso && existingLock.ends_at === lockEndIso) continue;
        const { error } = await input.supabase
          .from("reservation_table_locks")
          .update({ starts_at: startsAtIso, ends_at: lockEndIso, status: "active" })
          .eq("id", existingLock.id)
          .eq("restaurant_id", input.restaurantId);
        if ((error as { code?: string } | null)?.code === "23P01") throw new AppError("Một số bàn đang bận trong khung giờ này.", 409);
        throwIfSupabaseError(error);
        updatedLocks.push(existingLock);
        continue;
      }

      const { data: insertedLock, error: insertError } = await input.supabase
        .from("reservation_table_locks")
        .insert({
          reservation_id: input.reservationId,
          restaurant_id: input.restaurantId,
          table_id: tableId,
          starts_at: startsAtIso,
          ends_at: lockEndIso
        })
        .select("id")
        .single();
      if ((insertError as { code?: string } | null)?.code === "23P01") throw new AppError("Một số bàn vừa được giữ bởi lịch khác. Vui lòng chọn bàn khác.", 409);
      throwIfSupabaseError(insertError);
      if (insertedLock?.id) insertedLockIds.push(insertedLock.id);
    }

    const releaseLocks = Array.from(new Map([...input.currentLocks.filter((lock) => !targetTableIdSet.has(lock.table_id)), ...duplicateLocks].map((lock) => [lock.id, lock])).values());
    for (const lock of releaseLocks) {
      const { error } = await input.supabase
        .from("reservation_table_locks")
        .update({ status: "released" })
        .eq("id", lock.id)
        .eq("restaurant_id", input.restaurantId);
      throwIfSupabaseError(error);
      releasedLocks.push(lock);
    }

    return {
      fromTableIds: input.currentLocks.map((lock) => lock.table_id),
      toTableIds: tableIds,
      rollback
    };
  } catch (error) {
    await rollback();
    throw error;
  }
}

function assertBookableTime(settings: ReservationSettings, startsAt: Date) {
  if (!settings.reservations_enabled) throw new AppError("Quán chưa bật đặt bàn trước.", 400);
  const now = new Date();
  const minStart = addMinutes(now, Number(settings.reservation_min_notice_minutes));
  const maxStart = addMinutes(now, Number(settings.reservation_max_days_ahead) * 24 * 60);
  if (startsAt < minStart) throw new AppError(`Vui lòng đặt bàn trước ít nhất ${settings.reservation_min_notice_minutes} phút.`, 400);
  if (startsAt > maxStart) throw new AppError(`Quán chỉ nhận đặt bàn trong ${settings.reservation_max_days_ahead} ngày tới.`, 400);
}

function assertStaffRescheduleTime(settings: ReservationSettings, startsAt: Date) {
  const now = new Date();
  const maxStart = addMinutes(now, Number(settings.reservation_max_days_ahead) * 24 * 60);
  if (startsAt < addMinutes(now, -5)) throw new AppError("Không thể đổi lịch đặt về thời điểm đã qua.", 400);
  if (startsAt > maxStart) throw new AppError(`Quán chỉ nhận đặt bàn trong ${settings.reservation_max_days_ahead} ngày tới.`, 400);
}

export async function getReservationAvailability(input: {
  restaurantSlug: string;
  date: string;
  partySize: number;
  preferredTableAreaId?: string;
  preferredSeatingZone?: ReservationSeatingZone;
  preferredTableKind?: ReservationTableKind;
}) {
  const settings = await getSettingsBySlug(input.restaurantSlug);
  if (!settings) throw new AppError("Không tìm thấy quán", 404);
  await assertFeatureEntitlement(settings.id, "reservations");
  await expireReservationHolds(settings.id);
  const preferences = await validateReservationPreferences(settings.id, input);

  if (!settings.reservations_enabled) {
    return { restaurant: settings, slots: [] as ReservationAvailabilitySlot[] };
  }

  const { start, end } = dayBounds(input.date, settings);
  const now = new Date();
  const firstAllowed = addMinutes(now, Number(settings.reservation_min_notice_minutes));
  const duration = Number(settings.reservation_duration_minutes);
  const buffer = Number(settings.reservation_buffer_minutes);
  const slots: ReservationAvailabilitySlot[] = [];
  const { tables, locks, activeBillTableIds } = await getAvailabilityContext(settings.id, input.partySize, start, addMinutes(end, buffer), preferences);

  for (let slotStart = roundUpToSlotBoundary(new Date(Math.max(start.getTime(), firstAllowed.getTime()))); addMinutes(slotStart, duration) <= end; slotStart = addMinutes(slotStart, 30)) {
    const slotEnd = addMinutes(slotStart, duration);
    const lockEnd = addMinutes(slotEnd, buffer);
    const availableTables = rankAvailableTablesForSlot(
      tables.filter(
        (table) =>
          !hasNearTermActiveBill(table.id, slotStart, activeBillTableIds) &&
          !locks.some((lock) => lock.table_id === table.id && overlap(new Date(lock.starts_at), new Date(lock.ends_at), slotStart, lockEnd))
      ),
      locks,
      activeBillTableIds,
      input.partySize,
      slotStart,
      lockEnd,
      preferences
    );
    const hint = slotAvailabilityHint(slotStart, availableTables.length);
    const bestTableSignal = availableTables[0] ? buildAssignmentSignals([availableTables[0]], locks, slotStart, lockEnd, activeBillTableIds)[0] : undefined;
    slots.push({
      startsAt: slotStart.toISOString(),
      endsAt: slotEnd.toISOString(),
      available: availableTables.length > 0,
      tableCount: availableTables.length,
      bestTableName: availableTables[0]?.name ?? null,
      ...hint,
      recommendationReason: availableTables[0] ? reservationAssignmentReason(availableTables[0], input.partySize, bestTableSignal) : hint.recommendationReason
    });
  }

  return { restaurant: settings, slots };
}

export async function createReservation(input: {
  restaurantSlug: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  partySize: number;
  startsAt: string;
  customerNote?: string;
  idempotencyKey?: string;
  preferredTableAreaId?: string;
  preferredSeatingZone?: ReservationSeatingZone;
  preferredTableKind?: ReservationTableKind;
}): Promise<PublicReservationResult> {
  const supabase = createAdminSupabaseClient();
  const settings = await getSettingsBySlug(input.restaurantSlug);
  if (!settings) throw new AppError("Không tìm thấy quán", 404);
  assertReservationIdempotencyKey(input.idempotencyKey);
  await assertFeatureEntitlement(settings.id, "reservations");
  await expireReservationHolds(settings.id);
  if (input.idempotencyKey) {
    const existingResult = await getIdempotentReservationResult(supabase, settings, input.idempotencyKey);
    if (existingResult) return existingResult;
  }
  const preferences = await validateReservationPreferences(settings.id, input);

  const startsAt = new Date(input.startsAt);
  if (!Number.isFinite(startsAt.getTime())) throw new AppError("Khung giờ đặt bàn không hợp lệ", 400);
  assertBookableTime(settings, startsAt);

  const duration = Number(settings.reservation_duration_minutes);
  const buffer = Number(settings.reservation_buffer_minutes);
  const endsAt = addMinutes(startsAt, duration);
  assertReservationInsideOperatingHours(settings, startsAt, endsAt);
  const lockEnd = addMinutes(endsAt, buffer);
  const availableTables = await getAvailableTables(settings.id, input.partySize, startsAt, lockEnd, preferences);
  const table = availableTables[0];
  if (!table) throw new AppError("Khung giờ này vừa hết bàn phù hợp. Vui lòng chọn giờ khác.", 409);

  const depositAmount = calculateDepositAmount(settings, input.partySize);
  if (depositAmount > 0) {
    await assertFeatureEntitlement(settings.id, "reservation_deposits");
  }
  if (depositAmount > 0 && (!settings.bank_code || !settings.bank_account)) {
    throw new AppError("Quán đang bật nhận cọc nhưng chưa cấu hình ngân hàng VietQR.", 400);
  }

  const accessToken = input.idempotencyKey ?? randomUUID();
  const tokenHash = hashToken(accessToken);
  const now = new Date();
  const needsDeposit = depositAmount > 0;
  const reservationInsert: ReservationInsert = {
    restaurant_id: settings.id,
    status: needsDeposit ? "holding" : "confirmed",
    customer_name: input.customerName.trim(),
    customer_phone: input.customerPhone.trim(),
    customer_email: input.customerEmail?.trim() || null,
    party_size: input.partySize,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    hold_expires_at: needsDeposit ? addMinutes(now, Number(settings.reservation_hold_minutes)).toISOString() : null,
    deposit_required_amount: depositAmount,
    deposit_paid_amount: 0,
    deposit_status: needsDeposit ? "waiting_payment" : "none",
    payment_method: needsDeposit ? "QR" : null,
    customer_note: input.customerNote?.trim() || null,
    preferred_table_area_id: preferences.preferredTableAreaId,
    preferred_seating_zone: preferences.preferredSeatingZone,
    preferred_table_kind: preferences.preferredTableKind,
    source: "PUBLIC",
    access_token_hash: tokenHash,
    idempotency_key: input.idempotencyKey || null,
    confirmed_at: needsDeposit ? null : now.toISOString()
  };

  let { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .insert(reservationInsert)
    .select(reservationSelect)
    .single();

  if (isMissingReservationPreferenceColumns(reservationError)) {
    const {
      preferred_table_area_id: _preferredTableAreaId,
      preferred_seating_zone: _preferredSeatingZone,
      preferred_table_kind: _preferredTableKind,
      ...legacyReservationInsert
    } = reservationInsert;

    const legacyResult = await supabase
      .from("reservations")
      .insert(legacyReservationInsert)
      .select(legacyReservationSelect)
      .single();
    reservation = legacyResult.data as typeof reservation;
    reservationError = legacyResult.error;
  }

  if ((reservationError as { code?: string } | null)?.code === "23505" && input.idempotencyKey) {
    const existingResult = await getIdempotentReservationResult(supabase, settings, input.idempotencyKey);
    if (existingResult) return existingResult;
  }

  if (reservationError || !reservation) {
    throw new AppError(reservationError?.message ?? "Không tạo được đặt bàn", 400);
  }

  const { error: lockError } = await supabase.from("reservation_table_locks").insert({
    reservation_id: reservation.id,
    restaurant_id: settings.id,
    table_id: table.id,
    starts_at: startsAt.toISOString(),
    ends_at: lockEnd.toISOString()
  });

  if (lockError) {
    await supabase.from("reservations").delete().eq("id", reservation.id);
    if ((lockError as { code?: string }).code === "23P01") {
      throw new AppError("Bàn vừa được khách khác giữ. Vui lòng chọn khung giờ khác.", 409);
    }
    throw new AppError(lockError.message ?? "Không giữ được bàn", 400);
  }

  if (needsDeposit) {
    await ensureReservationDepositLogEvent(supabase, {
      reservationId: reservation.id,
      restaurantId: settings.id,
      method: "QR",
      status: "pending",
      amount: depositAmount,
      source: "reservation_deposit_required",
      transitionKey: reservationDepositTransitionKey(reservation.id, "deposit-required")
    });
  }

  await recordReservationStatusChange(supabase, {
    restaurantId: settings.id,
    reservationId: reservation.id,
    fromStatus: null,
    toStatus: reservation.status,
    actorType: "customer",
    note: "reservation_created",
    metadata: {
      tableId: table.id,
      assignmentReason: reservationAssignmentReason(table, input.partySize),
      ...reservationPreferenceMetadata(preferences)
    }
  });
  await recordOccupancyEvent(supabase, {
    restaurantId: settings.id,
    tableId: table.id,
    reservationId: reservation.id,
    eventType: "reservation_created",
    partySize: input.partySize,
    metadata: reservationPreferenceMetadata(preferences)
  });
  if (reservation.status === "confirmed") {
    await scheduleReservationReminderNotifications(supabase, {
      restaurantId: settings.id,
      reservationId: reservation.id,
      startsAt: startsAt.toISOString(),
      partySize: input.partySize,
      customerName: input.customerName
    });
  }

  const nextReservation = await getReservationById(reservation.id, settings.id);
  await enqueueTelegramNotification({
    type: "reservation.created",
    eventId: `reservation.created:${nextReservation.id}`,
    restaurantId: settings.id,
    branchId: null,
    source: "online_ordering",
    actor: { type: "customer" },
    reservation: buildTelegramReservationSnapshot(nextReservation)
  });
  invalidateRestaurantDashboardCache(settings.id);
  return {
    reservation: nextReservation,
    token: accessToken,
    payment: reservationPayment(settings, nextReservation),
    timeline: await listReservationStatusTimeline(settings.id, nextReservation.id)
  };
}

async function getReservationById(reservationId: string, restaurantId?: string) {
  const supabase = createAdminSupabaseClient();
  let query = supabase.from("reservations").select(reservationSelect).eq("id", reservationId);
  if (restaurantId) query = query.eq("restaurant_id", restaurantId);
  let { data, error } = await query.single();

  if (isMissingReservationPreferenceColumns(error)) {
    let legacyQuery = supabase.from("reservations").select(legacyReservationSelect).eq("id", reservationId);
    if (restaurantId) legacyQuery = legacyQuery.eq("restaurant_id", restaurantId);
    const legacyResult = await legacyQuery.single();
    data = legacyResult.data as typeof data;
    error = legacyResult.error;
  }

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không tìm thấy đặt bàn", 404);
  return mapReservation(data as unknown as ReservationRow & { locks?: ReservationLockRow[] });
}

async function getIdempotentReservationResult(
  supabase: ReservationSupabaseClient,
  settings: ReservationSettings,
  idempotencyKey: string
): Promise<PublicReservationResult | null> {
  const { data, error } = await supabase
    .from("reservations")
    .select("id,access_token_hash")
    .eq("restaurant_id", settings.id)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  throwIfSupabaseError(error);
  if (!data) return null;

  const reservation = await getFreshReservationById(data.id, settings.id);
  return {
    reservation,
    token: data.access_token_hash === hashToken(idempotencyKey) ? idempotencyKey : undefined,
    payment: reservationPayment(settings, reservation),
    timeline: await listReservationStatusTimeline(settings.id, reservation.id)
  };
}

async function expireReservationHoldIfNeeded(reservation: ReservationDto, restaurantId: string) {
  if (!hasExpiredHold(reservation)) return reservation;

  const supabase = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("reservations")
    .update({ status: "expired", expired_at: now })
    .eq("id", reservation.id)
    .eq("restaurant_id", restaurantId)
    .in("status", activeHoldStatuses);
  throwIfSupabaseError(error);

  const { error: lockError } = await supabase
    .from("reservation_table_locks")
    .update({ status: "released" })
    .eq("reservation_id", reservation.id)
    .eq("restaurant_id", restaurantId)
    .eq("status", "active");
  throwIfSupabaseError(lockError);

  await recordReservationStatusChange(supabase, {
    restaurantId,
    reservationId: reservation.id,
    fromStatus: reservation.status,
    toStatus: "expired",
    actorType: "system",
    note: "reservation_hold_expired"
  });
  await skipQueuedReservationReminderNotifications(supabase, {
    restaurantId,
    reservationId: reservation.id,
    reason: "reservation_expired"
  });

  invalidateRestaurantDashboardCache(restaurantId);
  return getReservationById(reservation.id, restaurantId);
}

async function getFreshReservationById(reservationId: string, restaurantId: string) {
  const reservation = await getReservationById(reservationId, restaurantId);
  return expireReservationHoldIfNeeded(reservation, restaurantId);
}

async function assertReservationAccess(reservationId: string, token: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("id,restaurant_id,access_token_hash")
    .eq("id", reservationId)
    .single();

  throwIfSupabaseError(error);
  if (!data || data.access_token_hash !== hashToken(token)) {
    throw new AppError("Link đặt bàn không hợp lệ hoặc đã hết quyền truy cập.", 403);
  }

  return data.restaurant_id;
}

export async function getPublicReservation(reservationId: string, token: string): Promise<PublicReservationResult> {
  const restaurantId = await assertReservationAccess(reservationId, token);
  const [reservation, settings] = await Promise.all([
    getFreshReservationById(reservationId, restaurantId),
    getReservationSettingsByAdmin(restaurantId)
  ]);

  assertPublicTenantActive(settings);

  return {
    reservation,
    payment: reservationPayment(settings, reservation),
    timeline: await listReservationStatusTimeline(restaurantId, reservationId)
  };
}

async function getReservationSettingsByAdmin(restaurantId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("restaurants")
    .select(reservationSettingsSelect)
    .eq("id", restaurantId)
    .single();

  throwIfSupabaseError(error);
  return data as ReservationSettings;
}

export async function markReservationDepositPaid(reservationId: string, token: string) {
  const restaurantId = await assertReservationAccess(reservationId, token);
  assertPublicTenantActive(await getReservationSettingsByAdmin(restaurantId));
  const reservation = await getFreshReservationById(reservationId, restaurantId);
  const supabase = createAdminSupabaseClient();
  const waitingConfirmKey = reservationDepositTransitionKey(reservationId, "deposit-submitted");
  if (reservation.depositRequiredAmount <= 0) return getPublicReservation(reservationId, token);
  if (reservation.depositStatus === "paid" || reservation.depositStatus === "waiting_confirm" || reservation.status === "waiting_deposit_confirm") {
    await ensureReservationDepositLogEvent(supabase, {
      reservationId,
      restaurantId,
      method: reservation.paymentMethod ?? "QR",
      status: "waiting_confirm",
      amount: reservation.depositRequiredAmount,
      source: "reservation_customer_paid_button",
      transitionKey: waitingConfirmKey
    });
    const nextReservation = await getReservationById(reservationId, restaurantId);
    await enqueueTelegramNotification({
      type: "reservation.deposit_submitted",
      eventId: `reservation.deposit_submitted:${reservationId}`,
      restaurantId,
      branchId: null,
      source: "online_ordering",
      actor: { type: "customer" },
      reservation: buildTelegramReservationSnapshot(nextReservation)
    });
    return getPublicReservation(reservationId, token);
  }
  if (reservation.status !== "holding" || reservation.depositStatus !== "waiting_payment") {
    return getPublicReservation(reservationId, token);
  }

  const { data: updated, error } = await supabase
    .from("reservations")
    .update({ status: "waiting_deposit_confirm", deposit_status: "waiting_confirm" })
    .eq("id", reservationId)
    .eq("restaurant_id", restaurantId)
    .eq("status", "holding")
    .eq("deposit_status", "waiting_payment")
    .select("id")
    .maybeSingle();
  throwIfSupabaseError(error);
  if (!updated) {
    const currentReservation = await getFreshReservationById(reservationId, restaurantId);
    if (currentReservation.depositStatus === "paid" || currentReservation.depositStatus === "waiting_confirm") {
      await ensureReservationDepositLogEvent(supabase, {
        reservationId,
        restaurantId,
        method: currentReservation.paymentMethod ?? "QR",
        status: "waiting_confirm",
        amount: currentReservation.depositRequiredAmount,
        source: "reservation_customer_paid_button",
        transitionKey: waitingConfirmKey
      });
      await enqueueTelegramNotification({
        type: "reservation.deposit_submitted",
        eventId: `reservation.deposit_submitted:${reservationId}`,
        restaurantId,
        branchId: null,
        source: "online_ordering",
        actor: { type: "customer" },
        reservation: buildTelegramReservationSnapshot(currentReservation)
      });
      return getPublicReservation(reservationId, token);
    }
    throw new AppError("Không thể ghi nhận cọc VietQR cho đặt bàn này.", 409);
  }

  await ensureReservationDepositLogEvent(supabase, {
    reservationId,
    restaurantId,
    method: reservation.paymentMethod ?? "QR",
    status: "waiting_confirm",
    amount: reservation.depositRequiredAmount,
    source: "reservation_customer_paid_button",
    transitionKey: waitingConfirmKey
  });
  await recordReservationStatusChange(supabase, {
    restaurantId,
    reservationId,
    fromStatus: reservation.status,
    toStatus: "waiting_deposit_confirm",
    actorType: "customer",
    note: "reservation_deposit_submitted"
  });

  invalidateRestaurantDashboardCache(restaurantId);
  const nextReservation = await getReservationById(reservationId, restaurantId);
  await enqueueTelegramNotification({
    type: "reservation.deposit_submitted",
    eventId: `reservation.deposit_submitted:${reservationId}`,
    restaurantId,
    branchId: null,
    source: "online_ordering",
    actor: { type: "customer" },
    reservation: buildTelegramReservationSnapshot(nextReservation)
  });
  return getPublicReservation(reservationId, token);
}

export async function cancelPublicReservation(reservationId: string, token: string): Promise<PublicReservationResult> {
  const restaurantId = await assertReservationAccess(reservationId, token);
  const reservation = await getFreshReservationById(reservationId, restaurantId);
  const supabase = createAdminSupabaseClient();

  if (reservation.status === "cancelled" || isClosedReservationStatus(reservation.status)) {
    if (reservation.status === "cancelled" && reservation.depositRequiredAmount > 0) {
      await ensureReservationDepositLogEvent(supabase, {
        reservationId,
        restaurantId,
        method: reservation.paymentMethod ?? "QR",
        status: "cancelled",
        amount: reservation.depositRequiredAmount,
        source: "reservation_customer_cancel",
        transitionKey: reservationDepositTransitionKey(reservationId, "customer-cancel")
      });
    }
    return getPublicReservation(reservationId, token);
  }
  if (reservation.status === "seated") {
    throw new AppError("Không thể huỷ đặt bàn khi khách đã được nhận vào bàn.", 400);
  }
  if (reservation.depositPaidAmount > 0 || reservation.depositStatus === "paid") {
    throw new AppError("Đặt bàn đã được quán xác nhận cọc. Vui lòng gọi quán để được hỗ trợ huỷ hoặc đổi lịch.", 409);
  }
  if (reservation.status === "waiting_deposit_confirm" || reservation.depositStatus === "waiting_confirm") {
    throw new AppError("Quán đang kiểm tra giao dịch cọc. Vui lòng gọi quán nếu bạn cần huỷ lịch.", 409);
  }
  if (reservation.status === "confirmed" && reservation.depositRequiredAmount > 0) {
    throw new AppError("Lịch đặt đã có yêu cầu cọc. Vui lòng gọi quán để được hỗ trợ huỷ.", 409);
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("reservations")
    .update({ status: "cancelled", cancelled_at: now })
    .eq("id", reservationId)
    .eq("restaurant_id", restaurantId)
    .in("status", ["holding", "confirmed"])
    .select("id")
    .maybeSingle();
  throwIfSupabaseError(error);
  if (!updated) {
    throw new AppError("Trạng thái đặt bàn vừa thay đổi. Vui lòng tải lại trước khi huỷ.", 409);
  }

  const { error: lockError } = await supabase
    .from("reservation_table_locks")
    .update({ status: "released" })
    .eq("reservation_id", reservationId)
    .eq("restaurant_id", restaurantId)
    .eq("status", "active");
  throwIfSupabaseError(lockError);

  const depositDisposition = await applyReservationClosureDepositDisposition(supabase, { restaurantId, reservation, closure: "customer_cancel", source: "reservation_customer_cancel" });

  await recordReservationStatusChange(supabase, {
    restaurantId,
    reservationId,
    fromStatus: reservation.status,
    toStatus: "cancelled",
    actorType: "customer",
    note: "reservation_customer_cancel",
    metadata: depositDisposition ? { depositDisposition: depositDisposition.nextDepositStatus } : undefined
  });
  await recordReservationTableOccupancyEvents(supabase, {
    restaurantId,
    reservation,
    eventType: "reservation_cancelled",
  });
  await skipQueuedReservationReminderNotifications(supabase, {
    restaurantId,
    reservationId,
    reason: "reservation_cancelled"
  });

  invalidateRestaurantDashboardCache(restaurantId);
  return getPublicReservation(reservationId, token);
}

export async function listReservationsForRestaurant(restaurantId: string, date?: string) {
  await expireReservationHolds(restaurantId);
  const supabase = await createServerSupabaseClient();
  const settings = date ? await getReservationSettings(restaurantId) : null;
  let query = supabase
    .from("reservations")
    .select(reservationSelect)
    .eq("restaurant_id", restaurantId)
    .order("starts_at", { ascending: true })
    .limit(200);

  if (date) {
    const { start, end } = dayBounds(date, settings as ReservationSettings);
    query = query.gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString());
  }

  let { data, error } = await query;

  if (isMissingReservationPreferenceColumns(error)) {
    let legacyQuery = supabase
      .from("reservations")
      .select(legacyReservationSelect)
      .eq("restaurant_id", restaurantId)
      .order("starts_at", { ascending: true })
      .limit(200);

    if (date) {
      const { start, end } = dayBounds(date, settings as ReservationSettings);
      legacyQuery = legacyQuery.gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString());
    }

    const legacyResult = await legacyQuery;
    data = legacyResult.data as typeof data;
    error = legacyResult.error;
  }

  throwIfSupabaseError(error);
  return ((data ?? []) as unknown as Array<ReservationRow & { locks?: ReservationLockRow[] }>).map(mapReservation);
}

export async function getReservationAnalytics(
  restaurantId: string,
  options: {
    windowDays?: number;
    now?: Date;
  } = {}
) {
  const windowDays = options.windowDays ?? DEFAULT_RESERVATION_ANALYTICS_WINDOW_DAYS;
  const windowEnd = options.now ?? new Date();
  const windowStart = addMinutes(windowEnd, -windowDays * 24 * 60);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any)
    .from("reservations")
    .select(reservationAnalyticsSelect)
    .eq("restaurant_id", restaurantId)
    .gte("starts_at", windowStart.toISOString())
    .lt("starts_at", windowEnd.toISOString())
    .order("starts_at", { ascending: true })
    .limit(1000);

  throwIfSupabaseError(error);
  return buildReservationAnalytics((data ?? []) as ReservationAnalyticsRow[], {
    windowDays,
    windowStart,
    windowEnd
  });
}

export async function updateReservationSettings(
  restaurantId: string,
  input: {
    reservationsEnabled?: boolean;
    reservationDepositEnabled?: boolean;
    reservationDepositType: ReservationDepositType;
    reservationDepositValue: number;
    reservationHoldMinutes: number;
    reservationDurationMinutes: number;
    reservationBufferMinutes: number;
    reservationMinNoticeMinutes: number;
    reservationMaxDaysAhead: number;
    reservationArrivalGraceMinutes: number;
  }
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("restaurants")
    .update({
      reservations_enabled: input.reservationsEnabled ?? false,
      reservation_deposit_enabled: input.reservationDepositEnabled ?? false,
      reservation_deposit_type: input.reservationDepositType,
      reservation_deposit_value: input.reservationDepositValue,
      reservation_hold_minutes: input.reservationHoldMinutes,
      reservation_duration_minutes: input.reservationDurationMinutes,
      reservation_buffer_minutes: input.reservationBufferMinutes,
      reservation_min_notice_minutes: input.reservationMinNoticeMinutes,
      reservation_max_days_ahead: input.reservationMaxDaysAhead,
      reservation_arrival_grace_minutes: input.reservationArrivalGraceMinutes
    })
    .eq("id", restaurantId)
    .select(reservationSettingsSelect)
    .single();

  throwIfSupabaseError(error);
  return data as ReservationSettings;
}

export async function confirmReservationDeposit(restaurantId: string, reservationId: string) {
  const reservation = await getFreshReservationById(reservationId, restaurantId);
  const supabase = createAdminSupabaseClient();
  const confirmKey = reservationDepositTransitionKey(reservationId, "deposit-confirmed");
  if (reservation.depositRequiredAmount <= 0) {
    throw new AppError("Đặt bàn này không yêu cầu cọc.", 400);
  }
  if (reservation.depositStatus === "paid") {
    await ensureReservationDepositLogEvent(supabase, {
      reservationId,
      restaurantId,
      method: reservation.paymentMethod ?? "QR",
      status: "confirmed",
      amount: reservation.depositRequiredAmount,
      source: "merchant_reservation_deposit_confirm",
      transitionKey: confirmKey
    });
    await enqueueTelegramNotification({
      type: "reservation.confirmed",
      eventId: `reservation.confirmed:${reservationId}`,
      restaurantId,
      branchId: null,
      source: "dashboard",
      actor: { type: "merchant" },
      reservation: buildTelegramReservationSnapshot(reservation)
    });
    return reservation;
  }
  if (isClosedReservationStatus(reservation.status)) {
    throw new AppError("Không thể xác nhận cọc cho đặt bàn đã kết thúc.", 400);
  }
  if (reservation.status !== "waiting_deposit_confirm" || reservation.depositStatus !== "waiting_confirm") {
    throw new AppError("Chỉ có thể xác nhận cọc cho đặt bàn đang chờ xác nhận.", 400);
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("reservations")
    .update({
      status: "confirmed",
      deposit_status: reservation.depositRequiredAmount > 0 ? "paid" : "none",
      deposit_paid_amount: reservation.depositRequiredAmount,
      confirmed_at: now,
      hold_expires_at: null
    })
    .eq("id", reservationId)
    .eq("restaurant_id", restaurantId)
    .eq("status", "waiting_deposit_confirm")
    .eq("deposit_status", "waiting_confirm")
    .select("id")
    .maybeSingle();
  throwIfSupabaseError(error);
  if (!updated) {
    const currentReservation = await getFreshReservationById(reservationId, restaurantId);
    if (currentReservation.depositStatus === "paid") {
      await ensureReservationDepositLogEvent(supabase, {
        reservationId,
        restaurantId,
        method: currentReservation.paymentMethod ?? "QR",
        status: "confirmed",
        amount: currentReservation.depositRequiredAmount,
        source: "merchant_reservation_deposit_confirm",
        transitionKey: confirmKey
      });
      return currentReservation;
    }
    throw new AppError("Không thể xác nhận cọc cho đặt bàn này.", 409);
  }

  await ensureReservationDepositLogEvent(supabase, {
    reservationId,
    restaurantId,
    method: reservation.paymentMethod ?? "QR",
    status: "confirmed",
    amount: reservation.depositRequiredAmount,
    source: "merchant_reservation_deposit_confirm",
    transitionKey: confirmKey
  });
  await recordReservationStatusChange(supabase, {
    restaurantId,
    reservationId,
    fromStatus: reservation.status,
    toStatus: "confirmed",
    actorType: "merchant",
    note: "reservation_deposit_confirmed"
  });
  await scheduleReservationReminderNotifications(supabase, {
    restaurantId,
    reservationId,
    startsAt: reservation.startsAt,
    partySize: reservation.partySize,
    customerName: reservation.customerName
  });

  invalidateRestaurantDashboardCache(restaurantId);
  const nextReservation = await getReservationById(reservationId, restaurantId);
  await enqueueTelegramNotification({
    type: "reservation.confirmed",
    eventId: `reservation.confirmed:${reservationId}`,
    restaurantId,
    branchId: null,
    source: "dashboard",
    actor: { type: "merchant" },
    reservation: buildTelegramReservationSnapshot(nextReservation)
  });
  return nextReservation;
}

export async function markReservationDepositRefunded(restaurantId: string, reservationId: string) {
  const reservation = await getFreshReservationById(reservationId, restaurantId);
  if (reservation.depositStatus === "refunded") return reservation;
  if (reservation.depositStatus !== "refundable") {
    throw new AppError("Chỉ có thể đánh dấu đã hoàn cọc cho lịch đang ở trạng thái cần hoàn cọc.", 400);
  }

  const supabase = createAdminSupabaseClient();
  const { data: updated, error } = await supabase
    .from("reservations")
    .update({ deposit_status: "refunded" })
    .eq("id", reservationId)
    .eq("restaurant_id", restaurantId)
    .eq("deposit_status", "refundable")
    .select("id")
    .maybeSingle();
  throwIfSupabaseError(error);
  if (!updated) throw new AppError("Trạng thái cọc vừa thay đổi. Vui lòng tải lại trước khi xác nhận hoàn cọc.", 409);

  await ensureReservationDepositLogEvent(supabase, {
    reservationId,
    restaurantId,
    method: reservation.paymentMethod ?? "QR",
    status: "refunded",
    amount: reservation.depositPaidAmount,
    source: "merchant_reservation_deposit_refunded",
    transitionKey: reservationDepositTransitionKey(reservationId, "merchant-refunded"),
    rawData: {
      previousDepositStatus: reservation.depositStatus
    }
  });
  await recordReservationCustomerRiskEvent(supabase, {
    restaurantId,
    reservation,
    eventType: "refund_completed",
    severity: "watch",
    metadata: { previousDepositStatus: reservation.depositStatus }
  });
  await recordReservationStatusChange(supabase, {
    restaurantId,
    reservationId,
    fromStatus: reservation.status,
    toStatus: reservation.status,
    actorType: "merchant",
    note: "reservation_deposit_refunded",
    metadata: {
      depositDisposition: "refunded",
      amount: reservation.depositPaidAmount
    }
  });

  invalidateRestaurantDashboardCache(restaurantId);
  return getReservationById(reservationId, restaurantId);
}

export async function cancelReservation(restaurantId: string, reservationId: string) {
  const reservation = await getFreshReservationById(reservationId, restaurantId);
  const supabase = createAdminSupabaseClient();
  if (reservation.status === "cancelled") {
    await applyReservationClosureDepositDisposition(supabase, { restaurantId, reservation, closure: "merchant_cancel", source: "merchant_reservation_cancel" });
    return reservation;
  }
  if (reservation.status === "seated") {
    throw new AppError("Không thể huỷ đặt bàn khi khách đã được nhận vào bàn.", 400);
  }
  if (isClosedReservationStatus(reservation.status)) {
    throw new AppError("Không thể huỷ đặt bàn đã kết thúc.", 400);
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("reservations")
    .update({ status: "cancelled", cancelled_at: now })
    .eq("id", reservationId)
    .eq("restaurant_id", restaurantId);
  throwIfSupabaseError(error);

  const { error: lockError } = await supabase
    .from("reservation_table_locks")
    .update({ status: "released" })
    .eq("reservation_id", reservationId)
    .eq("restaurant_id", restaurantId);
  throwIfSupabaseError(lockError);

  const depositDisposition = await applyReservationClosureDepositDisposition(supabase, { restaurantId, reservation, closure: "merchant_cancel", source: "merchant_reservation_cancel" });

  await recordReservationStatusChange(supabase, {
    restaurantId,
    reservationId,
    fromStatus: reservation.status,
    toStatus: "cancelled",
    actorType: "merchant",
    note: "reservation_merchant_cancel",
    metadata: depositDisposition ? { depositDisposition: depositDisposition.nextDepositStatus } : undefined
  });
  await recordReservationTableOccupancyEvents(supabase, {
    restaurantId,
    reservation,
    eventType: "reservation_cancelled",
  });
  await skipQueuedReservationReminderNotifications(supabase, {
    restaurantId,
    reservationId,
    reason: "reservation_cancelled"
  });

  invalidateRestaurantDashboardCache(restaurantId);
  const nextReservation = await getReservationById(reservationId, restaurantId);
  await enqueueTelegramNotification({
    type: "reservation.cancelled",
    eventId: `reservation.cancelled:${reservationId}`,
    restaurantId,
    branchId: null,
    source: "dashboard",
    actor: { type: "merchant" },
    reservation: buildTelegramReservationSnapshot(nextReservation)
  });
  return nextReservation;
}

export async function rejectReservation(restaurantId: string, reservationId: string) {
  const reservation = await getFreshReservationById(reservationId, restaurantId);
  const supabase = createAdminSupabaseClient();
  if (reservation.status === "rejected") return reservation;
  if (reservation.status === "seated" || reservation.status === "checked_in" || reservation.seatedTableBillId) {
    throw new AppError("Không thể từ chối lịch đã check-in hoặc đã vào bàn.", 400);
  }
  if (isClosedReservationStatus(reservation.status)) {
    throw new AppError("Không thể từ chối đặt bàn đã kết thúc.", 400);
  }
  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("reservations")
    .update({ status: "rejected", rejected_at: now })
    .eq("id", reservationId)
    .eq("restaurant_id", restaurantId)
    .in("status", ["draft", "pending", "holding", "confirmed"])
    .select("id")
    .maybeSingle();
  throwIfSupabaseError(error);
  if (!updated) throw new AppError("Trạng thái đặt bàn vừa thay đổi. Vui lòng tải lại trước khi từ chối.", 409);

  const { error: lockError } = await supabase
    .from("reservation_table_locks")
    .update({ status: "released" })
    .eq("reservation_id", reservationId)
    .eq("restaurant_id", restaurantId)
    .eq("status", "active");
  throwIfSupabaseError(lockError);

  const depositDisposition = await applyReservationClosureDepositDisposition(supabase, { restaurantId, reservation, closure: "reject", source: "merchant_reservation_reject" });

  await recordReservationStatusChange(supabase, {
    restaurantId,
    reservationId,
    fromStatus: reservation.status,
    toStatus: "rejected",
    actorType: "merchant",
    note: "reservation_merchant_reject",
    metadata: depositDisposition ? { depositDisposition: depositDisposition.nextDepositStatus } : undefined
  });
  await recordReservationTableOccupancyEvents(supabase, {
    restaurantId,
    reservation,
    eventType: "reservation_cancelled",
    metadata: { reason: "rejected" }
  });
  await skipQueuedReservationReminderNotifications(supabase, {
    restaurantId,
    reservationId,
    reason: "reservation_rejected"
  });

  invalidateRestaurantDashboardCache(restaurantId);
  const nextReservation = await getReservationById(reservationId, restaurantId);
  await enqueueTelegramNotification({
    type: "reservation.rejected",
    eventId: `reservation.rejected:${reservationId}`,
    restaurantId,
    branchId: null,
    source: "dashboard",
    actor: { type: "merchant" },
    reservation: buildTelegramReservationSnapshot(nextReservation)
  });
  return nextReservation;
}

export async function checkInReservation(restaurantId: string, reservationId: string) {
  const reservation = await getFreshReservationById(reservationId, restaurantId);
  if (reservation.status === "checked_in" || reservation.status === "seated") return reservation;
  if (reservation.status !== "confirmed") {
    throw new AppError("Chỉ có thể check-in đặt bàn đã xác nhận.", 400);
  }

  const supabase = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("reservations")
    .update({ status: "checked_in", checked_in_at: now })
    .eq("id", reservationId)
    .eq("restaurant_id", restaurantId)
    .eq("status", "confirmed")
    .select("id")
    .maybeSingle();
  throwIfSupabaseError(error);
  if (!updated) throw new AppError("Trạng thái đặt bàn vừa thay đổi. Vui lòng tải lại trước khi check-in.", 409);

  await recordReservationStatusChange(supabase, {
    restaurantId,
    reservationId,
    fromStatus: reservation.status,
    toStatus: "checked_in",
    actorType: "merchant",
    note: "reservation_checked_in"
  });
  await recordReservationTableOccupancyEvents(supabase, {
    restaurantId,
    reservation,
    eventType: "reservation_checked_in",
  });
  await skipQueuedReservationReminderNotifications(supabase, {
    restaurantId,
    reservationId,
    reason: "reservation_checked_in"
  });

  invalidateRestaurantDashboardCache(restaurantId);
  const nextReservation = await getReservationById(reservationId, restaurantId);
  await enqueueTelegramNotification({
    type: "reservation.checked_in",
    eventId: `reservation.checked_in:${reservationId}`,
    restaurantId,
    branchId: null,
    source: "dashboard",
    actor: { type: "merchant" },
    reservation: buildTelegramReservationSnapshot(nextReservation)
  });
  return nextReservation;
}

export async function setReservationTables(restaurantId: string, reservationId: string, tableIds: string[]) {
  const reservation = await getFreshReservationById(reservationId, restaurantId);
  if (reservation.seatedTableBillId || reservation.status === "seated") {
    throw new AppError("Lịch đã vào bàn. Hãy đổi bàn trong hóa đơn đang phục vụ.", 400);
  }
  if (isClosedReservationStatus(reservation.status)) {
    throw new AppError("Không thể đổi bàn cho lịch đặt đã kết thúc.", 400);
  }

  const normalizedTableIds = normalizeReservationTableIds(tableIds);
  const currentLocks = await getActiveReservationLocks(restaurantId, reservationId);
  const settings = currentLocks.length === 0 ? await getReservationSettingsByAdmin(restaurantId) : null;
  const startsAt = new Date(currentLocks[0]?.starts_at ?? reservation.startsAt);
  const lockEnd = currentLocks[0]?.ends_at ? new Date(currentLocks[0].ends_at) : addMinutes(new Date(reservation.endsAt), Number(settings?.reservation_buffer_minutes ?? 0));
  const currentTableIds = Array.from(new Set(currentLocks.map((lock) => lock.table_id)));
  const hasDuplicateLocks = currentTableIds.length !== currentLocks.length;
  const isSameTableSet = currentTableIds.length === normalizedTableIds.length && normalizedTableIds.every((tableId) => currentTableIds.includes(tableId));
  const isSameLockWindow = currentLocks.every((lock) => lock.starts_at === startsAt.toISOString() && lock.ends_at === lockEnd.toISOString());
  if (currentLocks.length > 0 && !hasDuplicateLocks && isSameTableSet && isSameLockWindow) return reservation;

  const tables = await assertReservationTablesAvailable({
    restaurantId,
    reservationId,
    partySize: reservation.partySize,
    tableIds: normalizedTableIds,
    startsAt,
    lockEnd
  });
  const supabase = createAdminSupabaseClient();
  const replacement = await replaceReservationTableLocks({
    supabase,
    restaurantId,
    reservationId,
    currentLocks,
    tableIds: normalizedTableIds,
    startsAt,
    lockEnd
  });
  const { error: touchError } = await supabase
    .from("reservations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", reservationId)
    .eq("restaurant_id", restaurantId);
  if (touchError) await replacement.rollback();
  throwIfSupabaseError(touchError);

  await recordReservationStatusChange(supabase, {
    restaurantId,
    reservationId,
    fromStatus: reservation.status,
    toStatus: reservation.status,
    actorType: "merchant",
    note: normalizedTableIds.length > 1 ? "reservation_tables_merged" : "reservation_table_moved",
    metadata: {
      fromTableIds: replacement.fromTableIds.join(","),
      toTableIds: replacement.toTableIds.join(","),
      tableCount: normalizedTableIds.length,
      totalCapacity: tableSetCapacity(tables)
    }
  });

  invalidateRestaurantDashboardCache(restaurantId);
  return getReservationById(reservationId, restaurantId);
}

export async function moveReservationTable(restaurantId: string, reservationId: string, nextTableId: string) {
  return setReservationTables(restaurantId, reservationId, [nextTableId]);
}

async function getRescheduleTables(input: {
  restaurantId: string;
  reservation: ReservationDto;
  currentLocks: ReservationActiveLock[];
  startsAt: Date;
  lockEnd: Date;
  preferredTableId?: string;
}) {
  if (input.preferredTableId) {
    return assertReservationTablesAvailable({
      restaurantId: input.restaurantId,
      reservationId: input.reservation.id,
      partySize: input.reservation.partySize,
      tableIds: [input.preferredTableId],
      startsAt: input.startsAt,
      lockEnd: input.lockEnd
    });
  }

  const currentTableIds = Array.from(new Set(input.currentLocks.map((lock) => lock.table_id)));
  if (currentTableIds.length > 0) {
    try {
      return await assertReservationTablesAvailable({
        restaurantId: input.restaurantId,
        reservationId: input.reservation.id,
        partySize: input.reservation.partySize,
        tableIds: currentTableIds,
        startsAt: input.startsAt,
        lockEnd: input.lockEnd
      });
    } catch {
      if (currentTableIds.length > 1) {
        throw new AppError("Nhóm bàn hiện tại không còn trống trong khung giờ mới. Vui lòng chọn lại bàn ghép trước khi đổi giờ.", 409);
      }
    }
  }

  const availableTables = await getAvailableTables(
    input.restaurantId,
    input.reservation.partySize,
    input.startsAt,
    input.lockEnd,
    {
      preferredTableAreaId: input.reservation.preferredTableAreaId ?? undefined,
      preferredSeatingZone: input.reservation.preferredSeatingZone ?? undefined,
      preferredTableKind: input.reservation.preferredTableKind ?? undefined
    },
    input.reservation.id
  );
  const table = availableTables[0];
  if (!table) throw new AppError("Khung giờ mới không còn bàn phù hợp. Vui lòng chọn giờ khác.", 409);
  return [table];
}

function preflightMessageFromError(error: unknown, fallback: string) {
  return error instanceof AppError || error instanceof Error ? error.message : fallback;
}

export async function preflightReservationSeating(restaurantId: string, reservationId: string) {
  const reservation = await getFreshReservationById(reservationId, restaurantId);
  const tableIds = normalizeReservationTableIds(reservation.tables.map((table) => table.id));
  const context = tableIds.length > 0
    ? await getReservationTablePreflightContext({
        restaurantId,
        reservationId,
        tableIds,
        startsAt: new Date(reservation.startsAt),
        lockEnd: new Date(reservation.endsAt)
      })
    : { tables: [], locks: [], bills: [], orders: [] };

  const tableById = new Map(context.tables.map((table) => [table.id, table]));
  const blockers: ReservationPreflightIssue[] = [];
  const warnings: ReservationPreflightIssue[] = [];
  const totalCapacity = context.tables.reduce((sum, table) => sum + Number(table.capacity), 0);

  if (reservation.seatedTableBillId || reservation.status === "seated") {
    blockers.push({ code: "already_seated", message: "Lịch đã vào bàn. Hãy xử lý trên phiên bàn đang phục vụ." });
  } else if (reservation.status !== "confirmed" && reservation.status !== "checked_in") {
    blockers.push({ code: "invalid_status", message: "Chỉ có thể nhận khách cho lịch đã xác nhận hoặc đã check-in." });
  }
  if (tableIds.length === 0) {
    blockers.push({ code: "missing_table", message: "Lịch này chưa có bàn giữ chỗ. Hãy gán bàn trước khi nhận khách." });
  }
  if (totalCapacity > 0 && totalCapacity < reservation.partySize) {
    blockers.push({ code: "under_capacity", message: `Nhóm bàn chỉ đủ ${totalCapacity} khách, cần tối thiểu ${reservation.partySize} khách.` });
  }
  if (reservation.depositRequiredAmount > 0 && reservation.depositPaidAmount < reservation.depositRequiredAmount) {
    warnings.push({ code: "deposit_unpaid", message: "Lịch còn thiếu cọc. Staff nên đối soát trước khi nhận khách vào bàn." });
  }

  const tables = tableIds.map((tableId, index) => {
    const reservationTable = reservation.tables.find((table) => table.id === tableId);
    const table = tableById.get(tableId);
    const tableBills = context.bills.filter((bill) => bill.table_id === tableId);
    const tableOrders = context.orders.filter((order) => order.table_id === tableId);
    const conflicts = context.locks.filter((lock) => lock.table_id === tableId).map((lock) => {
      const lockReservation = reservationTableLockReservation(lock);
      return {
        reservationId: lock.reservation_id,
        customerName: lockReservation?.customer_name ?? "Lịch khác",
        status: lockReservation?.status ?? "confirmed",
        partySize: lockReservation?.party_size ?? null,
        startsAt: lock.starts_at,
        endsAt: lock.ends_at
      };
    });
    const signals: ReservationPreflightSignal[] = [];

    if (!table) {
      blockers.push({ code: "missing_table", tableId, tableName: reservationTable?.name, message: `Bàn ${reservationTable?.name ?? tableId} không còn tồn tại trong quán.` });
      signals.push({ code: "missing_table", tone: "red", label: "Không tồn tại" });
      return {
        id: tableId,
        name: reservationTable?.name ?? "Bàn không tồn tại",
        capacity: reservationTable?.capacity ?? 0,
        isPrimary: index === 0,
        qrEnabled: false,
        activeBillCount: 0,
        activeOrderCount: 0,
        conflicts,
        signals
      };
    }

    if (!table.is_bookable || table.is_hidden || table.is_under_maintenance) {
      blockers.push({ code: "unbookable_table", tableId: table.id, tableName: table.name, message: `Bàn ${table.name} đang ẩn, bảo trì hoặc không nhận đặt.` });
      signals.push({ code: "unbookable", tone: "red", label: "Không khả dụng" });
    }
    if (conflicts.length > 0) {
      blockers.push({ code: "reservation_conflict", tableId: table.id, tableName: table.name, message: `Bàn ${table.name} đang chồng lịch giữ chỗ khác.` });
      signals.push({ code: "conflict", tone: "red", label: `${conflicts.length} chồng lịch` });
    }
    if (tableBills.length > 0) {
      blockers.push({ code: "active_bill", tableId: table.id, tableName: table.name, message: `Bàn ${table.name} đang có phiên bàn mở hoặc chờ thanh toán.` });
      signals.push({ code: "active_bill", tone: "red", label: "Có bill mở" });
    }
    if (tableOrders.length > 0) {
      blockers.push({ code: "active_orders", tableId: table.id, tableName: table.name, message: `Bàn ${table.name} đang có order chưa tách khỏi phiên cũ.` });
      signals.push({ code: "active_orders", tone: "red", label: "Có order" });
    }
    if (!table.qr_enabled) {
      warnings.push({ code: "qr_disabled", tableId: table.id, tableName: table.name, message: `QR của bàn ${table.name} đang tắt.` });
      signals.push({ code: "qr_disabled", tone: "yellow", label: "QR tắt" });
    }
    if (table.table_kind === "vip") signals.push({ code: "vip", tone: "blue", label: "VIP" });
    if (table.seating_zone === "outdoor") signals.push({ code: "outdoor", tone: "yellow", label: "Ngoài trời" });

    return {
      id: table.id,
      name: table.name,
      capacity: table.capacity,
      isPrimary: index === 0,
      qrEnabled: table.qr_enabled,
      activeBillCount: tableBills.length,
      activeOrderCount: tableOrders.length,
      conflicts,
      signals
    };
  });

  return {
    reservationId,
    status: reservation.status,
    partySize: reservation.partySize,
    depositAppliedAmount: reservation.depositPaidAmount,
    primaryTableId: tableIds[0] ?? null,
    primaryTableName: tables[0]?.name ?? null,
    tableIds,
    tableCount: tableIds.length,
    totalCapacity,
    capacityGap: Math.max(0, reservation.partySize - totalCapacity),
    qrReadyCount: tables.filter((table) => table.qrEnabled).length,
    canSeat: blockers.length === 0,
    blockers,
    warnings,
    tables
  };
}

async function buildRescheduleTablePreflight(input: {
  restaurantId: string;
  reservation: ReservationDto;
  tableIds: string[];
  startsAt: Date;
  lockEnd: Date;
}) {
  const normalizedTableIds = normalizeReservationTableIds(input.tableIds);
  const context = await getReservationTablePreflightContext({
    restaurantId: input.restaurantId,
    reservationId: input.reservation.id,
    tableIds: normalizedTableIds,
    startsAt: input.startsAt,
    lockEnd: input.lockEnd
  });
  const tableById = new Map(context.tables.map((table) => [table.id, table]));
  const totalCapacity = context.tables.reduce((sum, table) => sum + Number(table.capacity), 0);
  const blockers: Array<{ code: string; message: string; tableId?: string; tableName?: string }> = [];
  const warnings: Array<{ code: string; message: string; tableId?: string; tableName?: string }> = [];
  const tables = normalizedTableIds.map((tableId) => {
    const table = tableById.get(tableId);
    const locks = context.locks.filter((lock) => lock.table_id === tableId);
    const bills = context.bills.filter((bill) => bill.table_id === tableId);
    const orders = context.orders.filter((order) => order.table_id === tableId);
    const conflicts = locks.map((lock) => {
      const lockReservation = reservationTableLockReservation(lock);
      return {
        reservationId: lock.reservation_id,
        customerName: lockReservation?.customer_name ?? "Lịch khác",
        status: lockReservation?.status ?? "confirmed",
        partySize: lockReservation?.party_size ?? null,
        startsAt: lock.starts_at,
        endsAt: lock.ends_at
      };
    });

    if (!table) {
      blockers.push({ code: "missing_table", tableId, message: "Một số bàn đã chọn không tồn tại trong quán." });
      return { id: tableId, name: "Bàn không tồn tại", capacity: 0, conflicts, signals: [{ code: "missing_table", tone: "red" as const, label: "Không tồn tại" }] };
    }

    const signals: Array<{ code: string; tone: "neutral" | "green" | "yellow" | "blue" | "red"; label: string }> = [];
    if (!table.is_bookable || table.is_hidden || table.is_under_maintenance) {
      blockers.push({ code: "unbookable_table", tableId: table.id, tableName: table.name, message: `Bàn ${table.name} không khả dụng cho đặt trước.` });
      signals.push({ code: "unbookable", tone: "red", label: "Không nhận đặt" });
    }
    if (conflicts.length > 0) {
      blockers.push({ code: "reservation_conflict", tableId: table.id, tableName: table.name, message: `Bàn ${table.name} chồng lịch trong giờ mới.` });
      signals.push({ code: "conflict", tone: "red", label: `${conflicts.length} chồng lịch` });
    }
    if (bills.length > 0) {
      warnings.push({ code: "active_bill", tableId: table.id, tableName: table.name, message: `Bàn ${table.name} đang có phiên bàn mở hoặc chờ thanh toán.` });
      signals.push({ code: "active_bill", tone: "blue", label: "Có bill mở" });
    }
    if (orders.length > 0) {
      warnings.push({ code: "active_orders", tableId: table.id, tableName: table.name, message: `Bàn ${table.name} đang có order gắn bàn.` });
      signals.push({ code: "active_orders", tone: "blue", label: "Có order" });
    }
    if (!table.qr_enabled) {
      warnings.push({ code: "qr_disabled", tableId: table.id, tableName: table.name, message: `QR của bàn ${table.name} đang tắt.` });
      signals.push({ code: "qr_disabled", tone: "yellow", label: "QR tắt" });
    }
    if (table.capacity < input.reservation.partySize) signals.push({ code: "needs_merge", tone: "yellow", label: "Cần ghép" });
    if (table.table_kind === "vip") signals.push({ code: "vip", tone: "blue", label: "VIP" });
    if (table.seating_zone === "outdoor") signals.push({ code: "outdoor", tone: "yellow", label: "Ngoài trời" });

    return {
      id: table.id,
      name: table.name,
      area: table.area,
      capacity: table.capacity,
      floorLabel: table.floor_label,
      seatingZone: table.seating_zone,
      tableKind: table.table_kind,
      qrEnabled: table.qr_enabled,
      activeBillCount: bills.length,
      activeOrderCount: orders.length,
      conflicts,
      signals
    };
  });

  if (totalCapacity < input.reservation.partySize) {
    blockers.push({
      code: "under_capacity",
      message: `Nhóm bàn trong giờ mới chỉ đủ ${totalCapacity} khách, cần tối thiểu ${input.reservation.partySize} khách.`
    });
  }

  return {
    tableIds: normalizedTableIds,
    tableCount: normalizedTableIds.length,
    totalCapacity,
    capacityGap: Math.max(0, input.reservation.partySize - totalCapacity),
    canSave: blockers.length === 0,
    blockers,
    warnings,
    tables
  };
}

export async function preflightReservationReschedule(
  restaurantId: string,
  reservationId: string,
  input: {
    startsAt: string;
    tableId?: string;
  }
) {
  const reservation = await getFreshReservationById(reservationId, restaurantId);
  const settings = await getReservationSettingsByAdmin(restaurantId);
  const startsAt = new Date(input.startsAt);
  const blockers: Array<{ code: string; message: string }> = [];
  const warnings: Array<{ code: string; message: string }> = [];

  if (reservation.seatedTableBillId || reservation.status === "seated") blockers.push({ code: "already_seated", message: "Lịch đã vào bàn. Hãy đổi thời gian trong phiên bàn đang phục vụ nếu cần." });
  if (reservation.status === "checked_in") blockers.push({ code: "checked_in", message: "Khách đã check-in. Hãy nhận khách vào bàn hoặc xử lý vận hành trước khi đổi giờ." });
  if (isClosedReservationStatus(reservation.status)) blockers.push({ code: "closed_reservation", message: "Không thể đổi giờ cho lịch đặt đã kết thúc." });
  if (!Number.isFinite(startsAt.getTime())) blockers.push({ code: "invalid_time", message: "Khung giờ mới không hợp lệ." });

  let endsAt = Number.isFinite(startsAt.getTime()) ? addMinutes(startsAt, Number(settings.reservation_duration_minutes)) : new Date(Number.NaN);
  let lockEnd = Number.isFinite(endsAt.getTime()) ? addMinutes(endsAt, Number(settings.reservation_buffer_minutes)) : new Date(Number.NaN);
  if (Number.isFinite(startsAt.getTime())) {
    try {
      assertStaffRescheduleTime(settings, startsAt);
      assertReservationInsideOperatingHours(settings, startsAt, endsAt);
    } catch (error) {
      blockers.push({ code: "time_window", message: preflightMessageFromError(error, "Khung giờ mới không hợp lệ.") });
    }
  }

  let assignmentMode: "selected" | "current" | "auto" | "none" = "none";
  let tablePreflight: Awaited<ReturnType<typeof buildRescheduleTablePreflight>> | null = null;
  const currentLocks = await getActiveReservationLocks(restaurantId, reservationId);

  if (blockers.length === 0) {
    if (input.tableId) {
      assignmentMode = "selected";
      tablePreflight = await buildRescheduleTablePreflight({ restaurantId, reservation, tableIds: [input.tableId], startsAt, lockEnd });
    } else {
      const currentTableIds = Array.from(new Set(currentLocks.map((lock) => lock.table_id)));
      if (currentTableIds.length > 0) {
        tablePreflight = await buildRescheduleTablePreflight({ restaurantId, reservation, tableIds: currentTableIds, startsAt, lockEnd });
        assignmentMode = "current";
      }

      if (!tablePreflight?.canSave && currentTableIds.length <= 1) {
        const availableTables = await getAvailableTables(
          restaurantId,
          reservation.partySize,
          startsAt,
          lockEnd,
          {
            preferredTableAreaId: reservation.preferredTableAreaId ?? undefined,
            preferredSeatingZone: reservation.preferredSeatingZone ?? undefined,
            preferredTableKind: reservation.preferredTableKind ?? undefined
          },
          reservation.id
        );
        const autoTable = availableTables[0];
        if (autoTable) {
          tablePreflight = await buildRescheduleTablePreflight({ restaurantId, reservation, tableIds: [autoTable.id], startsAt, lockEnd });
          assignmentMode = "auto";
          warnings.push({ code: "auto_reassign", message: `Bàn hiện tại không phù hợp, LogiVN đề xuất ${autoTable.name}.` });
        }
      }
    }

    if (!tablePreflight) {
      blockers.push({ code: "no_table", message: "Không tìm thấy bàn phù hợp trong giờ mới." });
    }
  }

  const allBlockers = [...blockers, ...(tablePreflight?.blockers ?? [])];
  const allWarnings = [...warnings, ...(tablePreflight?.warnings ?? [])];

  return {
    reservationId,
    partySize: reservation.partySize,
    startsAt: Number.isFinite(startsAt.getTime()) ? startsAt.toISOString() : input.startsAt,
    endsAt: Number.isFinite(endsAt.getTime()) ? endsAt.toISOString() : null,
    lockEnd: Number.isFinite(lockEnd.getTime()) ? lockEnd.toISOString() : null,
    assignmentMode,
    canSave: allBlockers.length === 0,
    blockers: allBlockers,
    warnings: allWarnings,
    tableIds: tablePreflight?.tableIds ?? [],
    tableCount: tablePreflight?.tableCount ?? 0,
    totalCapacity: tablePreflight?.totalCapacity ?? 0,
    capacityGap: tablePreflight?.capacityGap ?? reservation.partySize,
    tables: tablePreflight?.tables ?? []
  };
}

export async function rescheduleReservation(
  restaurantId: string,
  reservationId: string,
  input: {
    startsAt: string;
    tableId?: string;
  }
) {
  const reservation = await getFreshReservationById(reservationId, restaurantId);
  if (reservation.seatedTableBillId || reservation.status === "seated") {
    throw new AppError("Lịch đã vào bàn. Hãy đổi thời gian trong phiên bàn đang phục vụ nếu cần.", 400);
  }
  if (reservation.status === "checked_in") {
    throw new AppError("Khách đã check-in. Hãy nhận khách vào bàn hoặc huỷ check-in bằng quy trình vận hành.", 400);
  }
  if (isClosedReservationStatus(reservation.status)) {
    throw new AppError("Không thể đổi giờ cho lịch đặt đã kết thúc.", 400);
  }

  const settings = await getReservationSettingsByAdmin(restaurantId);
  const startsAt = new Date(input.startsAt);
  if (!Number.isFinite(startsAt.getTime())) throw new AppError("Khung giờ mới không hợp lệ.", 400);
  assertStaffRescheduleTime(settings, startsAt);

  const endsAt = addMinutes(startsAt, Number(settings.reservation_duration_minutes));
  assertReservationInsideOperatingHours(settings, startsAt, endsAt);
  const lockEnd = addMinutes(endsAt, Number(settings.reservation_buffer_minutes));
  const currentLocks = await getActiveReservationLocks(restaurantId, reservationId);
  const tables = await getRescheduleTables({
    restaurantId,
    reservation,
    currentLocks,
    startsAt,
    lockEnd,
    preferredTableId: input.tableId
  });
  const supabase = createAdminSupabaseClient();
  const replacement = await replaceReservationTableLocks({
    supabase,
    restaurantId,
    reservationId,
    currentLocks,
    tableIds: tables.map((table) => table.id),
    startsAt,
    lockEnd
  });

  const { error } = await supabase
    .from("reservations")
    .update({ starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() })
    .eq("id", reservationId)
    .eq("restaurant_id", restaurantId);
  if (error) await replacement.rollback();
  throwIfSupabaseError(error);

  await recordReservationStatusChange(supabase, {
    restaurantId,
    reservationId,
    fromStatus: reservation.status,
    toStatus: reservation.status,
    actorType: "merchant",
    note: "reservation_rescheduled",
    metadata: {
      fromStartsAt: reservation.startsAt,
      toStartsAt: startsAt.toISOString(),
      fromTableIds: replacement.fromTableIds.join(","),
      toTableIds: replacement.toTableIds.join(","),
      tableCount: tables.length
    }
  });
  await scheduleReservationReminderNotifications(supabase, {
    restaurantId,
    reservationId,
    startsAt: startsAt.toISOString(),
    partySize: reservation.partySize,
    customerName: reservation.customerName
  });

  invalidateRestaurantDashboardCache(restaurantId);
  const nextReservation = await getReservationById(reservationId, restaurantId);
  await enqueueTelegramNotification({
    type: "reservation.rescheduled",
    eventId: `reservation.rescheduled:${reservationId}:${startsAt.toISOString()}`,
    restaurantId,
    branchId: null,
    source: "dashboard",
    actor: { type: "merchant" },
    reservation: buildTelegramReservationSnapshot(nextReservation, { previousStartsAt: reservation.startsAt })
  });
  return nextReservation;
}

export async function seatReservation(restaurantId: string, reservationId: string) {
  const reservation = await getFreshReservationById(reservationId, restaurantId);
  if (reservation.seatedTableBillId) return reservation;
  if (reservation.status !== "confirmed" && reservation.status !== "checked_in") {
    throw new AppError("Chỉ có thể nhận khách cho đặt bàn đã xác nhận.", 400);
  }
  const table = reservation.tables[0];
  if (!table) throw new AppError("Đặt bàn chưa có bàn được giữ.", 400);
  const preflight = await preflightReservationSeating(restaurantId, reservationId);
  if (!preflight.canSeat) {
    throw new AppError(preflight.blockers[0]?.message ?? "Lịch đặt chưa đủ điều kiện nhận khách vào bàn.", 409);
  }

  const supabase = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const { data: bill, error: billError } = await supabase
    .from("table_bills")
    .insert({
      restaurant_id: restaurantId,
      table_id: table.id,
      status: "open",
      reservation_id: reservationId,
      deposit_applied_amount: reservation.depositPaidAmount
    })
    .select("id")
    .single();

  if ((billError as { code?: string } | null)?.code === "23505") {
    throw new AppError("Bàn đang có hóa đơn mở. Hãy đóng hóa đơn hiện tại trước khi nhận khách vào bàn.", 409);
  }
  throwIfSupabaseError(billError);
  if (!bill) throw new AppError("Không mở được hóa đơn cho lịch đặt này.", 400);

  const { error } = await supabase
    .from("reservations")
    .update({ status: "seated", checked_in_at: reservation.checkedInAt ?? now, seated_at: now, seated_table_bill_id: bill.id })
    .eq("id", reservationId)
    .eq("restaurant_id", restaurantId);
  throwIfSupabaseError(error);

  await recordReservationStatusChange(supabase, {
    restaurantId,
    reservationId,
    fromStatus: reservation.status,
    toStatus: "seated",
    actorType: "merchant",
    note: "reservation_seated"
  });
  await recordReservationTableOccupancyEvents(supabase, {
    restaurantId,
    reservation,
    tableBillId: bill.id,
    eventType: "reservation_seated",
  });
  await skipQueuedReservationReminderNotifications(supabase, {
    restaurantId,
    reservationId,
    reason: "reservation_seated"
  });

  invalidateRestaurantDashboardCache(restaurantId);
  const nextReservation = await getReservationById(reservationId, restaurantId);
  await enqueueTelegramNotification({
    type: "reservation.seated",
    eventId: `reservation.seated:${reservationId}`,
    restaurantId,
    branchId: null,
    source: "dashboard",
    actor: { type: "merchant" },
    reservation: buildTelegramReservationSnapshot(nextReservation)
  });
  return nextReservation;
}

export async function markReservationNoShow(restaurantId: string, reservationId: string) {
  const reservation = await getFreshReservationById(reservationId, restaurantId);
  if (reservation.status === "no_show") return reservation;
  if (reservation.status !== "confirmed") {
    throw new AppError("Chỉ có thể đánh dấu no-show cho đặt bàn đã xác nhận.", 400);
  }

  const settings = await getReservationSettingsByAdmin(restaurantId);
  const arrivalGraceMinutes = Number(settings.reservation_arrival_grace_minutes);
  const noShowAt = reservationNoShowAvailableAt(reservation.startsAt, arrivalGraceMinutes);
  if (noShowAt.getTime() > Date.now()) {
    throw new AppError(`Chỉ được đánh dấu no-show sau ${arrivalGraceMinutes} phút trễ hẹn.`, 400);
  }

  const supabase = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("reservations")
    .update({ status: "no_show", no_show_at: now })
    .eq("id", reservationId)
    .eq("restaurant_id", restaurantId);
  throwIfSupabaseError(error);

  const { error: lockError } = await supabase
    .from("reservation_table_locks")
    .update({ status: "released" })
    .eq("reservation_id", reservationId)
    .eq("restaurant_id", restaurantId);
  throwIfSupabaseError(lockError);

  const depositDisposition = await applyReservationClosureDepositDisposition(supabase, { restaurantId, reservation, closure: "no_show", source: "merchant_reservation_no_show" });
  await recordReservationCustomerRiskEvent(supabase, {
    restaurantId,
    reservation,
    eventType: "no_show",
    severity: depositDisposition?.nextDepositStatus === "forfeited" ? "risk" : "watch",
    metadata: {
      graceMinutes: arrivalGraceMinutes,
      depositDisposition: depositDisposition?.nextDepositStatus ?? null
    }
  });

  await recordReservationStatusChange(supabase, {
    restaurantId,
    reservationId,
    fromStatus: reservation.status,
    toStatus: "no_show",
    actorType: "merchant",
    note: "reservation_no_show",
    metadata: depositDisposition ? { depositDisposition: depositDisposition.nextDepositStatus } : undefined
  });
  await recordReservationTableOccupancyEvents(supabase, {
    restaurantId,
    reservation,
    eventType: "reservation_no_show",
  });
  await skipQueuedReservationReminderNotifications(supabase, {
    restaurantId,
    reservationId,
    reason: "reservation_no_show"
  });

  invalidateRestaurantDashboardCache(restaurantId);
  const nextReservation = await getReservationById(reservationId, restaurantId);
  await enqueueTelegramNotification({
    type: "reservation.no_show",
    eventId: `reservation.no_show:${reservationId}`,
    restaurantId,
    branchId: null,
    source: "dashboard",
    actor: { type: "merchant" },
    reservation: buildTelegramReservationSnapshot(nextReservation)
  });
  return nextReservation;
}

export async function completeReservationForBill(
  restaurantId: string,
  billId: string
) {
  const supabase = createAdminSupabaseClient();
  let { data, error } = await supabase
    .from("reservations")
    .select(reservationSelect)
    .eq("restaurant_id", restaurantId)
    .eq("seated_table_bill_id", billId)
    .maybeSingle();

  if (isMissingReservationPreferenceColumns(error)) {
    const legacyResult = await supabase
      .from("reservations")
      .select(legacyReservationSelect)
      .eq("restaurant_id", restaurantId)
      .eq("seated_table_bill_id", billId)
      .maybeSingle();
    data = legacyResult.data as typeof data;
    error = legacyResult.error;
  }

  throwIfSupabaseError(error);
  if (!data) return null;

  const reservation = mapReservation(data as unknown as ReservationRow & { locks?: ReservationLockRow[] });
  if (reservation.status === "completed") return reservation;
  if (reservation.status !== "seated") return reservation;

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("reservations")
    .update({ status: "completed", completed_at: now })
    .eq("id", reservation.id)
    .eq("restaurant_id", restaurantId)
    .eq("status", "seated")
    .select("id")
    .maybeSingle();
  throwIfSupabaseError(updateError);
  if (!updated) return getReservationById(reservation.id, restaurantId);

  const { error: releaseError } = await supabase
    .from("reservation_table_locks")
    .update({ status: "released" })
    .eq("reservation_id", reservation.id)
    .eq("restaurant_id", restaurantId)
    .eq("status", "active");
  throwIfSupabaseError(releaseError);

  await recordReservationStatusChange(supabase, {
    restaurantId,
    reservationId: reservation.id,
    fromStatus: reservation.status,
    toStatus: "completed",
    actorType: "system",
    note: "reservation_bill_paid"
  });
  await recordReservationTableOccupancyEvents(supabase, {
    restaurantId,
    tableBillId: billId,
    reservation,
    eventType: "reservation_completed",
  });

  invalidateRestaurantDashboardCache(restaurantId);
  return getReservationById(reservation.id, restaurantId);
}

export function reservationDepositMessage(settings: ReservationSettings, partySize: number) {
  const amount = calculateDepositAmount(settings, partySize);
  if (amount <= 0) return "Không cần đặt cọc";
  return `Cọc giữ bàn ${money(amount)}đ${settings.reservation_deposit_type === "PER_PERSON" ? ` cho ${partySize} khách` : ""}`;
}

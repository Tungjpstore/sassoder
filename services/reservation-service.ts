import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildVietQrUrl } from "@/lib/vietqr";
import { ensureReservationDepositLogEvent, reservationDepositTransitionKey } from "@/services/payment-log-service";
import { rankReservationTablesForAssignment, reservationAssignmentReason, type ReservationAssignableTable } from "@/services/reservation-assignment";
import { roundUpToSlotBoundary } from "@/services/reservation-time";
import { invalidateRestaurantDashboardCache } from "@/services/restaurant-service";
import { assertFeatureEntitlement } from "@/services/subscription-service";
import type { PaymentMethod, ReservationDepositStatus, ReservationDepositType, ReservationDto, ReservationStatus } from "@/types/domain";
import type { Database } from "@/types/supabase";

type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"];
type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
type ReservationDbStatus = ReservationRow["status"];
type ReservationSupabaseClient = SupabaseClient<Database>;
type ReservationLockRow = Database["public"]["Tables"]["reservation_table_locks"]["Row"] & {
  table?:
    | { id: string; name: string; area: string; capacity: number; floor_label?: string | null; seating_zone?: string | null; table_kind?: string | null }
    | { id: string; name: string; area: string; capacity: number; floor_label?: string | null; seating_zone?: string | null; table_kind?: string | null }[]
    | null;
};

type CandidateReservationTable = ReservationAssignableTable & {
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

export type PublicReservationResult = {
  reservation: ReservationDto;
  token?: string;
  payment: ReservationPayment | null;
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
const activeHoldStatuses = ["holding", "waiting_deposit_confirm"] satisfies ReservationDbStatus[];
const closedReservationStatuses = ["completed", "cancelled", "rejected", "expired", "no_show"] satisfies ReservationDbStatus[];

const reservationSelect =
  "id,restaurant_id,status,customer_name,customer_phone,customer_email,party_size,starts_at,ends_at,hold_expires_at,deposit_required_amount,deposit_paid_amount,deposit_status,payment_method,customer_note,internal_note,source,idempotency_key,seated_table_bill_id,created_at,updated_at,confirmed_at,checked_in_at,seated_at,completed_at,cancelled_at,rejected_at,expired_at,no_show_at,locks:reservation_table_locks(id,table_id,starts_at,ends_at,status,table:tables(id,name,area,capacity,floor_label,seating_zone,table_kind))";

const candidateTableSelect =
  "id,name,area,capacity,floor_label,seating_zone,table_kind,reservation_priority,is_bookable,is_hidden,is_under_maintenance";

const reservationSettingsSelect =
  "id,name,slug,bank_code,bank_account,bank_account_name,logo_url,address,store_lat,store_lng,hotline,contact_email,opening_time,closing_time,reservations_enabled,reservation_deposit_enabled,reservation_deposit_type,reservation_deposit_value,reservation_hold_minutes,reservation_duration_minutes,reservation_buffer_minutes,reservation_min_notice_minutes,reservation_max_days_ahead,reservation_arrival_grace_minutes";

function firstOrNull<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
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

function noShowAvailableAt(reservation: Pick<ReservationDto, "startsAt">, graceMinutes: number) {
  return addMinutes(new Date(reservation.startsAt), graceMinutes);
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
        (table): table is { id: string; name: string; area: string; capacity: number; floor_label?: string | null; seating_zone?: string | null; table_kind?: string | null } =>
          Boolean(table)
      )
      .map((table) => ({
        id: table.id,
        name: table.name,
        area: table.area,
        capacity: table.capacity,
        floorLabel: table.floor_label ?? null,
        seatingZone: table.seating_zone ?? null,
        tableKind: table.table_kind ?? null
      }))
  };
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
  }
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

async function getSettingsBySlug(slug: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("restaurants")
    .select(reservationSettingsSelect)
    .eq("slug", slug)
    .maybeSingle();

  throwIfSupabaseError(error);
  return data as ReservationSettings | null;
}

export const getPublicReservationSettingsBySlug = getSettingsBySlug;

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

async function getCandidateTables(restaurantId: string, partySize: number) {
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
  return rankReservationTablesForAssignment((data ?? []) as CandidateReservationTable[], partySize);
}

async function getBookableTableById(restaurantId: string, tableId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("tables")
    .select(candidateTableSelect)
    .eq("id", tableId)
    .eq("restaurant_id", restaurantId)
    .eq("is_bookable", true)
    .eq("is_hidden", false)
    .eq("is_under_maintenance", false)
    .maybeSingle();

  throwIfSupabaseError(error);
  return data as CandidateReservationTable | null;
}

async function getActiveReservationLock(restaurantId: string, reservationId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("reservation_table_locks")
    .select("id,reservation_id,restaurant_id,table_id,starts_at,ends_at,status")
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", reservationId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  throwIfSupabaseError(error);
  return data;
}

async function getAvailableTables(restaurantId: string, partySize: number, startsAt: Date, endsAt: Date) {
  const [tables, locks, activeBillTableIds] = await Promise.all([
    getCandidateTables(restaurantId, partySize),
    getActiveLocks(restaurantId, startsAt, endsAt),
    getActiveBillTableIds(restaurantId)
  ]);
  const lockedIds = new Set(locks.map((lock) => lock.table_id));
  return tables.filter((table) => !lockedIds.has(table.id) && !hasNearTermActiveBill(table.id, startsAt, activeBillTableIds));
}

async function getAvailabilityContext(restaurantId: string, partySize: number, startsAt: Date, endsAt: Date) {
  const [tables, locks, activeBillTableIds] = await Promise.all([
    getCandidateTables(restaurantId, partySize),
    getActiveLocks(restaurantId, startsAt, endsAt),
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

function hasNearTermActiveBill(tableId: string, startsAt: Date, activeBillTableIds: Set<string>) {
  if (!activeBillTableIds.has(tableId)) return false;
  return startsAt.getTime() <= addMinutes(new Date(), ACTIVE_BILL_AVOIDANCE_MINUTES).getTime();
}

function assertBookableTime(settings: ReservationSettings, startsAt: Date) {
  if (!settings.reservations_enabled) throw new AppError("Quán chưa bật đặt bàn trước.", 400);
  const now = new Date();
  const minStart = addMinutes(now, Number(settings.reservation_min_notice_minutes));
  const maxStart = addMinutes(now, Number(settings.reservation_max_days_ahead) * 24 * 60);
  if (startsAt < minStart) throw new AppError(`Vui lòng đặt bàn trước ít nhất ${settings.reservation_min_notice_minutes} phút.`, 400);
  if (startsAt > maxStart) throw new AppError(`Quán chỉ nhận đặt bàn trong ${settings.reservation_max_days_ahead} ngày tới.`, 400);
}

export async function getReservationAvailability(input: {
  restaurantSlug: string;
  date: string;
  partySize: number;
}) {
  const settings = await getSettingsBySlug(input.restaurantSlug);
  if (!settings) throw new AppError("Không tìm thấy quán", 404);
  await assertFeatureEntitlement(settings.id, "reservations");
  await expireReservationHolds(settings.id);

  if (!settings.reservations_enabled) {
    return { restaurant: settings, slots: [] as ReservationAvailabilitySlot[] };
  }

  const { start, end } = dayBounds(input.date, settings);
  const now = new Date();
  const firstAllowed = addMinutes(now, Number(settings.reservation_min_notice_minutes));
  const duration = Number(settings.reservation_duration_minutes);
  const buffer = Number(settings.reservation_buffer_minutes);
  const slots: ReservationAvailabilitySlot[] = [];
  const { tables, locks, activeBillTableIds } = await getAvailabilityContext(settings.id, input.partySize, start, addMinutes(end, buffer));

  for (let slotStart = roundUpToSlotBoundary(new Date(Math.max(start.getTime(), firstAllowed.getTime()))); addMinutes(slotStart, duration) <= end; slotStart = addMinutes(slotStart, 30)) {
    const slotEnd = addMinutes(slotStart, duration);
    const lockEnd = addMinutes(slotEnd, buffer);
    const availableTables = tables.filter(
      (table) =>
        !hasNearTermActiveBill(table.id, slotStart, activeBillTableIds) &&
        !locks.some((lock) => lock.table_id === table.id && overlap(new Date(lock.starts_at), new Date(lock.ends_at), slotStart, lockEnd))
    );
    const hint = slotAvailabilityHint(slotStart, availableTables.length);
    slots.push({
      startsAt: slotStart.toISOString(),
      endsAt: slotEnd.toISOString(),
      available: availableTables.length > 0,
      tableCount: availableTables.length,
      bestTableName: availableTables[0]?.name ?? null,
      ...hint,
      recommendationReason: availableTables[0] ? reservationAssignmentReason(availableTables[0], input.partySize) : hint.recommendationReason
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
}): Promise<PublicReservationResult> {
  const supabase = createAdminSupabaseClient();
  const settings = await getSettingsBySlug(input.restaurantSlug);
  if (!settings) throw new AppError("Không tìm thấy quán", 404);
  await assertFeatureEntitlement(settings.id, "reservations");
  await expireReservationHolds(settings.id);

  const startsAt = new Date(input.startsAt);
  if (!Number.isFinite(startsAt.getTime())) throw new AppError("Khung giờ đặt bàn không hợp lệ", 400);
  assertBookableTime(settings, startsAt);

  const duration = Number(settings.reservation_duration_minutes);
  const buffer = Number(settings.reservation_buffer_minutes);
  const endsAt = addMinutes(startsAt, duration);
  assertReservationInsideOperatingHours(settings, startsAt, endsAt);
  const lockEnd = addMinutes(endsAt, buffer);
  const availableTables = await getAvailableTables(settings.id, input.partySize, startsAt, lockEnd);
  const table = availableTables[0];
  if (!table) throw new AppError("Khung giờ này vừa hết bàn phù hợp. Vui lòng chọn giờ khác.", 409);

  const depositAmount = calculateDepositAmount(settings, input.partySize);
  if (depositAmount > 0) {
    await assertFeatureEntitlement(settings.id, "reservation_deposits");
  }
  if (depositAmount > 0 && (!settings.bank_code || !settings.bank_account)) {
    throw new AppError("Quán đang bật nhận cọc nhưng chưa cấu hình ngân hàng VietQR.", 400);
  }

  const accessToken = randomUUID();
  const tokenHash = hashToken(accessToken);
  const now = new Date();
  const needsDeposit = depositAmount > 0;

  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .insert({
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
      source: "PUBLIC",
      access_token_hash: tokenHash,
      idempotency_key: input.idempotencyKey || null,
      confirmed_at: needsDeposit ? null : now.toISOString()
    })
    .select(reservationSelect)
    .single();

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
      assignmentReason: reservationAssignmentReason(table, input.partySize)
    }
  });
  await recordOccupancyEvent(supabase, {
    restaurantId: settings.id,
    tableId: table.id,
    reservationId: reservation.id,
    eventType: "reservation_created",
    partySize: input.partySize
  });

  const nextReservation = await getReservationById(reservation.id, settings.id);
  invalidateRestaurantDashboardCache(settings.id);
  return {
    reservation: nextReservation,
    token: accessToken,
    payment: reservationPayment(settings, nextReservation)
  };
}

async function getReservationById(reservationId: string, restaurantId?: string) {
  const supabase = createAdminSupabaseClient();
  let query = supabase.from("reservations").select(reservationSelect).eq("id", reservationId);
  if (restaurantId) query = query.eq("restaurant_id", restaurantId);
  const { data, error } = await query.single();
  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không tìm thấy đặt bàn", 404);
  return mapReservation(data as unknown as ReservationRow & { locks?: ReservationLockRow[] });
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

  return {
    reservation,
    payment: reservationPayment(settings, reservation)
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

  if (reservation.depositRequiredAmount > 0) {
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

  await recordReservationStatusChange(supabase, {
    restaurantId,
    reservationId,
    fromStatus: reservation.status,
    toStatus: "cancelled",
    actorType: "customer",
    note: "reservation_customer_cancel"
  });
  await recordOccupancyEvent(supabase, {
    restaurantId,
    tableId: reservation.tables[0]?.id ?? null,
    reservationId,
    eventType: "reservation_cancelled",
    partySize: reservation.partySize
  });

  invalidateRestaurantDashboardCache(restaurantId);
  return getPublicReservation(reservationId, token);
}

export async function listReservationsForRestaurant(restaurantId: string, date?: string) {
  await expireReservationHolds(restaurantId);
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("reservations")
    .select(reservationSelect)
    .eq("restaurant_id", restaurantId)
    .order("starts_at", { ascending: true })
    .limit(200);

  if (date) {
    const { start, end } = dayBounds(date, await getReservationSettings(restaurantId));
    query = query.gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString());
  }

  const { data, error } = await query;
  throwIfSupabaseError(error);
  return ((data ?? []) as unknown as Array<ReservationRow & { locks?: ReservationLockRow[] }>).map(mapReservation);
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

  invalidateRestaurantDashboardCache(restaurantId);
  return getReservationById(reservationId, restaurantId);
}

export async function cancelReservation(restaurantId: string, reservationId: string) {
  const reservation = await getFreshReservationById(reservationId, restaurantId);
  const supabase = createAdminSupabaseClient();
  if (reservation.status === "cancelled") {
    if (reservation.depositRequiredAmount > 0) {
      await ensureReservationDepositLogEvent(supabase, {
        reservationId,
        restaurantId,
        method: reservation.paymentMethod ?? "QR",
        status: "cancelled",
        amount: reservation.depositRequiredAmount,
        source: "merchant_reservation_cancel",
        transitionKey: reservationDepositTransitionKey(reservationId, "merchant-cancel")
      });
    }
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

  if (reservation.depositRequiredAmount > 0) {
    await ensureReservationDepositLogEvent(supabase, {
      reservationId,
      restaurantId,
      method: reservation.paymentMethod ?? "QR",
      status: "cancelled",
      amount: reservation.depositRequiredAmount,
      source: "merchant_reservation_cancel",
      transitionKey: reservationDepositTransitionKey(reservationId, "merchant-cancel")
    });
  }

  await recordReservationStatusChange(supabase, {
    restaurantId,
    reservationId,
    fromStatus: reservation.status,
    toStatus: "cancelled",
    actorType: "merchant",
    note: "reservation_merchant_cancel"
  });
  await recordOccupancyEvent(supabase, {
    restaurantId,
    tableId: reservation.tables[0]?.id ?? null,
    reservationId,
    eventType: "reservation_cancelled",
    partySize: reservation.partySize
  });

  invalidateRestaurantDashboardCache(restaurantId);
  return getReservationById(reservationId, restaurantId);
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
  if (reservation.depositPaidAmount > 0 || reservation.depositStatus === "paid" || reservation.depositStatus === "waiting_confirm") {
    throw new AppError("Lịch đặt đã phát sinh cọc. Hãy huỷ lịch và xử lý hoàn cọc theo quy trình vận hành.", 409);
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

  if (reservation.depositRequiredAmount > 0) {
    await ensureReservationDepositLogEvent(supabase, {
      reservationId,
      restaurantId,
      method: reservation.paymentMethod ?? "QR",
      status: "cancelled",
      amount: reservation.depositRequiredAmount,
      source: "merchant_reservation_reject",
      transitionKey: reservationDepositTransitionKey(reservationId, "merchant-reject")
    });
  }

  await recordReservationStatusChange(supabase, {
    restaurantId,
    reservationId,
    fromStatus: reservation.status,
    toStatus: "rejected",
    actorType: "merchant",
    note: "reservation_merchant_reject"
  });
  await recordOccupancyEvent(supabase, {
    restaurantId,
    tableId: reservation.tables[0]?.id ?? null,
    reservationId,
    eventType: "reservation_cancelled",
    partySize: reservation.partySize,
    metadata: { reason: "rejected" }
  });

  invalidateRestaurantDashboardCache(restaurantId);
  return getReservationById(reservationId, restaurantId);
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
  await recordOccupancyEvent(supabase, {
    restaurantId,
    tableId: reservation.tables[0]?.id ?? null,
    reservationId,
    eventType: "reservation_checked_in",
    partySize: reservation.partySize
  });

  invalidateRestaurantDashboardCache(restaurantId);
  return getReservationById(reservationId, restaurantId);
}

export async function moveReservationTable(restaurantId: string, reservationId: string, nextTableId: string) {
  const reservation = await getFreshReservationById(reservationId, restaurantId);
  if (reservation.seatedTableBillId || reservation.status === "seated") {
    throw new AppError("Lịch đã vào bàn. Hãy đổi bàn trong hóa đơn đang phục vụ.", 400);
  }
  if (isClosedReservationStatus(reservation.status)) {
    throw new AppError("Không thể đổi bàn cho lịch đặt đã kết thúc.", 400);
  }

  const currentLock = await getActiveReservationLock(restaurantId, reservationId);
  if (!currentLock) throw new AppError("Lịch đặt chưa có bàn đang giữ.", 400);
  if (currentLock.table_id === nextTableId) return reservation;

  const nextTable = await getBookableTableById(restaurantId, nextTableId);
  if (!nextTable) throw new AppError("Bàn mới không khả dụng cho đặt trước.", 400);
  if (nextTable.capacity < reservation.partySize) {
    throw new AppError("Bàn mới không đủ sức chứa cho số khách của lịch đặt.", 400);
  }

  const startsAt = new Date(currentLock.starts_at);
  const endsAt = new Date(currentLock.ends_at);
  const [locks, activeBillTableIds] = await Promise.all([
    getActiveLocks(restaurantId, startsAt, endsAt, reservationId),
    getActiveBillTableIds(restaurantId)
  ]);
  if (locks.some((lock) => lock.table_id === nextTableId) || hasNearTermActiveBill(nextTableId, startsAt, activeBillTableIds)) {
    throw new AppError("Bàn mới đang bận trong khung giờ này.", 409);
  }

  const supabase = createAdminSupabaseClient();
  const { error: insertError } = await supabase.from("reservation_table_locks").insert({
    reservation_id: reservationId,
    restaurant_id: restaurantId,
    table_id: nextTableId,
    starts_at: currentLock.starts_at,
    ends_at: currentLock.ends_at
  });

  if ((insertError as { code?: string } | null)?.code === "23P01") {
    throw new AppError("Bàn mới vừa được giữ bởi lịch khác. Vui lòng chọn bàn khác.", 409);
  }
  throwIfSupabaseError(insertError);

  const { error: releaseError } = await supabase
    .from("reservation_table_locks")
    .update({ status: "released" })
    .eq("id", currentLock.id)
    .eq("restaurant_id", restaurantId);
  throwIfSupabaseError(releaseError);

  await recordReservationStatusChange(supabase, {
    restaurantId,
    reservationId,
    fromStatus: reservation.status,
    toStatus: reservation.status,
    actorType: "merchant",
    note: "reservation_table_moved",
    metadata: {
      fromTableId: currentLock.table_id,
      toTableId: nextTableId
    }
  });

  invalidateRestaurantDashboardCache(restaurantId);
  return getReservationById(reservationId, restaurantId);
}

export async function seatReservation(restaurantId: string, reservationId: string) {
  const reservation = await getFreshReservationById(reservationId, restaurantId);
  if (reservation.seatedTableBillId) return reservation;
  if (reservation.status !== "confirmed" && reservation.status !== "checked_in") {
    throw new AppError("Chỉ có thể nhận khách cho đặt bàn đã xác nhận.", 400);
  }
  const table = reservation.tables[0];
  if (!table) throw new AppError("Đặt bàn chưa có bàn được giữ.", 400);

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
  await recordOccupancyEvent(supabase, {
    restaurantId,
    tableId: table.id,
    tableBillId: bill.id,
    reservationId,
    eventType: "reservation_seated",
    partySize: reservation.partySize
  });

  invalidateRestaurantDashboardCache(restaurantId);
  return getReservationById(reservationId, restaurantId);
}

export async function markReservationNoShow(restaurantId: string, reservationId: string) {
  const reservation = await getFreshReservationById(reservationId, restaurantId);
  if (reservation.status === "no_show") return reservation;
  if (reservation.status !== "confirmed") {
    throw new AppError("Chỉ có thể đánh dấu no-show cho đặt bàn đã xác nhận.", 400);
  }

  const settings = await getReservationSettingsByAdmin(restaurantId);
  const arrivalGraceMinutes = Number(settings.reservation_arrival_grace_minutes);
  const noShowAt = noShowAvailableAt(reservation, arrivalGraceMinutes);
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

  await recordReservationStatusChange(supabase, {
    restaurantId,
    reservationId,
    fromStatus: reservation.status,
    toStatus: "no_show",
    actorType: "merchant",
    note: "reservation_no_show"
  });
  await recordOccupancyEvent(supabase, {
    restaurantId,
    tableId: reservation.tables[0]?.id ?? null,
    reservationId,
    eventType: "reservation_no_show",
    partySize: reservation.partySize
  });

  invalidateRestaurantDashboardCache(restaurantId);
  return getReservationById(reservationId, restaurantId);
}

export async function completeReservationForBill(
  restaurantId: string,
  billId: string
) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(reservationSelect)
    .eq("restaurant_id", restaurantId)
    .eq("seated_table_bill_id", billId)
    .maybeSingle();

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
  await recordOccupancyEvent(supabase, {
    restaurantId,
    tableId: reservation.tables[0]?.id ?? null,
    tableBillId: billId,
    reservationId: reservation.id,
    eventType: "reservation_completed",
    partySize: reservation.partySize
  });

  invalidateRestaurantDashboardCache(restaurantId);
  return getReservationById(reservation.id, restaurantId);
}

export function reservationDepositMessage(settings: ReservationSettings, partySize: number) {
  const amount = calculateDepositAmount(settings, partySize);
  if (amount <= 0) return "Không cần đặt cọc";
  return `Cọc giữ bàn ${money(amount)}đ${settings.reservation_deposit_type === "PER_PERSON" ? ` cho ${partySize} khách` : ""}`;
}

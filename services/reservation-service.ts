import { createHash, randomUUID } from "node:crypto";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildVietQrUrl } from "@/lib/vietqr";
import { ensureReservationDepositLogEvent, reservationDepositTransitionKey } from "@/services/payment-log-service";
import { roundUpToSlotBoundary } from "@/services/reservation-time";
import { invalidateRestaurantDashboardCache } from "@/services/restaurant-service";
import { assertFeatureEntitlement } from "@/services/subscription-service";
import type { PaymentMethod, ReservationDepositStatus, ReservationDepositType, ReservationDto, ReservationStatus } from "@/types/domain";
import type { Database } from "@/types/supabase";

type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"];
type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
type ReservationLockRow = Database["public"]["Tables"]["reservation_table_locks"]["Row"] & {
  table?: { id: string; name: string; area: string; capacity: number } | { id: string; name: string; area: string; capacity: number }[] | null;
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
const activeHoldStatuses: ReservationStatus[] = ["holding", "waiting_deposit_confirm"];
const closedReservationStatuses: ReservationStatus[] = ["completed", "cancelled", "expired", "no_show"];

const reservationSelect =
  "id,restaurant_id,status,customer_name,customer_phone,customer_email,party_size,starts_at,ends_at,hold_expires_at,deposit_required_amount,deposit_paid_amount,deposit_status,payment_method,customer_note,internal_note,source,idempotency_key,seated_table_bill_id,created_at,updated_at,confirmed_at,seated_at,cancelled_at,expired_at,no_show_at,locks:reservation_table_locks(id,table_id,starts_at,ends_at,status,table:tables(id,name,area,capacity))";

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
  return activeHoldStatuses.includes(status);
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
    seatedAt: row.seated_at,
    cancelledAt: row.cancelled_at,
    expiredAt: row.expired_at,
    noShowAt: row.no_show_at,
    seatedTableBillId: row.seated_table_bill_id,
    tables: locks
      .filter((lock) => lock.status === "active")
      .map((lock) => firstOrNull(lock.table))
      .filter((table): table is { id: string; name: string; area: string; capacity: number } => Boolean(table))
  };
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
      .select("id,restaurant_id")
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

    for (const row of rows) invalidateRestaurantDashboardCache(row.restaurant_id);
    expired += rows.length;

    if (rows.length < limit) {
      hasMore = false;
      break;
    }
  }

  return { batches, expired, hasMore: hasMore && batches === maxBatches };
}

async function getActiveLocks(restaurantId: string, startsAt: Date, endsAt: Date) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("reservation_table_locks")
    .select("id,reservation_id,restaurant_id,table_id,starts_at,ends_at,status")
    .eq("restaurant_id", restaurantId)
    .eq("status", "active")
    .lt("starts_at", endsAt.toISOString())
    .gt("ends_at", startsAt.toISOString());

  throwIfSupabaseError(error);
  return data ?? [];
}

async function getCandidateTables(restaurantId: string, partySize: number) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("tables")
    .select("id,name,area,capacity")
    .eq("restaurant_id", restaurantId)
    .gte("capacity", partySize)
    .order("capacity", { ascending: true })
    .order("name", { ascending: true });

  throwIfSupabaseError(error);
  return data ?? [];
}

async function getAvailableTables(restaurantId: string, partySize: number, startsAt: Date, endsAt: Date) {
  const [tables, locks] = await Promise.all([
    getCandidateTables(restaurantId, partySize),
    getActiveLocks(restaurantId, startsAt, endsAt)
  ]);
  const lockedIds = new Set(locks.map((lock) => lock.table_id));
  return tables.filter((table) => !lockedIds.has(table.id));
}

async function getAvailabilityContext(restaurantId: string, partySize: number, startsAt: Date, endsAt: Date) {
  const [tables, locks] = await Promise.all([
    getCandidateTables(restaurantId, partySize),
    getActiveLocks(restaurantId, startsAt, endsAt)
  ]);

  return { tables, locks };
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
  const { tables, locks } = await getAvailabilityContext(settings.id, input.partySize, start, addMinutes(end, buffer));

  for (let slotStart = roundUpToSlotBoundary(new Date(Math.max(start.getTime(), firstAllowed.getTime()))); addMinutes(slotStart, duration) <= end; slotStart = addMinutes(slotStart, 30)) {
    const slotEnd = addMinutes(slotStart, duration);
    const lockEnd = addMinutes(slotEnd, buffer);
    const availableTables = tables.filter((table) => !locks.some((lock) => lock.table_id === table.id && overlap(new Date(lock.starts_at), new Date(lock.ends_at), slotStart, lockEnd)));
    const hint = slotAvailabilityHint(slotStart, availableTables.length);
    slots.push({
      startsAt: slotStart.toISOString(),
      endsAt: slotEnd.toISOString(),
      available: availableTables.length > 0,
      tableCount: availableTables.length,
      bestTableName: availableTables[0]?.name ?? null,
      ...hint
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

  invalidateRestaurantDashboardCache(restaurantId);
  return getPublicReservation(reservationId, token);
}

export async function cancelPublicReservation(reservationId: string, token: string): Promise<PublicReservationResult> {
  const restaurantId = await assertReservationAccess(reservationId, token);
  const reservation = await getFreshReservationById(reservationId, restaurantId);
  const supabase = createAdminSupabaseClient();

  if (reservation.status === "cancelled" || closedReservationStatuses.includes(reservation.status)) {
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
  if (closedReservationStatuses.includes(reservation.status)) {
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
  if (closedReservationStatuses.includes(reservation.status)) {
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

  invalidateRestaurantDashboardCache(restaurantId);
  return getReservationById(reservationId, restaurantId);
}

export async function seatReservation(restaurantId: string, reservationId: string) {
  const reservation = await getFreshReservationById(reservationId, restaurantId);
  if (reservation.seatedTableBillId) return reservation;
  if (reservation.status !== "confirmed") {
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
    .update({ status: "seated", seated_at: now, seated_table_bill_id: bill.id })
    .eq("id", reservationId)
    .eq("restaurant_id", restaurantId);
  throwIfSupabaseError(error);

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

  invalidateRestaurantDashboardCache(restaurantId);
  return getReservationById(reservationId, restaurantId);
}

export function reservationDepositMessage(settings: ReservationSettings, partySize: number) {
  const amount = calculateDepositAmount(settings, partySize);
  if (amount <= 0) return "Không cần đặt cọc";
  return `Cọc giữ bàn ${money(amount)}đ${settings.reservation_deposit_type === "PER_PERSON" ? ` cho ${partySize} khách` : ""}`;
}

import { createHash, randomUUID } from "node:crypto";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildVietQrUrl } from "@/lib/vietqr";
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
};

const reservationSelect =
  "id,restaurant_id,status,customer_name,customer_phone,customer_email,party_size,starts_at,ends_at,hold_expires_at,deposit_required_amount,deposit_paid_amount,deposit_status,payment_method,customer_note,internal_note,source,idempotency_key,seated_table_bill_id,created_at,updated_at,confirmed_at,seated_at,cancelled_at,expired_at,no_show_at,locks:reservation_table_locks(id,table_id,starts_at,ends_at,status,table:tables(id,name,area,capacity))";

const reservationSettingsSelect =
  "id,name,slug,bank_code,bank_account,bank_account_name,logo_url,address,hotline,contact_email,opening_time,closing_time,reservations_enabled,reservation_deposit_enabled,reservation_deposit_type,reservation_deposit_value,reservation_hold_minutes,reservation_duration_minutes,reservation_buffer_minutes,reservation_min_notice_minutes,reservation_max_days_ahead,reservation_arrival_grace_minutes";

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

function reservationPayment(settings: ReservationSettings, reservation: Pick<ReservationDto, "id" | "depositRequiredAmount" | "paymentMethod">): ReservationPayment | null {
  if (reservation.depositRequiredAmount <= 0 || reservation.paymentMethod !== "QR") return null;
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

export async function expireReservationHolds(restaurantId?: string) {
  const supabase = createAdminSupabaseClient();
  const now = new Date().toISOString();
  let query = supabase
    .from("reservations")
    .select("id,restaurant_id")
    .eq("status", "holding")
    .lt("hold_expires_at", now)
    .limit(250);

  if (restaurantId) query = query.eq("restaurant_id", restaurantId);
  const { data, error } = await query;
  throwIfSupabaseError(error);

  const rows = data ?? [];
  if (rows.length === 0) return { expired: 0 };

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
  return { expired: rows.length };
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

  for (let slotStart = new Date(Math.max(start.getTime(), firstAllowed.getTime())); addMinutes(slotStart, duration) <= end; slotStart = addMinutes(slotStart, 30)) {
    const slotEnd = addMinutes(slotStart, duration);
    const lockEnd = addMinutes(slotEnd, buffer);
    const availableTables = tables.filter((table) => !locks.some((lock) => lock.table_id === table.id && overlap(new Date(lock.starts_at), new Date(lock.ends_at), slotStart, lockEnd)));
    slots.push({
      startsAt: slotStart.toISOString(),
      endsAt: slotEnd.toISOString(),
      available: availableTables.length > 0,
      tableCount: availableTables.length,
      bestTableName: availableTables[0]?.name ?? null
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
    const { error: logError } = await supabase.from("reservation_deposit_logs").insert({
      reservation_id: reservation.id,
      restaurant_id: settings.id,
      method: "QR",
      status: "pending",
      amount: depositAmount,
      raw_data: { source: "reservation_deposit_required" }
    });
    throwIfSupabaseError(logError);
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
    getReservationById(reservationId, restaurantId),
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
  const reservation = await getReservationById(reservationId, restaurantId);
  if (reservation.depositRequiredAmount <= 0) return getPublicReservation(reservationId, token);
  if (reservation.depositStatus === "paid") return getPublicReservation(reservationId, token);
  if (reservation.status !== "holding" || reservation.depositStatus !== "waiting_payment") {
    return getPublicReservation(reservationId, token);
  }

  const supabase = createAdminSupabaseClient();
  const { error: logError } = await supabase.from("reservation_deposit_logs").insert({
    reservation_id: reservationId,
    restaurant_id: restaurantId,
    method: "QR",
    status: "waiting_confirm",
    amount: reservation.depositRequiredAmount,
    raw_data: { source: "reservation_customer_paid_button" }
  });
  throwIfSupabaseError(logError);

  const { error } = await supabase
    .from("reservations")
    .update({ status: "waiting_deposit_confirm", deposit_status: "waiting_confirm" })
    .eq("id", reservationId)
    .eq("restaurant_id", restaurantId);
  throwIfSupabaseError(error);

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
  const reservation = await getReservationById(reservationId, restaurantId);
  if (reservation.status === "cancelled" || reservation.status === "expired") {
    throw new AppError("Không thể xác nhận cọc cho đặt bàn đã huỷ hoặc hết hạn.", 400);
  }

  const now = new Date().toISOString();
  const supabase = createAdminSupabaseClient();
  const { error: logError } = await supabase.from("reservation_deposit_logs").insert({
    reservation_id: reservationId,
    restaurant_id: restaurantId,
    method: "QR",
    status: "confirmed",
    amount: reservation.depositRequiredAmount,
    raw_data: { source: "merchant_reservation_deposit_confirm" }
  });
  throwIfSupabaseError(logError);

  const { error } = await supabase
    .from("reservations")
    .update({
      status: "confirmed",
      deposit_status: reservation.depositRequiredAmount > 0 ? "paid" : "none",
      deposit_paid_amount: reservation.depositRequiredAmount,
      confirmed_at: now,
      hold_expires_at: null
    })
    .eq("id", reservationId)
    .eq("restaurant_id", restaurantId);
  throwIfSupabaseError(error);

  invalidateRestaurantDashboardCache(restaurantId);
  return getReservationById(reservationId, restaurantId);
}

export async function cancelReservation(restaurantId: string, reservationId: string) {
  const supabase = createAdminSupabaseClient();
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

  invalidateRestaurantDashboardCache(restaurantId);
  return getReservationById(reservationId, restaurantId);
}

export async function seatReservation(restaurantId: string, reservationId: string) {
  const reservation = await getReservationById(reservationId, restaurantId);
  if (reservation.seatedTableBillId) return reservation;
  if (!["confirmed", "waiting_deposit_confirm"].includes(reservation.status)) {
    throw new AppError("Chỉ có thể nhận khách cho đặt bàn đã xác nhận hoặc đang chờ xác nhận cọc.", 400);
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
    throw new AppError("Bàn đang có hóa đơn mở. Hãy đóng hóa đơn hiện tại trước khi nhận booking.", 409);
  }
  throwIfSupabaseError(billError);
  if (!bill) throw new AppError("Không mở được hóa đơn cho booking.", 400);

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

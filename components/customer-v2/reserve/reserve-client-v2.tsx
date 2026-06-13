"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReservationDto } from "@/types/domain";
import type { ReservationStatusTimelineItem } from "@/services/reservation-service";
import type { AiAgentAction } from "@/types/ai-agent";
import { CustomerAiAssistant } from "@/components/customer/customer-ai-assistant";
import type { FloorTable } from "./floor-map";
import { ReserveView } from "./reserve-view";

export type ReservationSeatingZone = "indoor" | "outdoor" | "mixed";
export type ReservationTableKind = "standard" | "vip" | "bar" | "community";

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

export type RestaurantInfo = {
  name: string;
  slug: string;
  logoUrl: string | null;
  address: string | null;
  storeLat?: number | null;
  storeLng?: number | null;
  hotline: string | null;
  contactEmail: string | null;
  reservationsEnabled: boolean;
  depositEnabled: boolean;
  depositType: "FIXED" | "PER_PERSON";
  depositValue: number;
  holdMinutes: number;
  durationMinutes: number;
  maxDaysAhead: number;
  minNoticeMinutes: number;
  preferenceOptions: ReservationPreferenceOptions;
};

export type ReservationSlot = {
  startsAt: string;
  endsAt: string;
  available: boolean;
  tableCount: number;
  bestTableName: string | null;
  availabilityLevel?: "sold_out" | "low" | "medium" | "high";
  recommendationLabel?: string;
  recommendationReason?: string;
};

export type ReservationPayment = {
  method: "QR";
  url: string;
  amount: number;
  bank: string;
  account: string;
  accountName?: string | null;
  transferContent: string;
};

export type ReservationResult = {
  reservation: ReservationDto;
  token?: string;
  payment: ReservationPayment | null;
  timeline?: ReservationStatusTimelineItem[];
};

export type BookingStep = "time" | "table" | "contact" | "review";
export type ReservationSyncState = "idle" | "syncing" | "live" | "error";

export const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";
const SYNC_INTERVAL_MS = 10_000;
const terminalStatuses = new Set<ReservationDto["status"]>(["completed", "cancelled", "rejected", "expired", "no_show"]);

export function formatInputDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: VN_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function todayInputValue() {
  return formatInputDate(new Date());
}
export function addDaysInputValue(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatInputDate(date);
}
export function nextWeekendInputValue() {
  const date = new Date();
  const day = date.getDay();
  const until = (6 - day + 7) % 7 || 7;
  date.setDate(date.getDate() + until);
  return formatInputDate(date);
}
export function formatSlot(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: VN_TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: VN_TIME_ZONE, weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(`${value}T00:00:00+07:00`));
}
export function formatReservationDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: VN_TIME_ZONE, weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
export function formatTimelineTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: VN_TIME_ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function hourInVietnam(value: string) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: VN_TIME_ZONE, hour: "2-digit", hour12: false }).format(new Date(value)));
}
export function slotPeriod(value: string): "morning" | "afternoon" | "evening" {
  const hour = hourInVietnam(value);
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
function reservationStorageKey(slug: string) {
  return `logivn-reservation:${slug}`;
}
export function countdownLabel(holdExpiresAt?: string | null) {
  if (!holdExpiresAt) return null;
  const seconds = Math.max(0, Math.floor((new Date(holdExpiresAt).getTime() - Date.now()) / 1000));
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}
export function depositAmount(restaurant: RestaurantInfo, partySize: number) {
  if (!restaurant.depositEnabled || restaurant.depositValue <= 0) return 0;
  return restaurant.depositType === "PER_PERSON" ? restaurant.depositValue * partySize : restaurant.depositValue;
}
export function isTerminalReservationStatus(status: ReservationDto["status"]) {
  return terminalStatuses.has(status);
}
export function canCustomerCancel(reservation: ReservationDto) {
  if (!["holding", "confirmed"].includes(reservation.status)) return false;
  if (reservation.depositPaidAmount > 0 || reservation.depositStatus === "paid") return false;
  if (reservation.depositStatus === "waiting_confirm") return false;
  if (reservation.status === "confirmed" && reservation.depositRequiredAmount > 0) return false;
  return true;
}
function isAccessFailureStatus(status?: number) {
  return status === 403 || status === 404 || status === 422;
}

type StoredReservation = { reservationId: string; token: string };

export function ReserveClientV2({ restaurant }: { restaurant: RestaurantInfo }) {
  const [step, setStep] = useState<BookingStep>("time");
  const [date, setDate] = useState(todayInputValue());
  const [partySize, setPartySize] = useState(2);
  const [slots, setSlots] = useState<ReservationSlot[]>([]);
  const [selectedStartsAt, setSelectedStartsAt] = useState("");
  const [preferredTableAreaId, setPreferredTableAreaId] = useState("");
  const [preferredSeatingZone, setPreferredSeatingZone] = useState<ReservationSeatingZone | "">("");
  const [preferredTableKind, setPreferredTableKind] = useState<ReservationTableKind | "">("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [floorTables, setFloorTables] = useState<FloorTable[]>([]);
  const [floorLoading, setFloorLoading] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [autoAssign, setAutoAssign] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReservationResult | null>(null);
  const [syncState, setSyncState] = useState<ReservationSyncState>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [, setClockTick] = useState(0);
  const createIdempotencyRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const selectedSlot = useMemo(() => slots.find((s) => s.startsAt === selectedStartsAt), [slots, selectedStartsAt]);
  const isContactReady = customerName.trim().length >= 2 && customerPhone.trim().length >= 6;

  const bookingDraftFingerprint = useMemo(
    () =>
      JSON.stringify({
        restaurantSlug: restaurant.slug,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim(),
        customerNote: customerNote.trim(),
        partySize,
        selectedStartsAt,
        tableId: autoAssign ? "" : selectedTableId ?? "",
        preferredTableAreaId,
        preferredSeatingZone,
        preferredTableKind
      }),
    [autoAssign, customerEmail, customerName, customerNote, customerPhone, partySize, preferredSeatingZone, preferredTableAreaId, preferredTableKind, restaurant.slug, selectedStartsAt, selectedTableId]
  );

  function getCreateIdempotencyKey() {
    if (!createIdempotencyRef.current || createIdempotencyRef.current.fingerprint !== bookingDraftFingerprint) {
      createIdempotencyRef.current = { fingerprint: bookingDraftFingerprint, key: crypto.randomUUID() };
    }
    return createIdempotencyRef.current.key;
  }
  function clearCreateIdempotencyKey() {
    createIdempotencyRef.current = null;
  }

  const loadSlots = useCallback(
    async (nextDate = date, nextPartySize = partySize) => {
      if (!restaurant.reservationsEnabled) return;
      setLoadingSlots(true);
      setError(null);
      try {
        const params = new URLSearchParams({ date: nextDate, partySize: String(nextPartySize) });
        if (preferredTableAreaId) params.set("preferredTableAreaId", preferredTableAreaId);
        if (preferredSeatingZone) params.set("preferredSeatingZone", preferredSeatingZone);
        if (preferredTableKind) params.set("preferredTableKind", preferredTableKind);
        const response = await fetch(`/api/restaurants/${restaurant.slug}/reservations/availability?${params.toString()}`);
        const json = await response.json();
        if (!json.ok) throw new Error(json.error ?? "Không tải được khung giờ.");
        const nextSlots = (json.data.slots ?? []) as ReservationSlot[];
        setSlots(nextSlots);
        setSelectedStartsAt((current) => {
          if (current && nextSlots.some((s) => s.startsAt === current && s.available)) return current;
          return nextSlots.find((s) => s.available)?.startsAt ?? "";
        });
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Không tải được khung giờ.");
      } finally {
        setLoadingSlots(false);
      }
    },
    [date, partySize, preferredSeatingZone, preferredTableAreaId, preferredTableKind, restaurant.reservationsEnabled, restaurant.slug]
  );

  const loadFloor = useCallback(
    async (startsAt: string, nextPartySize = partySize) => {
      if (!startsAt) return;
      setFloorLoading(true);
      try {
        const params = new URLSearchParams({ date, startsAt, partySize: String(nextPartySize) });
        const response = await fetch(`/api/restaurants/${restaurant.slug}/reservations/floor?${params.toString()}`, { cache: "no-store" });
        const json = await response.json();
        if (!json.ok) throw new Error(json.error ?? "Không tải được sơ đồ bàn.");
        const tables = (json.data.tables ?? []) as FloorTable[];
        setFloorTables(tables);
        // Nếu bàn đang chọn không còn trống → bỏ chọn, quay về để quán tự xếp.
        setSelectedTableId((current) => (current && tables.some((t) => t.id === current && t.available) ? current : null));
        setAutoAssign((current) => current || !tables.some((t) => t.id === selectedTableId && t.available));
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Không tải được sơ đồ bàn.");
        setFloorTables([]);
      } finally {
        setFloorLoading(false);
      }
    },
    [date, partySize, restaurant.slug, selectedTableId]
  );

  const loadStoredReservation = useCallback(
    async (stored: StoredReservation, options: { silent?: boolean; clearOnAccessError?: boolean } = {}) => {
      const silent = options.silent ?? false;
      if (silent) setSyncState("syncing");
      else {
        setRefreshing(true);
        setError(null);
      }
      try {
        const params = new URLSearchParams({ token: stored.token });
        const response = await fetch(`/api/reservations/${stored.reservationId}?${params.toString()}`, { cache: "no-store" });
        const json = (await response.json().catch(() => null)) as { ok?: boolean; data?: Omit<ReservationResult, "token">; error?: string } | null;
        if (!response.ok || !json?.ok || !json.data) {
          const err = new Error(json?.error ?? "Không tải được lịch đặt.") as Error & { status?: number };
          err.status = response.status;
          throw err;
        }
        setResult({ ...json.data, token: stored.token });
        setLastSyncedAt(new Date());
        setSyncState("live");
        return true;
      } catch (loadError) {
        const status = loadError instanceof Error ? (loadError as Error & { status?: number }).status : undefined;
        const shouldClear = isAccessFailureStatus(status);
        if (shouldClear) {
          window.localStorage.removeItem(reservationStorageKey(restaurant.slug));
          if (options.clearOnAccessError ?? true) setResult(null);
        }
        setSyncState("error");
        if (!silent || shouldClear) setError(loadError instanceof Error ? loadError.message : "Không tải được lịch đặt.");
        return false;
      } finally {
        if (!silent) setRefreshing(false);
      }
    },
    [restaurant.slug]
  );

  async function refreshResult() {
    if (!result?.token) return;
    await loadStoredReservation({ reservationId: result.reservation.id, token: result.token }, { clearOnAccessError: true });
  }

  async function submitReservation() {
    if (!selectedStartsAt) {
      setError("Vui lòng chọn khung giờ còn bàn.");
      setStep("time");
      return;
    }
    if (!isContactReady) {
      setError("Vui lòng nhập tên và số điện thoại để quán giữ bàn.");
      setStep("contact");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantSlug: restaurant.slug,
          customerName,
          customerPhone,
          customerEmail,
          partySize,
          startsAt: selectedStartsAt,
          customerNote,
          idempotencyKey: getCreateIdempotencyKey(),
          tableId: autoAssign ? undefined : selectedTableId ?? undefined,
          preferredTableAreaId: preferredTableAreaId || undefined,
          preferredSeatingZone: preferredSeatingZone || undefined,
          preferredTableKind: preferredTableKind || undefined
        })
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tạo được lịch đặt.");
      const nextResult = json.data as ReservationResult;
      setResult(nextResult);
      setLastSyncedAt(new Date());
      setSyncState("live");
      if (nextResult.token) {
        window.localStorage.setItem(reservationStorageKey(restaurant.slug), JSON.stringify({ reservationId: nextResult.reservation.id, token: nextResult.token }));
      }
      clearCreateIdempotencyKey();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không tạo được lịch đặt.");
      // Nếu bàn vừa hết chỗ, quay lại bước chọn bàn để tải lại sơ đồ.
      if (!autoAssign && selectedTableId) {
        setStep("table");
        void loadFloor(selectedStartsAt, partySize);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function markPaid() {
    if (!result?.token) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/reservations/${result.reservation.id}/paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: result.token })
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không cập nhật được trạng thái cọc.");
      setResult({ ...json.data, token: result.token });
      setLastSyncedAt(new Date());
      setSyncState("live");
    } catch (paidError) {
      setError(paidError instanceof Error ? paidError.message : "Không cập nhật được trạng thái cọc.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelReservation() {
    if (!result?.token) return;
    setCancelling(true);
    setError(null);
    try {
      const response = await fetch(`/api/reservations/${result.reservation.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: result.token })
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không huỷ được lịch đặt.");
      setResult({ ...json.data, token: result.token });
      setLastSyncedAt(new Date());
      setSyncState("live");
      setConfirmCancel(false);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Không huỷ được lịch đặt.");
    } finally {
      setCancelling(false);
    }
  }

  function startNew() {
    window.localStorage.removeItem(reservationStorageKey(restaurant.slug));
    clearCreateIdempotencyKey();
    setResult(null);
    setSyncState("idle");
    setLastSyncedAt(null);
    setStep("time");
    setError(null);
    setConfirmCancel(false);
    setSelectedTableId(null);
    setAutoAssign(true);
  }

  function goToStep(next: BookingStep) {
    setError(null);
    if (next === "table") {
      if (!selectedStartsAt) {
        setError("Vui lòng chọn một khung giờ còn bàn.");
        return;
      }
      void loadFloor(selectedStartsAt, partySize);
    }
    if (next === "contact" && !selectedStartsAt) {
      setError("Vui lòng chọn một khung giờ còn bàn.");
      setStep("time");
      return;
    }
    if (next === "review" && !isContactReady) {
      setError("Vui lòng nhập tên và số điện thoại để quán giữ bàn.");
      setStep("contact");
      return;
    }
    setStep(next);
  }

  function handleAgentAction(action: AiAgentAction) {
    const requested = typeof action.body?.action === "string" ? action.body.action : "";
    if (action.uiTarget === "reservation") {
      if (requested === "refresh") return void refreshResult();
      if (requested === "cancel") {
        if (result && canCustomerCancel(result.reservation)) setConfirmCancel(true);
        else if (restaurant.hotline) window.location.href = `tel:${restaurant.hotline}`;
        return;
      }
      if (requested === "new") return startNew();
      setResult(null);
      setStep("time");
      return;
    }
    if (action.uiTarget === "staff_call" && restaurant.hotline) window.location.href = `tel:${restaurant.hotline}`;
  }

  // --- effects ---
  useEffect(() => {
    const timer = window.setTimeout(() => void loadSlots(date, partySize), 0);
    return () => window.clearTimeout(timer);
  }, [date, loadSlots, partySize]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const raw = window.localStorage.getItem(reservationStorageKey(restaurant.slug));
      if (!raw) return;
      try {
        void loadStoredReservation(JSON.parse(raw) as StoredReservation, { clearOnAccessError: true });
      } catch {
        window.localStorage.removeItem(reservationStorageKey(restaurant.slug));
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadStoredReservation, restaurant.slug]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((v) => v + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!result?.token || isTerminalReservationStatus(result.reservation.status) || refreshing || submitting || cancelling || syncState === "syncing") return;
    const stored = { reservationId: result.reservation.id, token: result.token };
    const sync = () => {
      if (document.visibilityState === "hidden") return;
      void loadStoredReservation(stored, { silent: true, clearOnAccessError: true });
    };
    const timer = window.setInterval(sync, SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [cancelling, loadStoredReservation, refreshing, result?.reservation.id, result?.reservation.status, result?.token, submitting, syncState]);

  useEffect(() => {
    if (!result?.token || isTerminalReservationStatus(result.reservation.status)) return;
    const stored = { reservationId: result.reservation.id, token: result.token };
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadStoredReservation(stored, { silent: true, clearOnAccessError: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadStoredReservation, result?.reservation.id, result?.reservation.status, result?.token]);

  const reservationCustomerSessionId = result?.reservation.id ? `reservation-${result.reservation.id}` : `reservation-draft-${restaurant.slug}`;

  return (
    <>
      <ReserveView
        restaurant={restaurant}
        step={step}
        goToStep={goToStep}
        setStep={setStep}
        date={date}
        setDate={(d) => {
          setDate(d);
          setSelectedTableId(null);
          setAutoAssign(true);
        }}
        partySize={partySize}
        setPartySize={(n) => {
          setPartySize(n);
          setSelectedTableId(null);
          setAutoAssign(true);
        }}
        slots={slots}
        loadingSlots={loadingSlots}
        selectedStartsAt={selectedStartsAt}
        setSelectedStartsAt={(s) => {
          setSelectedStartsAt(s);
          setSelectedTableId(null);
          setAutoAssign(true);
        }}
        selectedSlot={selectedSlot}
        preferredTableAreaId={preferredTableAreaId}
        setPreferredTableAreaId={setPreferredTableAreaId}
        preferredSeatingZone={preferredSeatingZone}
        setPreferredSeatingZone={setPreferredSeatingZone}
        preferredTableKind={preferredTableKind}
        setPreferredTableKind={setPreferredTableKind}
        reloadSlots={() => void loadSlots(date, partySize)}
        floorTables={floorTables}
        floorLoading={floorLoading}
        selectedTableId={selectedTableId}
        autoAssign={autoAssign}
        onSelectTable={(id) => {
          setSelectedTableId(id);
          setAutoAssign(false);
        }}
        onAutoAssign={() => {
          setAutoAssign(true);
          setSelectedTableId(null);
        }}
        customerName={customerName}
        setCustomerName={setCustomerName}
        customerPhone={customerPhone}
        setCustomerPhone={setCustomerPhone}
        customerEmail={customerEmail}
        setCustomerEmail={setCustomerEmail}
        customerNote={customerNote}
        setCustomerNote={setCustomerNote}
        isContactReady={isContactReady}
        submitting={submitting}
        refreshing={refreshing}
        cancelling={cancelling}
        confirmCancel={confirmCancel}
        setConfirmCancel={setConfirmCancel}
        error={error}
        result={result}
        syncState={syncState}
        lastSyncedAt={lastSyncedAt}
        submitReservation={submitReservation}
        markPaid={markPaid}
        cancelReservation={cancelReservation}
        refreshResult={refreshResult}
        startNew={startNew}
      />
      <CustomerAiAssistant
        restaurantSlug={restaurant.slug}
        customerSessionId={reservationCustomerSessionId}
        surface="reservation"
        reservationStatus={result ? { id: result.reservation.id, status: result.reservation.status } : { status: "draft", step }}
        onAgentAction={handleAgentAction}
      />
    </>
  );
}

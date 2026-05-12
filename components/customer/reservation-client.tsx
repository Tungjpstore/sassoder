"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Store,
  UserRound,
  UsersRound,
  XCircle
} from "lucide-react";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { CustomerAiAssistant } from "@/components/customer/customer-ai-assistant";
import { RestaurantVisitMapCard } from "@/components/location/restaurant-visit-map-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { formatVnd } from "@/lib/money";
import { cn } from "@/lib/utils";
import { reservationDepositStatusLabel, reservationStatusLabel } from "@/lib/labels";
import type { AiAgentAction } from "@/types/ai-agent";
import type { ReservationDto } from "@/types/domain";

type ReservationSlot = {
  startsAt: string;
  endsAt: string;
  available: boolean;
  tableCount: number;
  bestTableName: string | null;
  availabilityLevel?: "sold_out" | "low" | "medium" | "high";
  recommendationLabel?: string;
  recommendationReason?: string;
};

type ReservationPayment = {
  method: "QR";
  url: string;
  amount: number;
  bank: string;
  account: string;
  accountName?: string | null;
  transferContent: string;
};

type ReservationResult = {
  reservation: ReservationDto;
  token?: string;
  payment: ReservationPayment | null;
};

type RestaurantInfo = {
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
};

type StoredReservation = {
  reservationId: string;
  token: string;
};

type BookingStep = "time" | "contact" | "review";

const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";
const bookingSteps: Array<{ id: BookingStep; label: string }> = [
  { id: "time", label: "Chọn giờ" },
  { id: "contact", label: "Thông tin" },
  { id: "review", label: "Xác nhận" }
];

function formatInputDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function todayInputValue() {
  return formatInputDate(new Date());
}

function addDaysInputValue(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatInputDate(date);
}

function nextWeekendInputValue() {
  const date = new Date();
  const day = date.getDay();
  const daysUntilSaturday = (6 - day + 7) % 7 || 7;
  date.setDate(date.getDate() + daysUntilSaturday);
  return formatInputDate(date);
}

function formatSlot(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: VN_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: VN_TIME_ZONE,
    weekday: "short",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function formatReservationDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: VN_TIME_ZONE,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function hourInVietnam(value: string) {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: VN_TIME_ZONE,
    hour: "2-digit",
    hour12: false
  }).format(new Date(value));
  return Number(hour);
}

function slotPeriod(value: string): "morning" | "afternoon" | "evening" {
  const hour = hourInVietnam(value);
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function reservationStorageKey(slug: string) {
  return `logivn-reservation:${slug}`;
}

function countdownLabel(holdExpiresAt?: string | null) {
  if (!holdExpiresAt) return null;
  const seconds = Math.max(0, Math.floor((new Date(holdExpiresAt).getTime() - Date.now()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return `${minutes}:${remainSeconds.toString().padStart(2, "0")}`;
}

function depositAmount(restaurant: RestaurantInfo, partySize: number) {
  if (!restaurant.depositEnabled || restaurant.depositValue <= 0) return 0;
  return restaurant.depositType === "PER_PERSON" ? restaurant.depositValue * partySize : restaurant.depositValue;
}

function depositDescription(restaurant: RestaurantInfo, partySize: number) {
  const amount = depositAmount(restaurant, partySize);
  if (amount <= 0) return "Không cần cọc, quán xác nhận bàn ngay sau khi đặt.";
  return `Cọc giữ bàn ${formatVnd(amount)}${restaurant.depositType === "PER_PERSON" ? ` cho ${partySize} khách` : ""}.`;
}

function resultTone(status: ReservationDto["status"]): "green" | "yellow" | "blue" | "red" | "neutral" {
  if (status === "confirmed" || status === "seated" || status === "completed") return "green";
  if (status === "holding" || status === "waiting_deposit_confirm") return "yellow";
  if (status === "cancelled" || status === "expired" || status === "no_show") return "red";
  return "neutral";
}

function resultHeroTitle(status: ReservationDto["status"]) {
  if (status === "confirmed") return "Đặt bàn thành công!";
  if (status === "cancelled") return "Lịch đặt đã huỷ";
  if (status === "expired") return "Lịch giữ bàn đã hết hạn";
  if (status === "no_show") return "Lịch đã đánh dấu không đến";
  if (status === "completed") return "Cảm ơn bạn đã ghé quán";
  return "Đã giữ bàn cho bạn";
}

function hasActiveHold(status: ReservationDto["status"]) {
  return status === "holding" || status === "waiting_deposit_confirm";
}

function slotTone(slot: ReservationSlot) {
  if (!slot.available) return { label: "Hết bàn", tone: "red" as const };
  if (slot.recommendationLabel) {
    return {
      label: slot.recommendationLabel,
      tone: slot.availabilityLevel === "high" ? "green" as const : slot.availabilityLevel === "low" ? "yellow" as const : "blue" as const
    };
  }
  if (slot.tableCount <= 1) return { label: "Sắp hết", tone: "yellow" as const };
  if (slot.tableCount >= 4) return { label: "Rộng chỗ", tone: "green" as const };
  return { label: "Còn bàn", tone: "blue" as const };
}

function canCustomerCancel(reservation: ReservationDto) {
  if (!["holding", "confirmed"].includes(reservation.status)) return false;
  if (reservation.depositPaidAmount > 0 || reservation.depositStatus === "paid") return false;
  if (reservation.depositStatus === "waiting_confirm") return false;
  if (reservation.status === "confirmed" && reservation.depositRequiredAmount > 0) return false;
  return true;
}

function ReservationTimeline({ reservation }: { reservation: ReservationDto }) {
  const current = reservation.status;
  const steps = [
    { id: "holding", label: reservation.depositRequiredAmount > 0 ? "Giữ bàn" : "Đã đặt" },
    { id: "waiting_deposit_confirm", label: "Chờ cọc" },
    { id: "confirmed", label: "Quán xác nhận" },
    { id: "seated", label: "Đến quán" }
  ];
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === current)
  );
  const isClosed = ["cancelled", "expired", "no_show", "completed"].includes(current);

  return (
    <div className="rounded-3xl border border-[rgba(15,77,58,0.12)] bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        {steps.map((step, index) => {
          const done = !isClosed && index <= activeIndex;
          return (
            <div key={step.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <span
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-full border text-xs font-black",
                  done
                    ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                    : "border-[rgba(15,77,58,0.14)] bg-[#F6F2E8] text-[var(--muted-foreground)]"
                )}
              >
                {done ? <CheckCircle2 size={15} /> : index + 1}
              </span>
              <span className={cn("text-center text-[11px] font-bold leading-tight", done ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]")}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ReservationClient({ restaurant }: { restaurant: RestaurantInfo }) {
  const [step, setStep] = useState<BookingStep>("time");
  const [date, setDate] = useState(todayInputValue());
  const [partySize, setPartySize] = useState(2);
  const [slots, setSlots] = useState<ReservationSlot[]>([]);
  const [selectedStartsAt, setSelectedStartsAt] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReservationResult | null>(null);
  const [, setClockTick] = useState(0);

  const selectedSlot = useMemo(() => slots.find((slot) => slot.startsAt === selectedStartsAt), [slots, selectedStartsAt]);
  const holdCountdown = countdownLabel(result?.reservation.holdExpiresAt);
  const canMarkPaid = result?.reservation.status === "holding" && result.reservation.depositStatus === "waiting_payment";
  const isWaitingDepositApproval = result?.reservation.status === "waiting_deposit_confirm" && result.reservation.depositStatus === "waiting_confirm";
  const canCancelResult = result ? canCustomerCancel(result.reservation) : false;
  const isContactReady = customerName.trim().length >= 2 && customerPhone.trim().length >= 6;
  const stepIndex = bookingSteps.findIndex((item) => item.id === step);

  const groupedSlots = useMemo(() => {
    return [
      { id: "morning", label: "Buổi sáng", slots: slots.filter((slot) => slotPeriod(slot.startsAt) === "morning") },
      { id: "afternoon", label: "Buổi chiều", slots: slots.filter((slot) => slotPeriod(slot.startsAt) === "afternoon") },
      { id: "evening", label: "Buổi tối", slots: slots.filter((slot) => slotPeriod(slot.startsAt) === "evening") }
    ].filter((group) => group.slots.length > 0);
  }, [slots]);

  const quickDates = useMemo(
    () => [
      { label: "Hôm nay", value: todayInputValue(), hint: "Nhanh nhất" },
      { label: "Ngày mai", value: addDaysInputValue(1), hint: "Dễ có bàn" },
      { label: "Cuối tuần", value: nextWeekendInputValue(), hint: "Đi nhóm" }
    ],
    []
  );

  const loadSlots = useCallback(async (nextDate = date, nextPartySize = partySize) => {
    if (!restaurant.reservationsEnabled) return;
    setLoadingSlots(true);
    setError(null);
    try {
      const params = new URLSearchParams({ date: nextDate, partySize: String(nextPartySize) });
      const response = await fetch(`/api/restaurants/${restaurant.slug}/reservations/availability?${params.toString()}`);
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tải được khung giờ.");
      const nextSlots = (json.data.slots ?? []) as ReservationSlot[];
      setSlots(nextSlots);
      setSelectedStartsAt(nextSlots.find((slot) => slot.available)?.startsAt ?? "");
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Không tải được khung giờ.");
    } finally {
      setLoadingSlots(false);
    }
  }, [date, partySize, restaurant.reservationsEnabled, restaurant.slug]);

  const loadStoredReservation = useCallback(async (stored: StoredReservation) => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams({ token: stored.token });
      const response = await fetch(`/api/reservations/${stored.reservationId}?${params.toString()}`);
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tải được lịch đặt.");
      setResult({ ...json.data, token: stored.token });
    } catch {
      window.localStorage.removeItem(reservationStorageKey(restaurant.slug));
    } finally {
      setRefreshing(false);
    }
  }, [restaurant.slug]);

  async function refreshResult() {
    if (!result?.token) return;
    await loadStoredReservation({ reservationId: result.reservation.id, token: result.token });
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
          idempotencyKey: crypto.randomUUID()
        })
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tạo được lịch đặt.");
      const nextResult = json.data as ReservationResult;
      setResult(nextResult);
      if (nextResult.token) {
        window.localStorage.setItem(reservationStorageKey(restaurant.slug), JSON.stringify({ reservationId: nextResult.reservation.id, token: nextResult.token }));
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không tạo được lịch đặt.");
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
      setConfirmCancel(false);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Không huỷ được lịch đặt.");
    } finally {
      setCancelling(false);
    }
  }

  function startNew() {
    window.localStorage.removeItem(reservationStorageKey(restaurant.slug));
    setResult(null);
    setStep("time");
    setError(null);
    setConfirmCancel(false);
  }

  function goBack() {
    setError(null);
    if (step === "review") setStep("contact");
    if (step === "contact") setStep("time");
  }

  function handleReservationAgentAction(action: AiAgentAction) {
    const requestedAction = typeof action.body?.action === "string" ? action.body.action : "";

    if (action.uiTarget === "reservation") {
      if (requestedAction === "refresh") {
        void refreshResult();
        return;
      }
      if (requestedAction === "cancel") {
        if (canCancelResult) {
          setConfirmCancel(true);
        } else if (restaurant.hotline) {
          window.location.href = `tel:${restaurant.hotline}`;
        }
        return;
      }
      if (requestedAction === "new") {
        startNew();
        return;
      }
      setResult(null);
      setStep("time");
      setError(null);
      return;
    }

    if (action.uiTarget === "staff_call" && restaurant.hotline) {
      window.location.href = `tel:${restaurant.hotline}`;
    }
  }

  function runPrimaryAction() {
    setError(null);
    if (step === "time") {
      if (!selectedStartsAt) {
        setError("Vui lòng chọn một khung giờ còn bàn.");
        return;
      }
      setStep("contact");
      return;
    }
    if (step === "contact") {
      if (!isContactReady) {
        setError("Vui lòng nhập tên và số điện thoại để quán giữ bàn.");
        return;
      }
      setStep("review");
      return;
    }
    void submitReservation();
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSlots(date, partySize), 0);
    return () => window.clearTimeout(timer);
  }, [date, loadSlots, partySize]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const raw = window.localStorage.getItem(reservationStorageKey(restaurant.slug));
      if (!raw) return;
      try {
        void loadStoredReservation(JSON.parse(raw) as StoredReservation);
      } catch {
        window.localStorage.removeItem(reservationStorageKey(restaurant.slug));
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadStoredReservation, restaurant.slug]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const primaryLabel = step === "time" ? "Tiếp tục" : step === "contact" ? "Xem lại đặt bàn" : submitting ? "Đang giữ bàn..." : "Giữ bàn ngay";
  const primaryDisabled =
    !restaurant.reservationsEnabled ||
    submitting ||
    loadingSlots ||
    (step === "time" && !selectedStartsAt) ||
    (step === "contact" && !isContactReady);
  const reservationAiStatus = useMemo(() => {
    if (result) {
      return {
        id: result.reservation.id,
        status: result.reservation.status,
        partySize: result.reservation.partySize,
        startsAt: result.reservation.startsAt,
        endsAt: result.reservation.endsAt,
        holdExpiresAt: result.reservation.holdExpiresAt,
        depositRequiredAmount: result.reservation.depositRequiredAmount,
        depositPaidAmount: result.reservation.depositPaidAmount,
        depositStatus: result.reservation.depositStatus,
        paymentMethod: result.reservation.paymentMethod,
        confirmedAt: result.reservation.confirmedAt,
        seatedAt: result.reservation.seatedAt,
        cancelledAt: result.reservation.cancelledAt,
        expiredAt: result.reservation.expiredAt,
        tableCount: result.reservation.tables.length,
        tableName: result.reservation.tables[0]?.name ?? null,
        hasPaymentQr: Boolean(result.payment),
        tokenPresent: Boolean(result.token),
        canCancel: canCancelResult
      };
    }

    return {
      status: "draft",
      reservationsEnabled: restaurant.reservationsEnabled,
      date,
      partySize,
      selectedStartsAt: selectedStartsAt || null,
      selectedSlotLabel: selectedSlot ? formatSlot(selectedSlot.startsAt) : null,
      depositRequiredAmount: depositAmount(restaurant, partySize),
      holdMinutes: restaurant.holdMinutes,
      step
    };
  }, [canCancelResult, date, partySize, restaurant, result, selectedSlot, selectedStartsAt, step]);
  const reservationCustomerSessionId = result?.reservation.id ? `reservation-${result.reservation.id}` : `reservation-draft-${restaurant.slug}`;

  if (result) {
    return (
      <main className="min-h-screen bg-[#FFF7EB] text-[var(--foreground)]">
        <section className="mx-auto grid min-h-screen max-w-6xl gap-6 px-0 sm:px-4 lg:grid-cols-[440px_minmax(0,1fr)] lg:py-8">
          <div className="relative min-h-screen overflow-hidden bg-white shadow-[0_24px_70px_rgba(15,77,58,0.12)] sm:min-h-[760px] sm:rounded-[2rem] sm:border sm:border-[rgba(15,77,58,0.12)]">
            <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_20%_10%,rgba(242,140,40,0.16),transparent_32%),linear-gradient(135deg,#004C36,#0F6A4B)]" />
            <div className="relative z-10 px-5 pb-28 pt-4">
              <header className="flex items-center justify-between gap-3 text-white">
                <button type="button" onClick={startNew} className="grid h-10 w-10 place-items-center rounded-full bg-white/12 backdrop-blur" aria-label="Tạo đặt bàn mới">
                  <ArrowLeft size={18} />
                </button>
                <p className="text-sm font-black">Lịch đặt của bạn</p>
                {restaurant.hotline ? (
                  <a href={`tel:${restaurant.hotline}`} className="grid h-10 w-10 place-items-center rounded-full bg-white/12 backdrop-blur" aria-label="Gọi quán">
                    <Phone size={18} />
                  </a>
                ) : (
                  <span className="h-10 w-10" />
                )}
              </header>

              <section className="pt-10 text-center text-white">
                <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-white text-[var(--primary)] shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
                  {result.reservation.status === "cancelled" || result.reservation.status === "expired" || result.reservation.status === "no_show" ? <XCircle size={46} /> : <CheckCircle2 size={46} />}
                </div>
                <h1 className="mt-5 text-3xl font-black tracking-tight">{resultHeroTitle(result.reservation.status)}</h1>
                <p className="mt-2 text-sm font-semibold text-white/80">{restaurant.name}</p>
              </section>

              <section className="mt-8 rounded-[1.75rem] border border-[rgba(15,77,58,0.10)] bg-white p-4 shadow-[0_18px_55px_rgba(15,77,58,0.10)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Mã đặt bàn</p>
                    <h2 className="mt-1 text-xl font-black text-[var(--foreground)]">#{result.reservation.id.slice(0, 8).toUpperCase()}</h2>
                  </div>
                  <Badge tone={resultTone(result.reservation.status)}>{reservationStatusLabel(result.reservation.status)}</Badge>
                </div>
                <div className="mt-4 grid gap-3 rounded-2xl bg-[#F7F2E8] p-4 text-sm font-bold">
                  <p className="flex items-center gap-2">
                    <CalendarClock size={16} className="text-[var(--primary)]" />
                    {formatReservationDate(result.reservation.startsAt)}
                  </p>
                  <p className="flex items-center gap-2">
                    <UsersRound size={16} className="text-[var(--primary)]" />
                    {result.reservation.partySize} khách · {result.reservation.tables[0]?.name ?? "Quán tự chọn bàn phù hợp"}
                  </p>
                  <p className="flex items-center gap-2">
                    <CreditCard size={16} className="text-[var(--primary)]" />
                    Cọc: {reservationDepositStatusLabel(result.reservation.depositStatus)}
                  </p>
                </div>
                {holdCountdown && hasActiveHold(result.reservation.status) ? (
                  <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--warning-soft)] px-3 py-2 text-xs font-black text-[var(--accent-strong)]">
                    <Clock3 size={14} />
                    {isWaitingDepositApproval ? `Quán đang giữ bàn thêm ${holdCountdown} để xác nhận cọc` : `Còn ${holdCountdown} để chuyển cọc`}
                  </p>
                ) : null}
              </section>

              <div className="mt-4">
                <ReservationTimeline reservation={result.reservation} />
              </div>

              {result.payment ? (
                <section className="mt-4 rounded-[1.75rem] border border-[rgba(15,77,58,0.12)] bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-[var(--primary)]">Chuyển cọc VietQR</p>
                      <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">Quán sẽ xác nhận sau khi nhận giao dịch.</p>
                    </div>
                    <Badge tone="yellow">{formatVnd(result.payment.amount)}</Badge>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.payment.url} alt="QR đặt cọc giữ bàn" className="mx-auto mt-4 h-64 w-64 rounded-3xl border border-[var(--border)] bg-white object-contain p-3" />
                  <div className="mt-4 grid gap-2 rounded-2xl bg-[#F7F2E8] p-3 text-sm font-bold">
                    <p>Ngân hàng: {result.payment.bank}</p>
                    <p>STK: {result.payment.account}</p>
                    <p>Nội dung: <span className="text-[var(--primary)]">{result.payment.transferContent}</span></p>
                  </div>
                  {isWaitingDepositApproval ? (
                    <p className="mt-4 rounded-2xl bg-[var(--primary-soft)] p-3 text-sm font-bold text-[var(--primary)]">
                      Đã ghi nhận bạn chuyển cọc. Quán đang kiểm tra giao dịch.
                    </p>
                  ) : null}
                </section>
              ) : (
                <section className="mt-4 rounded-[1.75rem] border border-[rgba(15,77,58,0.12)] bg-white p-4 text-sm font-bold text-[var(--muted-foreground)]">
                  <ShieldCheck className="mb-2 text-[var(--primary)]" size={22} />
                  Quán không yêu cầu cọc cho lịch này. Bạn chỉ cần đến đúng giờ hoặc gọi quán nếu cần đổi lịch.
                </section>
              )}

              <section className="mt-4 rounded-[1.75rem] border border-[rgba(15,77,58,0.12)] bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#F7F2E8] text-[var(--primary)]">
                    <XCircle size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-black text-[var(--foreground)]">Cần thay đổi lịch?</h2>
                    {canCancelResult ? (
                      <p className="mt-1 text-sm font-bold leading-6 text-[var(--muted-foreground)]">
                        Bạn có thể tự huỷ lịch này vì chưa có cọc đã xác nhận. Bàn sẽ được mở lại cho khách khác ngay lập tức.
                      </p>
                    ) : (
                      <p className="mt-1 text-sm font-bold leading-6 text-[var(--muted-foreground)]">
                        Nếu lịch đã có cọc hoặc quán đang kiểm tra giao dịch, hãy gọi quán để được hỗ trợ đổi/hủy an toàn.
                      </p>
                    )}
                  </div>
                </div>

                {canCancelResult ? (
                  confirmCancel ? (
                    <div className="mt-4 rounded-2xl border border-[rgba(197,48,48,0.18)] bg-[var(--danger-soft)] p-3">
                      <p className="text-sm font-black text-[var(--accent-strong)]">Xác nhận huỷ lịch đặt này?</p>
                      <p className="mt-1 text-xs font-bold leading-5 text-[var(--muted-foreground)]">Sau khi huỷ, quán sẽ không giữ bàn cho khung giờ này nữa.</p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button type="button" variant="danger" onClick={cancelReservation} disabled={cancelling}>
                          {cancelling ? <Loader2 className="animate-spin" size={16} /> : <XCircle size={16} />}
                          Huỷ bàn
                        </Button>
                        <Button type="button" variant="secondary" onClick={() => setConfirmCancel(false)} disabled={cancelling}>
                          Giữ lại
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button type="button" variant="secondary" className="mt-4 w-full" onClick={() => setConfirmCancel(true)}>
                      <XCircle size={16} />
                      Huỷ lịch đặt này
                    </Button>
                  )
                ) : restaurant.hotline ? (
                  <a href={`tel:${restaurant.hotline}`} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--primary)] bg-[var(--primary-soft)] px-4 text-sm font-black text-[var(--primary)]">
                    <Phone size={16} />
                    Gọi quán hỗ trợ
                  </a>
                ) : null}
              </section>

              {error ? <p className="mt-4 rounded-2xl bg-[var(--danger-soft)] p-3 text-sm font-bold text-[var(--accent-strong)]">{error}</p> : null}
            </div>

            <div className="absolute inset-x-0 bottom-0 z-20 border-t border-[rgba(15,77,58,0.12)] bg-white/95 p-4 backdrop-blur">
              <div className="grid gap-2">
                {canMarkPaid ? (
                  <Button className="w-full bg-[var(--primary)] text-white shadow-[0_16px_34px_rgba(15,77,58,0.22)] hover:bg-[var(--primary-strong)]" onClick={markPaid} disabled={submitting}>
                    {submitting ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                    Tôi đã chuyển cọc
                  </Button>
                ) : (
                  <Button className="w-full bg-[var(--primary)] text-white shadow-[0_16px_34px_rgba(15,77,58,0.22)] hover:bg-[var(--primary-strong)]" onClick={refreshResult} disabled={refreshing}>
                    {refreshing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                    Cập nhật trạng thái
                  </Button>
                )}
                <Button variant="secondary" className="w-full" onClick={startNew}>
                  <CalendarDays size={16} />
                  Đặt thêm lịch khác
                </Button>
              </div>
            </div>
          </div>

          <aside className="hidden lg:grid lg:content-start lg:gap-4 lg:py-8">
            <RestaurantVisitMapCard
              restaurant={restaurant}
              title="Đường đến quán"
              description="Khách có thể kiểm tra nhanh khoảng cách và mở chỉ đường trước giờ đến."
            />
            <section className="rounded-[2rem] border border-[rgba(15,77,58,0.12)] bg-white p-6">
              <h2 className="text-xl font-black text-[var(--primary)]">Trải nghiệm sau khi đặt</h2>
              <div className="mt-4 grid gap-3 text-sm font-bold text-[var(--muted-foreground)]">
                <p>Thông tin lịch đặt được giữ an toàn trên thiết bị để khách xem lại bất cứ lúc nào.</p>
                <p>Chủ quán nhận cập nhật tức thời để xác nhận cọc, nhận khách vào bàn hoặc xử lý lịch không đến.</p>
              </div>
            </section>
          </aside>
        </section>
        <CustomerAiAssistant
          restaurantSlug={restaurant.slug}
          customerSessionId={reservationCustomerSessionId}
          surface="reservation"
          reservationStatus={reservationAiStatus}
          onAgentAction={handleReservationAgentAction}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FFF7EB] text-[var(--foreground)]">
      <section className="mx-auto grid min-h-screen max-w-6xl gap-6 px-0 sm:px-4 lg:grid-cols-[440px_minmax(0,1fr)] lg:py-8">
        <div className="relative min-h-screen overflow-hidden bg-white shadow-[0_24px_70px_rgba(15,77,58,0.12)] sm:min-h-[760px] sm:rounded-[2rem] sm:border sm:border-[rgba(15,77,58,0.12)]">
          <div className="absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_16%_16%,rgba(242,140,40,0.18),transparent_34%),linear-gradient(135deg,#FFF7EB_0%,#F7F0E2_46%,#E8F2E7_100%)]" />
          <div className="relative z-10 px-5 pb-28 pt-4">
            <header className="flex items-center justify-between gap-3">
              {step !== "time" ? (
                <button type="button" onClick={goBack} className="grid h-10 w-10 place-items-center rounded-full border border-[rgba(15,77,58,0.12)] bg-white text-[var(--primary)] shadow-sm" aria-label="Quay lại">
                  <ArrowLeft size={18} />
                </button>
              ) : (
                <div className="grid h-10 w-10 place-items-center rounded-full border border-[rgba(15,77,58,0.12)] bg-white text-[var(--primary)] shadow-sm">
                  <Store size={17} />
                </div>
              )}
              <div className="min-w-0 flex-1 text-center">
                <p className="truncate text-sm font-black text-[var(--foreground)]">{restaurant.name}</p>
                <p className="mt-0.5 text-xs font-bold text-[var(--muted-foreground)]">Đặt bàn online</p>
              </div>
              {restaurant.hotline ? (
                <a href={`tel:${restaurant.hotline}`} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--primary)] text-white shadow-[0_12px_26px_rgba(15,77,58,0.24)]" aria-label="Gọi quán">
                  <Phone size={18} />
                </a>
              ) : (
                <span className="h-10 w-10" />
              )}
            </header>

            <section className="mt-5 rounded-[1.75rem] border border-[rgba(15,77,58,0.10)] bg-white/80 p-5 shadow-[0_18px_55px_rgba(15,77,58,0.08)] backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge tone={restaurant.reservationsEnabled ? "green" : "yellow"}>{restaurant.reservationsEnabled ? "Đang nhận bàn" : "Tạm tắt đặt bàn"}</Badge>
                  <h1 className="mt-3 text-3xl font-black tracking-tight text-[var(--primary)]">Giữ bàn trước, đến là có chỗ</h1>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[var(--muted-foreground)]">
                    Chọn giờ còn bàn, để lại số điện thoại và theo dõi trạng thái ngay trên màn hình này.
                  </p>
                </div>
                <div className="hidden h-16 w-16 shrink-0 place-items-center rounded-3xl bg-[var(--primary)] text-white sm:grid">
                  <CalendarCheck2 size={30} />
                </div>
              </div>
              {restaurant.address ? (
                <p className="mt-4 flex items-start gap-2 rounded-2xl bg-[#F7F2E8] p-3 text-xs font-bold leading-5 text-[var(--foreground)]">
                  <MapPin size={15} className="mt-0.5 shrink-0 text-[var(--primary)]" />
                  {restaurant.address}
                </p>
              ) : null}
            </section>

            <nav className="mt-4 grid grid-cols-3 gap-2">
              {bookingSteps.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (index < stepIndex) setStep(item.id);
                  }}
                  className={cn(
                    "rounded-2xl border px-2 py-3 text-center text-xs font-black transition",
                    item.id === step
                      ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                      : index < stepIndex
                        ? "border-[rgba(15,77,58,0.18)] bg-[var(--primary-soft)] text-[var(--primary)]"
                        : "border-[rgba(15,77,58,0.10)] bg-white text-[var(--muted-foreground)]"
                  )}
                >
                  <span className="mx-auto mb-1 grid h-6 w-6 place-items-center rounded-full bg-white/20 text-[11px]">{index + 1}</span>
                  {item.label}
                </button>
              ))}
            </nav>

            {!restaurant.reservationsEnabled ? (
              <section className="mt-4 rounded-[1.75rem] border border-dashed border-[rgba(15,77,58,0.2)] bg-white p-6 text-center">
                <CalendarClock className="mx-auto text-[var(--primary)]" size={34} />
                <h2 className="mt-3 text-xl font-black">Quán chưa bật đặt bàn trước</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-[var(--muted-foreground)]">Bạn vẫn có thể gọi trực tiếp cho quán để được hỗ trợ giữ chỗ.</p>
              </section>
            ) : null}

            {restaurant.reservationsEnabled && step === "time" ? (
              <section className="mt-4 grid gap-4">
                <div className="rounded-[1.75rem] border border-[rgba(15,77,58,0.12)] bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-black">Bạn muốn đến khi nào?</h2>
                      <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">LogiVN tự chọn giờ trống đầu tiên để bạn thao tác nhanh hơn.</p>
                    </div>
                    {loadingSlots ? <Loader2 className="animate-spin text-[var(--primary)]" size={18} /> : null}
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {quickDates.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => setDate(item.value)}
                        className={cn(
                          "rounded-2xl border p-3 text-left transition",
                          date === item.value ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[rgba(15,77,58,0.12)] bg-[#F7F2E8] text-[var(--foreground)]"
                        )}
                      >
                        <span className="block text-sm font-black">{item.label}</span>
                        <span className="mt-1 block text-[11px] font-bold opacity-75">{item.hint}</span>
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                      Ngày đến
                      <Input
                        type="date"
                        value={date}
                        min={todayInputValue()}
                        max={addDaysInputValue(restaurant.maxDaysAhead)}
                        onChange={(event) => setDate(event.target.value)}
                      />
                    </label>
                    <div className="grid gap-2">
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Số khách</p>
                      <div className="grid grid-cols-4 gap-2">
                        {[2, 4, 6, 8].map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setPartySize(value)}
                            className={cn(
                              "h-11 rounded-xl border text-sm font-black transition",
                              partySize === value ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[rgba(15,77,58,0.12)] bg-white text-[var(--foreground)]"
                            )}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={partySize}
                        onChange={(event) => setPartySize(Number(event.target.value))}
                        aria-label="Nhập số khách khác"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-[rgba(15,77,58,0.12)] bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-black">Khung giờ còn bàn</h2>
                    <Badge tone={selectedSlot ? "green" : "yellow"}>{selectedSlot ? "Đã chọn" : "Chọn giờ"}</Badge>
                  </div>
                  <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">{formatShortDate(date)} · {partySize} khách · {depositDescription(restaurant, partySize)}</p>

                  {groupedSlots.length === 0 && !loadingSlots ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-[#F7F2E8] p-5 text-center text-sm font-bold text-[var(--muted-foreground)]">
                      Chưa có khung giờ phù hợp. Hãy thử ngày khác hoặc giảm số khách.
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-4">
                    {groupedSlots.map((group) => (
                      <div key={group.id}>
                        <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--muted-foreground)]">{group.label}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {group.slots.map((slot) => {
                            const tone = slotTone(slot);
                            const selected = selectedStartsAt === slot.startsAt;
                            return (
                              <button
                                key={slot.startsAt}
                                type="button"
                                disabled={!slot.available}
                                onClick={() => setSelectedStartsAt(slot.startsAt)}
                                className={cn(
                                  "rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45",
                                  selected ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-[0_14px_30px_rgba(15,77,58,0.22)]" : "border-[rgba(15,77,58,0.12)] bg-[#F7F2E8] text-[var(--foreground)]"
                                )}
                              >
                                <span className="block text-lg font-black">{formatSlot(slot.startsAt)}</span>
                                <span className="mt-1 block text-xs font-bold opacity-80">{slot.bestTableName ?? `${slot.tableCount} bàn phù hợp`}</span>
                                {slot.recommendationReason ? <span className="mt-1 block text-[11px] font-bold leading-4 opacity-70">{slot.recommendationReason}</span> : null}
                                <span className={cn("mt-3 inline-flex rounded-full px-2 py-1 text-[11px] font-black", selected ? "bg-white/20 text-white" : tone.tone === "green" ? "bg-[var(--primary-soft)] text-[var(--primary)]" : tone.tone === "yellow" ? "bg-[var(--warning-soft)] text-[var(--accent-strong)]" : "bg-white text-[var(--muted-foreground)]")}>
                                  {tone.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {restaurant.reservationsEnabled && step === "contact" ? (
              <section className="mt-4 rounded-[1.75rem] border border-[rgba(15,77,58,0.12)] bg-white p-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
                    <UserRound size={22} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black">Thông tin để quán giữ bàn</h2>
                    <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">Chỉ cần tên và số điện thoại. Email là tuỳ chọn.</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <label className="grid gap-2 text-sm font-black">
                    Tên khách
                    <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="VD: Anh Minh" autoComplete="name" />
                  </label>
                  <label className="grid gap-2 text-sm font-black">
                    Số điện thoại
                    <Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="090..." autoComplete="tel" inputMode="tel" />
                  </label>
                  <label className="grid gap-2 text-sm font-black">
                    Email nhận thông tin
                    <Input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="email@..." autoComplete="email" />
                  </label>
                  <label className="grid gap-2 text-sm font-black">
                    Ghi chú cho quán
                    <Textarea value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} placeholder="VD: Có trẻ em, cần ghế gần cửa sổ..." />
                  </label>
                </div>
              </section>
            ) : null}

            {restaurant.reservationsEnabled && step === "review" ? (
              <section className="mt-4 grid gap-4">
                <div className="rounded-[1.75rem] border border-[rgba(15,77,58,0.12)] bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-black">Kiểm tra lại lịch đặt</h2>
                      <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">Bàn sẽ được giữ ngay sau khi bạn xác nhận.</p>
                    </div>
                    <Sparkles className="text-[var(--accent)]" size={22} />
                  </div>
                  <div className="mt-4 grid gap-3">
                    <div className="rounded-2xl bg-[#F7F2E8] p-4">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Thời gian</p>
                      <p className="mt-1 text-lg font-black">{selectedSlot ? formatReservationDate(selectedSlot.startsAt) : "Chưa chọn giờ"}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-[#F7F2E8] p-4">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Số khách</p>
                        <p className="mt-1 text-lg font-black">{partySize}</p>
                      </div>
                      <div className="rounded-2xl bg-[#F7F2E8] p-4">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Cọc</p>
                        <p className="mt-1 text-lg font-black">{depositAmount(restaurant, partySize) > 0 ? formatVnd(depositAmount(restaurant, partySize)) : "Không cọc"}</p>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-[#F7F2E8] p-4">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Khách đặt</p>
                      <p className="mt-1 text-lg font-black">{customerName}</p>
                      <p className="mt-1 text-sm font-bold text-[var(--muted-foreground)]">{customerPhone}{customerEmail ? ` · ${customerEmail}` : ""}</p>
                    </div>
                    {customerNote ? (
                      <div className="rounded-2xl bg-[#F7F2E8] p-4">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Ghi chú</p>
                        <p className="mt-1 text-sm font-bold leading-6">{customerNote}</p>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-[rgba(15,77,58,0.12)] bg-[var(--primary-soft)] p-4 text-sm font-bold leading-6 text-[var(--primary)]">
                  <ShieldCheck className="mb-2" size={22} />
                  {depositAmount(restaurant, partySize) > 0
                    ? `Sau khi giữ bàn, bạn có ${restaurant.holdMinutes} phút để chuyển cọc VietQR. Nếu quá hạn, bàn sẽ tự mở lại cho khách khác.`
                    : "Lịch này không yêu cầu cọc. Quán sẽ nhận thông tin và giữ bàn theo thời gian bạn chọn."}
                </div>
              </section>
            ) : null}

            {error ? <p className="mt-4 rounded-2xl bg-[var(--danger-soft)] p-3 text-sm font-bold text-[var(--accent-strong)]">{error}</p> : null}
          </div>

          <div className="absolute inset-x-0 bottom-0 z-20 border-t border-[rgba(15,77,58,0.12)] bg-white/95 p-4 backdrop-blur">
            <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-[#F7F2E8] px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{selectedSlot ? formatSlot(selectedSlot.startsAt) : "Chưa chọn giờ"} · {partySize} khách</p>
                <p className="truncate text-xs font-bold text-[var(--muted-foreground)]">{depositDescription(restaurant, partySize)}</p>
              </div>
              <ChevronRight className="shrink-0 text-[var(--primary)]" size={18} />
            </div>
            <Button className="w-full bg-[var(--primary)] text-white shadow-[0_16px_34px_rgba(15,77,58,0.22)] hover:bg-[var(--primary-strong)]" onClick={runPrimaryAction} disabled={primaryDisabled}>
              {submitting ? <Loader2 className="animate-spin" size={16} /> : step === "review" ? <CalendarCheck2 size={16} /> : <ChevronRight size={16} />}
              {primaryLabel}
            </Button>
          </div>
        </div>

        <aside className="hidden lg:grid lg:content-start lg:gap-4 lg:py-8">
          <section className="rounded-[2rem] border border-[rgba(15,77,58,0.12)] bg-white p-6">
            <LogiVNLogo className="h-10" priority />
            <h2 className="mt-8 text-4xl font-black tracking-tight text-[var(--primary)]">Một link đặt bàn đủ rõ cho khách và đủ an toàn cho quán.</h2>
            <div className="mt-5 grid gap-3 text-sm font-bold leading-6 text-[var(--muted-foreground)]">
              <p>Khách chọn ngày, số người và giờ còn bàn trong vài chạm.</p>
              <p>Hệ thống tự giữ bàn phù hợp và mở lại chỗ khi quá hạn cọc.</p>
              <p>Bảng quản lý của chủ quán cập nhật tức thời để xác nhận cọc hoặc nhận khách vào bàn.</p>
            </div>
          </section>

          <RestaurantVisitMapCard
            restaurant={restaurant}
            title="Tìm đường đến quán"
            description="Bản đồ giúp khách xem đường nhanh mà không làm loãng thao tác giữ bàn."
          />
        </aside>
      </section>
      <CustomerAiAssistant
        restaurantSlug={restaurant.slug}
        customerSessionId={reservationCustomerSessionId}
        surface="reservation"
        reservationStatus={reservationAiStatus}
        onAgentAction={handleReservationAgentAction}
      />
    </main>
  );
}

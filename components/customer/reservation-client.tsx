"use client";

/**
 * @deprecated Production reservations use `components/customer-v2/reserve/reserve-client-v2.tsx`.
 * Keep only as reference until fully removed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  FlowImage,
  FlowVisualCard,
  orderFlowImageSources
} from "@/components/customer/order-flow-visuals";
import { RestaurantVisitMapCard } from "@/components/location/restaurant-visit-map-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { formatVnd } from "@/lib/money";
import { cn } from "@/lib/utils";
import { reservationDepositStatusLabel, reservationStatusLabel } from "@/lib/labels";
import type { AiAgentAction } from "@/types/ai-agent";
import type { ReservationDto } from "@/types/domain";
import type { ReservationStatusTimelineItem } from "@/services/reservation-service";

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
  timeline?: ReservationStatusTimelineItem[];
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
  preferenceOptions: ReservationPreferenceOptions;
};

type StoredReservation = {
  reservationId: string;
  token: string;
};

type ReservationSyncState = "idle" | "syncing" | "live" | "error";
type LoadStoredReservationOptions = {
  silent?: boolean;
  clearOnAccessError?: boolean;
};
type BookingStep = "time" | "contact" | "review";
type ReservationSeatingZone = "indoor" | "outdoor" | "mixed";
type ReservationTableKind = "standard" | "vip" | "bar" | "community";
type ReservationTableAreaOption = {
  id: string;
  name: string;
  floorLabel: string | null;
  seatingZone: ReservationSeatingZone;
};
type ReservationPreferenceOptions = {
  tableAreas: ReservationTableAreaOption[];
  seatingZones: ReservationSeatingZone[];
  tableKinds: ReservationTableKind[];
};

const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";
const RESERVATION_SYNC_INTERVAL_MS = 10_000;
const terminalReservationStatuses = new Set<ReservationDto["status"]>(["completed", "cancelled", "rejected", "expired", "no_show"]);
const bookingSteps: Array<{ id: BookingStep; label: string }> = [
  { id: "time", label: "Chọn giờ" },
  { id: "contact", label: "Thông tin" },
  { id: "review", label: "Xác nhận" }
];
const seatingZoneLabels: Record<ReservationSeatingZone, string> = {
  indoor: "Trong nhà",
  outdoor: "Ngoài trời",
  mixed: "Linh hoạt"
};
const tableKindLabels: Record<ReservationTableKind, string> = {
  standard: "Tiêu chuẩn",
  vip: "VIP",
  bar: "Quầy bar",
  community: "Bàn chung"
};
const seatingZoneChoices: Array<{ value: ReservationSeatingZone | ""; label: string }> = [
  { value: "", label: "Bất kỳ" },
  { value: "indoor", label: "Trong nhà" },
  { value: "outdoor", label: "Ngoài trời" },
  { value: "mixed", label: "Linh hoạt" }
];
const tableKindChoices: Array<{ value: ReservationTableKind | ""; label: string }> = [
  { value: "", label: "Bất kỳ" },
  { value: "standard", label: "Tiêu chuẩn" },
  { value: "vip", label: "VIP" },
  { value: "bar", label: "Quầy bar" },
  { value: "community", label: "Bàn chung" }
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

function formatSyncClock(value: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: VN_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

function formatTimelineTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: VN_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatTimelineClock(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: VN_TIME_ZONE,
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

function tableAreaName(options: ReservationPreferenceOptions, tableAreaId?: string | null) {
  if (!tableAreaId) return null;
  return options.tableAreas.find((area) => area.id === tableAreaId)?.name ?? null;
}

function reservationPreferenceSummary(
  options: ReservationPreferenceOptions,
  preferences: {
    preferredTableAreaId?: string | null;
    preferredSeatingZone?: string | null;
    preferredTableKind?: string | null;
  }
) {
  const items = [
    tableAreaName(options, preferences.preferredTableAreaId),
    preferences.preferredSeatingZone ? seatingZoneLabels[preferences.preferredSeatingZone as ReservationSeatingZone] ?? preferences.preferredSeatingZone : null,
    preferences.preferredTableKind ? tableKindLabels[preferences.preferredTableKind as ReservationTableKind] ?? preferences.preferredTableKind : null
  ].filter(Boolean);
  return items.length > 0 ? items.join(" · ") : "Quán tự chọn bàn phù hợp";
}

function resultTone(status: ReservationDto["status"]): "green" | "yellow" | "blue" | "red" | "neutral" {
  if (status === "confirmed" || status === "checked_in" || status === "seated" || status === "completed") return "green";
  if (status === "holding" || status === "waiting_deposit_confirm") return "yellow";
  if (status === "cancelled" || status === "rejected" || status === "expired" || status === "no_show") return "red";
  return "neutral";
}

function resultHeroTitle(status: ReservationDto["status"]) {
  if (status === "confirmed") return "Đặt bàn thành công!";
  if (status === "cancelled") return "Lịch đặt đã huỷ";
  if (status === "rejected") return "Quán chưa thể nhận lịch này";
  if (status === "expired") return "Lịch giữ bàn đã hết hạn";
  if (status === "no_show") return "Lịch đã đánh dấu không đến";
  if (status === "completed") return "Cảm ơn bạn đã ghé quán";
  return "Đã giữ bàn cho bạn";
}

function hasActiveHold(status: ReservationDto["status"]) {
  return status === "holding" || status === "waiting_deposit_confirm";
}

function isTerminalReservationStatus(status: ReservationDto["status"]) {
  return terminalReservationStatuses.has(status);
}

function reservationSyncLabel(syncState: ReservationSyncState, lastSyncedAt: Date | null, autoSyncActive: boolean) {
  if (syncState === "syncing") return "Đang tự cập nhật";
  if (syncState === "error") return "Mất kết nối, bấm cập nhật";
  if (autoSyncActive) return lastSyncedAt ? `Tự cập nhật · ${formatSyncClock(lastSyncedAt)}` : "Đang tự cập nhật";
  return lastSyncedAt ? `Cập nhật lúc ${formatSyncClock(lastSyncedAt)}` : "Cập nhật thủ công";
}

function reservationSyncTone(syncState: ReservationSyncState, autoSyncActive: boolean) {
  if (syncState === "error") return "border-[rgba(197,48,48,0.16)] bg-[var(--danger-soft)] text-[var(--accent-strong)]";
  if (syncState === "syncing" || autoSyncActive) return "border-[rgba(15,77,58,0.12)] bg-[var(--primary-soft)] text-[var(--primary)]";
  return "border-[rgba(15,77,58,0.12)] bg-[#F7F2E8] text-[var(--muted-foreground)]";
}

function reservationTimelineTitle(item: Pick<ReservationStatusTimelineItem, "toStatus" | "note">) {
  if (item.note === "reservation_created") return "Đã tạo lịch đặt";
  if (item.note === "reservation_deposit_submitted") return "Bạn đã báo chuyển cọc";
  if (item.note === "reservation_deposit_confirmed") return "Quán đã xác nhận cọc";
  if (item.note === "reservation_checked_in") return "Khách đã check-in";
  if (item.note === "reservation_seated") return "Đã nhận khách vào bàn";
  if (item.note === "reservation_customer_cancel") return "Bạn đã huỷ lịch";
  if (item.note === "reservation_merchant_cancel") return "Quán đã huỷ lịch";
  if (item.note === "reservation_merchant_reject") return "Quán chưa thể nhận lịch";
  if (item.note === "reservation_rescheduled") return "Quán đã cập nhật giờ giữ bàn";
  if (item.note === "reservation_table_moved" || item.note === "reservation_tables_merged") return "Quán đã cập nhật bàn giữ";
  if (item.note === "reservation_hold_expired") return "Lịch giữ bàn đã hết hạn";
  if (item.note === "reservation_no_show" || item.note === "reservation_auto_no_show") return "Lịch được ghi nhận không đến";
  if (item.note === "reservation_deposit_refunded") return "Quán đã ghi nhận hoàn cọc";
  if (item.note === "reservation_bill_paid") return "Phiên bàn đã hoàn tất";
  return reservationStatusLabel(item.toStatus as ReservationDto["status"]);
}

function reservationTimelineActor(actorType: ReservationStatusTimelineItem["actorType"]) {
  if (actorType === "customer") return "Bạn";
  if (actorType === "merchant" || actorType === "staff") return "Quán";
  return "Hệ thống";
}

function timelineMetadataValue(item: ReservationStatusTimelineItem, key: string) {
  return item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
    ? (item.metadata as Record<string, unknown>)[key]
    : undefined;
}

function reservationTimelineNotice(item?: ReservationStatusTimelineItem) {
  if (!item) return null;
  if (item.note === "reservation_rescheduled") return "Quán vừa cập nhật giờ giữ bàn. Vui lòng kiểm tra lại thời gian đến.";
  if (item.note === "reservation_table_moved" || item.note === "reservation_tables_merged") return "Quán vừa cập nhật bàn giữ để phù hợp tình trạng bàn thực tế.";
  if (item.note === "reservation_deposit_confirmed") return "Cọc đã được xác nhận, lịch của bạn đã chắc bàn.";
  if (item.note === "reservation_checked_in") return "Quán đã ghi nhận khách tới nơi.";
  if (item.note === "reservation_seated") return "Khách đã được nhận vào bàn, tiếp tục gọi món bằng QR tại bàn.";
  if (item.note === "reservation_deposit_refunded") return "Cọc đã được quán đánh dấu hoàn thủ công.";
  if (item.note === "reservation_merchant_cancel" && timelineMetadataValue(item, "depositDisposition") === "refundable") return "Lịch đã huỷ và cọc được ghi nhận cần hoàn.";
  if ((item.note === "reservation_no_show" || item.note === "reservation_auto_no_show") && timelineMetadataValue(item, "depositDisposition") === "forfeited") return "Lịch no-show, cọc được ghi nhận giữ lại theo chính sách quán.";
  return null;
}

function reservationTableSummary(reservation: ReservationDto) {
  const tableNames = reservation.tables.map((table) => table.name).filter(Boolean);
  if (tableNames.length === 0) return "Quán tự chọn bàn phù hợp";
  if (tableNames.length === 1) return tableNames[0];
  return `${tableNames[0]} + ${tableNames.length - 1} bàn ghép`;
}

function isAccessFailureStatus(status?: number) {
  return status === 403 || status === 404 || status === 422;
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

function reservationResultVisual(reservation: ReservationDto) {
  if (reservation.depositStatus === "refundable") {
    return {
      src: orderFlowImageSources.paymentConfirmation,
      title: "Lịch cần hoàn cọc",
      caption: "Quán đã ghi nhận lịch cần hoàn cọc thủ công. Vui lòng liên hệ quán nếu cần đối soát."
    };
  }
  if (reservation.depositStatus === "refunded") {
    return {
      src: orderFlowImageSources.completed,
      title: "Cọc đã được ghi nhận hoàn",
      caption: "Quán đã đánh dấu hoàn cọc thủ công cho lịch đặt này."
    };
  }
  if (reservation.depositStatus === "forfeited") {
    return {
      src: orderFlowImageSources.cancelled,
      title: "Lịch đã giữ cọc",
      caption: "Lịch này được ghi nhận không đến và cọc đã được giữ lại theo chính sách quán."
    };
  }
  if (reservation.status === "cancelled" || reservation.status === "rejected" || reservation.status === "expired" || reservation.status === "no_show") {
    return {
      src: orderFlowImageSources.cancelled,
      title: resultHeroTitle(reservation.status),
      caption: "Lịch này đã dừng xử lý. Bạn có thể tạo lịch mới hoặc gọi quán để được hỗ trợ."
    };
  }
  if (reservation.status === "completed" || reservation.status === "checked_in" || reservation.status === "seated") {
    return {
      src: orderFlowImageSources.completed,
      title: resultHeroTitle(reservation.status),
      caption: "Thông tin đặt bàn đã hoàn tất, quán có thể tiếp tục phục vụ khách tại bàn."
    };
  }
  if (reservation.status === "waiting_deposit_confirm" || reservation.depositStatus === "waiting_confirm") {
    return {
      src: orderFlowImageSources.paymentConfirmation,
      title: "Quán đang xác nhận cọc",
      caption: "Giao dịch đã được báo lên hệ thống, vui lòng chờ quán kiểm tra."
    };
  }
  if (reservation.depositRequiredAmount > 0 && reservation.depositStatus === "waiting_payment") {
    return {
      src: orderFlowImageSources.paymentVietqr,
      title: "Cọc giữ bàn VietQR",
      caption: "Chuyển đúng nội dung để quán xác nhận lịch nhanh hơn."
    };
  }
  return {
    src: orderFlowImageSources.restaurantConfirmation,
    title: resultHeroTitle(reservation.status),
    caption: "Lịch đặt đã được gửi tới quán, trạng thái sẽ tự cập nhật tại đây."
  };
}

function ReservationTimeline({ reservation, timeline = [] }: { reservation: ReservationDto; timeline?: ReservationStatusTimelineItem[] }) {
  const current = reservation.status;
  const latestTimelineItem = timeline.at(-1);
  const latestNotice = reservationTimelineNotice(latestTimelineItem);
  const steps = [
    { id: "holding", label: reservation.depositRequiredAmount > 0 ? "Giữ bàn" : "Đã đặt" },
    { id: "waiting_deposit_confirm", label: "Chờ cọc" },
    { id: "confirmed", label: "Quán xác nhận" },
    { id: "checked_in", label: "Check-in" },
    { id: "seated", label: "Đến quán" }
  ];
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === current)
  );
  const isClosed = ["cancelled", "rejected", "expired", "no_show", "completed"].includes(current);

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
      <div className="mt-4 border-t border-[rgba(15,77,58,0.10)] pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-[var(--foreground)]">Dòng trạng thái</p>
            {latestTimelineItem ? (
              <p className="mt-0.5 text-xs font-bold text-[var(--muted-foreground)]">Mới nhất lúc {formatTimelineClock(latestTimelineItem.createdAt)}</p>
            ) : null}
          </div>
          <Badge tone={timeline.length > 0 ? "green" : "neutral"}>{timeline.length > 0 ? `${timeline.length} cập nhật` : "Đang chờ log"}</Badge>
        </div>
        {latestNotice ? (
          <div className="mt-3 rounded-2xl border border-[rgba(242,140,40,0.18)] bg-[rgba(242,140,40,0.10)] p-3 text-sm font-bold text-[var(--accent-strong)]">
            {latestNotice}
          </div>
        ) : null}
        <div className="mt-3 grid gap-2">
          {timeline.length > 0 ? (
            timeline.slice().reverse().map((item, index) => (
              <div key={item.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                <span className={cn("mt-1 grid h-7 w-7 place-items-center rounded-full", index === 0 ? "bg-[var(--primary)] text-white" : "bg-[#F7F2E8] text-[var(--primary)]")}>
                  {index === 0 ? <CheckCircle2 size={14} /> : <Clock3 size={13} />}
                </span>
                <div className="min-w-0 rounded-2xl bg-[#F7F2E8] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-black text-[var(--foreground)]">{reservationTimelineTitle(item)}</p>
                    <span className="shrink-0 text-[11px] font-black text-[var(--muted-foreground)]">{formatTimelineTime(item.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">
                    {reservationTimelineActor(item.actorType)} · {reservationStatusLabel(item.toStatus as ReservationDto["status"])}
                    {item.fromStatus && item.fromStatus !== item.toStatus ? ` · từ ${reservationStatusLabel(item.fromStatus as ReservationDto["status"])}` : ""}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-[#F7F2E8] p-3 text-sm font-bold text-[var(--muted-foreground)]">
              Trạng thái hiện tại: {reservationStatusLabel(reservation.status)}. Màn hình vẫn tự cập nhật định kỳ khi quán xử lý lịch.
            </div>
          )}
        </div>
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
  const [preferredTableAreaId, setPreferredTableAreaId] = useState("");
  const [preferredSeatingZone, setPreferredSeatingZone] = useState<ReservationSeatingZone | "">("");
  const [preferredTableKind, setPreferredTableKind] = useState<ReservationTableKind | "">("");
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
  const [syncState, setSyncState] = useState<ReservationSyncState>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [, setClockTick] = useState(0);
  const createIdempotencyRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const selectedSlot = useMemo(() => slots.find((slot) => slot.startsAt === selectedStartsAt), [slots, selectedStartsAt]);
  const holdCountdown = countdownLabel(result?.reservation.holdExpiresAt);
  const canMarkPaid = result?.reservation.status === "holding" && result.reservation.depositStatus === "waiting_payment";
  const isWaitingDepositApproval = result?.reservation.status === "waiting_deposit_confirm" && result.reservation.depositStatus === "waiting_confirm";
  const canCancelResult = result ? canCustomerCancel(result.reservation) : false;
  const autoSyncActive = Boolean(result?.token && !isTerminalReservationStatus(result.reservation.status));
  const syncStatusLabel = reservationSyncLabel(syncState, lastSyncedAt, autoSyncActive);
  const isContactReady = customerName.trim().length >= 2 && customerPhone.trim().length >= 6;
  const stepIndex = bookingSteps.findIndex((item) => item.id === step);
  const visibleSeatingZoneChoices = useMemo(
    () => seatingZoneChoices.filter((choice) => !choice.value || restaurant.preferenceOptions.seatingZones.includes(choice.value)),
    [restaurant.preferenceOptions.seatingZones]
  );
  const visibleTableKindChoices = useMemo(
    () => tableKindChoices.filter((choice) => !choice.value || restaurant.preferenceOptions.tableKinds.includes(choice.value)),
    [restaurant.preferenceOptions.tableKinds]
  );
  const draftPreferenceSummary = reservationPreferenceSummary(restaurant.preferenceOptions, {
    preferredTableAreaId,
    preferredSeatingZone,
    preferredTableKind
  });
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
        preferredTableAreaId,
        preferredSeatingZone,
        preferredTableKind
      }),
    [
      customerEmail,
      customerName,
      customerNote,
      customerPhone,
      partySize,
      preferredSeatingZone,
      preferredTableAreaId,
      preferredTableKind,
      restaurant.slug,
      selectedStartsAt
    ]
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
      if (preferredTableAreaId) params.set("preferredTableAreaId", preferredTableAreaId);
      if (preferredSeatingZone) params.set("preferredSeatingZone", preferredSeatingZone);
      if (preferredTableKind) params.set("preferredTableKind", preferredTableKind);
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
  }, [date, partySize, preferredSeatingZone, preferredTableAreaId, preferredTableKind, restaurant.reservationsEnabled, restaurant.slug]);

  const loadStoredReservation = useCallback(async (stored: StoredReservation, options: LoadStoredReservationOptions = {}) => {
    const silent = options.silent ?? false;
    if (silent) {
      setSyncState("syncing");
    } else {
      setRefreshing(true);
      setError(null);
    }

    try {
      const params = new URLSearchParams({ token: stored.token });
      const response = await fetch(`/api/reservations/${stored.reservationId}?${params.toString()}`, { cache: "no-store" });
      const json = await response.json().catch(() => null) as { ok?: boolean; data?: Omit<ReservationResult, "token">; error?: string } | null;
      if (!response.ok || !json?.ok || !json.data) {
        const error = new Error(json?.error ?? "Không tải được lịch đặt.") as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      setResult({ ...json.data, token: stored.token });
      setLastSyncedAt(new Date());
      setSyncState("live");
      return true;
    } catch (loadError) {
      const status = loadError instanceof Error ? (loadError as Error & { status?: number }).status : undefined;
      const message = loadError instanceof Error ? loadError.message : "Không tải được lịch đặt.";
      const shouldClearAccess = isAccessFailureStatus(status);
      if (shouldClearAccess) {
        window.localStorage.removeItem(reservationStorageKey(restaurant.slug));
        if (options.clearOnAccessError ?? true) setResult(null);
      }
      setSyncState("error");
      if (!silent || shouldClearAccess) setError(message);
      return false;
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, [restaurant.slug]);

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
        void loadStoredReservation(JSON.parse(raw) as StoredReservation, { clearOnAccessError: true });
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

  useEffect(() => {
    if (!result?.token || isTerminalReservationStatus(result.reservation.status) || refreshing || submitting || cancelling || syncState === "syncing") return;
    const stored = { reservationId: result.reservation.id, token: result.token };
    const sync = () => {
      if (document.visibilityState === "hidden") return;
      void loadStoredReservation(stored, { silent: true, clearOnAccessError: true });
    };
    const timer = window.setInterval(sync, RESERVATION_SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [cancelling, loadStoredReservation, refreshing, result?.reservation.id, result?.reservation.status, result?.token, submitting, syncState]);

  useEffect(() => {
    if (!result?.token || isTerminalReservationStatus(result.reservation.status)) return;
    const stored = { reservationId: result.reservation.id, token: result.token };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadStoredReservation(stored, { silent: true, clearOnAccessError: true });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [loadStoredReservation, result?.reservation.id, result?.reservation.status, result?.token]);

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
        preferredTableAreaId: result.reservation.preferredTableAreaId,
        preferredSeatingZone: result.reservation.preferredSeatingZone,
        preferredTableKind: result.reservation.preferredTableKind,
        preferenceSummary: reservationPreferenceSummary(restaurant.preferenceOptions, result.reservation),
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
      preferredTableAreaId: preferredTableAreaId || null,
      preferredSeatingZone: preferredSeatingZone || null,
      preferredTableKind: preferredTableKind || null,
      preferenceSummary: draftPreferenceSummary,
      depositRequiredAmount: depositAmount(restaurant, partySize),
      holdMinutes: restaurant.holdMinutes,
      step
    };
  }, [canCancelResult, date, draftPreferenceSummary, partySize, preferredSeatingZone, preferredTableAreaId, preferredTableKind, restaurant, result, selectedSlot, selectedStartsAt, step]);
  const reservationCustomerSessionId = result?.reservation.id ? `reservation-${result.reservation.id}` : `reservation-draft-${restaurant.slug}`;

  if (result) {
    const resultVisual = reservationResultVisual(result.reservation);

    return (
      <main className="customer-app-shell min-h-screen text-[var(--foreground)]">
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
                <FlowImage src={resultVisual.src} alt={resultVisual.title} className="mx-auto h-36 w-full max-w-[300px] border-white/25 bg-white/95 shadow-[0_18px_50px_rgba(0,0,0,0.18)]" sizes="300px" priority />
                <h1 className="mt-5 text-3xl font-black tracking-tight">{resultHeroTitle(result.reservation.status)}</h1>
                <p className="mt-2 text-sm font-semibold text-white/80">{restaurant.name}</p>
              </section>

              <section className="mt-8 rounded-[1.75rem] border border-[rgba(15,77,58,0.10)] bg-white p-4 shadow-[0_18px_55px_rgba(15,77,58,0.10)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Mã đặt bàn</p>
                    <h2 className="mt-1 text-xl font-black text-[var(--foreground)]">#{result.reservation.id.slice(0, 8).toUpperCase()}</h2>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge tone={resultTone(result.reservation.status)}>{reservationStatusLabel(result.reservation.status)}</Badge>
                    <span className={cn("inline-flex max-w-[190px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-right text-[11px] font-black leading-tight", reservationSyncTone(syncState, autoSyncActive))}>
                      {syncState === "syncing" ? <RefreshCw className="shrink-0 animate-spin" size={12} /> : syncState === "error" ? <XCircle className="shrink-0" size={12} /> : <CheckCircle2 className="shrink-0" size={12} />}
                      {syncStatusLabel}
                    </span>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 rounded-2xl bg-[#F7F2E8] p-4 text-sm font-bold">
                  <p className="flex items-center gap-2">
                    <CalendarClock size={16} className="text-[var(--primary)]" />
                    {formatReservationDate(result.reservation.startsAt)}
                  </p>
                  <p className="flex items-center gap-2">
                    <UsersRound size={16} className="text-[var(--primary)]" />
                    {result.reservation.partySize} khách · {reservationTableSummary(result.reservation)}
                  </p>
                  <p className="flex items-center gap-2">
                    <Store size={16} className="text-[var(--primary)]" />
                    {reservationPreferenceSummary(restaurant.preferenceOptions, result.reservation)}
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
                <ReservationTimeline reservation={result.reservation} timeline={result.timeline} />
              </div>

              <div className="mt-4">
                <FlowVisualCard src={resultVisual.src} title={resultVisual.title} caption={resultVisual.caption} />
              </div>

              {result.payment ? (
                <section className="mt-4 rounded-[1.75rem] border border-[rgba(15,77,58,0.12)] bg-white p-4">
                  <FlowVisualCard
                    src={orderFlowImageSources.paymentVietqr}
                    title="Cọc giữ bàn VietQR"
                    caption="Mã này gắn với đúng lịch đặt và nội dung chuyển khoản của bạn."
                    className="mb-4"
                  />
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
                  <FlowVisualCard
                    src={orderFlowImageSources.restaurantConfirmation}
                    title="Quán nhận lịch không cọc"
                    caption="Bạn chỉ cần đến đúng giờ, lịch vẫn được lưu để xem lại trạng thái."
                    className="mb-4"
                  />
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
                  <Button className="w-full bg-[var(--primary)] text-white shadow-[0_16px_34px_rgba(15,77,58,0.22)] hover:bg-[var(--primary-strong)]" onClick={refreshResult} disabled={refreshing || syncState === "syncing"}>
                    {refreshing || syncState === "syncing" ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
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
    <main className="customer-reservation-shell customer-app-shell">
      <section className="mx-auto grid min-h-screen max-w-6xl gap-6 px-0 sm:px-4 lg:grid-cols-[440px_minmax(0,1fr)] lg:py-8">
        <div className="customer-reservation-phone">
          <div className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(135deg,#FFFDF7_0%,#F6F1E6_54%,#EAF3EA_100%)]" />
          <div className="customer-reservation-content">
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

            <section className="customer-reservation-card mt-4 p-4 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge tone={restaurant.reservationsEnabled ? "green" : "yellow"}>{restaurant.reservationsEnabled ? "Đang nhận bàn" : "Tạm tắt đặt bàn"}</Badge>
                  <h1 className="mt-3 text-[24px] font-black leading-tight tracking-tight text-[var(--primary)]">Giữ bàn nhanh</h1>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[var(--muted-foreground)]">
                    Chọn ngày, số khách và khung giờ còn bàn. LogiVN sẽ giữ trạng thái trên thiết bị này.
                  </p>
                </div>
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--primary)] text-white shadow-[0_12px_24px_rgba(15,77,58,0.18)]">
                  <CalendarCheck2 size={24} />
                </div>
              </div>
              {restaurant.address ? (
                <p className="mt-4 flex items-start gap-2 rounded-2xl bg-[#F7F2E8] p-3 text-xs font-bold leading-5 text-[var(--foreground)]">
                  <MapPin size={15} className="mt-0.5 shrink-0 text-[var(--primary)]" />
                  {restaurant.address}
                </p>
              ) : null}
            </section>

            <nav className="customer-reservation-stepper mt-4">
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
                <div className="customer-reservation-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-black">Bạn muốn đến khi nào?</h2>
                      <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">LogiVN tự chọn giờ trống đầu tiên để bạn thao tác nhanh hơn.</p>
                    </div>
                    {loadingSlots ? <Loader2 className="animate-spin text-[var(--primary)]" size={18} /> : null}
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 max-[374px]:grid-cols-1">
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

                  {restaurant.preferenceOptions.tableAreas.length > 0 || visibleSeatingZoneChoices.length > 1 || visibleTableKindChoices.length > 1 ? (
                    <div className="customer-reservation-card mt-4 bg-[#F7F2E8] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-black text-[var(--foreground)]">Ưu tiên vị trí</p>
                        <Badge tone={draftPreferenceSummary === "Quán tự chọn bàn phù hợp" ? "neutral" : "green"}>
                          {draftPreferenceSummary === "Quán tự chọn bàn phù hợp" ? "Tự chọn" : "Có ưu tiên"}
                        </Badge>
                      </div>

                      {restaurant.preferenceOptions.tableAreas.length > 0 ? (
                        <div className="customer-reservation-option-grid mt-3">
                          <button
                            type="button"
                            onClick={() => setPreferredTableAreaId("")}
                            className={cn(
                              "min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-black transition",
                              !preferredTableAreaId ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[rgba(15,77,58,0.12)] bg-white text-[var(--foreground)]"
                            )}
                          >
                            Tất cả khu vực
                          </button>
                          {restaurant.preferenceOptions.tableAreas.map((area) => (
                            <button
                              key={area.id}
                              type="button"
                              onClick={() => setPreferredTableAreaId(area.id)}
                              className={cn(
                                "min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-black transition",
                                preferredTableAreaId === area.id ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[rgba(15,77,58,0.12)] bg-white text-[var(--foreground)]"
                              )}
                            >
                              <span className="block">{area.name}</span>
                              {area.floorLabel ? <span className="mt-0.5 block text-[11px] font-bold opacity-70">{area.floorLabel}</span> : null}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {visibleSeatingZoneChoices.length > 1 ? (
                          <div>
                            <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Không gian</p>
                            <div className="grid grid-cols-2 gap-2">
                              {visibleSeatingZoneChoices.map((choice) => (
                                <button
                                  key={choice.value || "any-zone"}
                                  type="button"
                                  onClick={() => setPreferredSeatingZone(choice.value)}
                                  className={cn(
                                    "min-h-11 rounded-xl border px-3 py-2 text-sm font-black transition",
                                    preferredSeatingZone === choice.value ? "border-[var(--primary)] bg-white text-[var(--primary)]" : "border-[rgba(15,77,58,0.12)] bg-white/70 text-[var(--foreground)]"
                                  )}
                                >
                                  {choice.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {visibleTableKindChoices.length > 1 ? (
                          <div>
                            <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Loại bàn</p>
                            <div className="grid grid-cols-2 gap-2">
                              {visibleTableKindChoices.map((choice) => (
                                <button
                                  key={choice.value || "any-kind"}
                                  type="button"
                                  onClick={() => setPreferredTableKind(choice.value)}
                                  className={cn(
                                    "min-h-11 rounded-xl border px-3 py-2 text-sm font-black transition",
                                    preferredTableKind === choice.value ? "border-[var(--primary)] bg-white text-[var(--primary)]" : "border-[rgba(15,77,58,0.12)] bg-white/70 text-[var(--foreground)]"
                                  )}
                                >
                                  {choice.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="customer-reservation-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-black">Khung giờ còn bàn</h2>
                    <Badge tone={selectedSlot ? "green" : "yellow"}>{selectedSlot ? "Đã chọn" : "Chọn giờ"}</Badge>
                  </div>
                  <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">{formatShortDate(date)} · {partySize} khách · {draftPreferenceSummary} · {depositDescription(restaurant, partySize)}</p>

                  {groupedSlots.length === 0 && !loadingSlots ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-[#F7F2E8] p-5 text-center text-sm font-bold text-[var(--muted-foreground)]">
                      Chưa có khung giờ phù hợp. Hãy thử ngày khác hoặc giảm số khách.
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-4">
                    {groupedSlots.map((group) => (
                      <div key={group.id}>
                        <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--muted-foreground)]">{group.label}</p>
                        <div className="customer-reservation-slot-grid">
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
              <section className="customer-reservation-card mt-4 p-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
                    <UserRound size={22} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black">Thông tin để quán giữ bàn</h2>
                    <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">Chỉ cần tên và số điện thoại. Email là tuỳ chọn.</p>
                  </div>
                </div>

                <div className="mt-4 customer-form-grid">
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
                <FlowVisualCard
                  src={depositAmount(restaurant, partySize) > 0 ? orderFlowImageSources.paymentVietqr : orderFlowImageSources.restaurantConfirmation}
                  title={depositAmount(restaurant, partySize) > 0 ? "Sẵn sàng giữ bàn bằng cọc" : "Sẵn sàng gửi lịch cho quán"}
                  caption={depositAmount(restaurant, partySize) > 0 ? "Sau bước này, mã VietQR sẽ hiện ngay để bạn chuyển cọc đúng nội dung." : "Quán sẽ nhận lịch và cập nhật trạng thái xác nhận trực tiếp trên màn hình này."}
                />
                <div className="customer-reservation-card p-4">
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
                    <div className="rounded-2xl bg-[#F7F2E8] p-4">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Ưu tiên vị trí</p>
                      <p className="mt-1 text-sm font-black leading-6">{draftPreferenceSummary}</p>
                    </div>
                    <div className="customer-reservation-option-grid">
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

                <div className="customer-reservation-card bg-[var(--primary-soft)] p-4 text-sm font-bold leading-6 text-[var(--primary)]">
                  <ShieldCheck className="mb-2" size={22} />
                  {depositAmount(restaurant, partySize) > 0
                    ? `Sau khi giữ bàn, bạn có ${restaurant.holdMinutes} phút để chuyển cọc VietQR. Nếu quá hạn, bàn sẽ tự mở lại cho khách khác.`
                    : "Lịch này không yêu cầu cọc. Quán sẽ nhận thông tin và giữ bàn theo thời gian bạn chọn."}
                </div>
              </section>
            ) : null}

            {error ? <p className="mt-4 rounded-2xl bg-[var(--danger-soft)] p-3 text-sm font-bold text-[var(--accent-strong)]">{error}</p> : null}
          </div>

          <div className="customer-reservation-bottom">
            <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-[#F7F2E8] px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{selectedSlot ? formatSlot(selectedSlot.startsAt) : "Chưa chọn giờ"} · {partySize} khách</p>
                <p className="truncate text-xs font-bold text-[var(--muted-foreground)]">{draftPreferenceSummary} · {depositDescription(restaurant, partySize)}</p>
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

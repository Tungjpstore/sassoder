"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Banknote,
  CalendarCheck,
  CalendarClock,
  Check,
  Clock3,
  Copy,
  ExternalLink,
  Flame,
  LayoutList,
  Loader2,
  MapPin,
  QrCode,
  RadioTower,
  RefreshCw,
  Rows3,
  Search,
  Settings2,
  ShieldCheck,
  Sofa,
  Table2,
  TimerReset,
  UserRoundCheck,
  UsersRound,
  X
} from "lucide-react";
import { updateReservationSettingsAction } from "@/app/dashboard/actions";
import { RestaurantVisitMapCard } from "@/components/location/restaurant-visit-map-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatVnd } from "@/lib/money";
import { reservationDepositStatusLabel, reservationStatusLabel } from "@/lib/labels";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { buildTenantUrl } from "@/lib/tenant-domain";
import type { ReservationAnalytics } from "@/services/reservation-analytics";
import type { ReservationDepositType, ReservationDto } from "@/types/domain";

type ReservationSettings = {
  name: string;
  slug: string;
  address: string | null;
  store_lat: number | null;
  store_lng: number | null;
  hotline: string | null;
  reservations_enabled: boolean;
  reservation_deposit_enabled: boolean;
  reservation_deposit_type: ReservationDepositType;
  reservation_deposit_value: number;
  reservation_hold_minutes: number;
  reservation_duration_minutes: number;
  reservation_buffer_minutes: number;
  reservation_min_notice_minutes: number;
  reservation_max_days_ahead: number;
  reservation_arrival_grace_minutes: number;
};

type ReservationTableOption = {
  id: string;
  name: string;
  area: string;
  capacity: number;
  tableAreaId?: string | null;
  floorLabel?: string | null;
  seatingZone?: string | null;
  tableKind?: string | null;
  isBookable?: boolean;
  isHidden?: boolean;
  isUnderMaintenance?: boolean;
  qrEnabled?: boolean;
  qrToken?: string | null;
  operationalStatus?: "available" | "needs_confirm" | "serving" | "overdue" | "awaiting_payment";
  activeOrderCount?: number;
  activeBillCount?: number;
  activeReservationCount?: number;
  unpaidTotal?: number;
};

type DrawerMode = "closed" | "detail" | "settings" | "share";
type RealtimeState = "connecting" | "connected" | "error";
type FilterKey = "today" | "holding" | "waiting_deposit_confirm" | "confirmed" | "checked_in" | "seated" | "history";
type ViewMode = "list" | "timeline" | "floor";
type ReservationAction = "confirm-deposit" | "check-in" | "seat" | "cancel" | "reject" | "no-show" | "move-table" | "reschedule" | "tables";

function todayInputValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function localInputParts(value: string) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  const inputValue = date.toISOString();
  return {
    date: inputValue.slice(0, 10),
    time: inputValue.slice(11, 16)
  };
}

function localDateTimeToIso(date: string, time: string) {
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

function formatClock(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatSyncedClock(value: Date | null) {
  if (!value) return "Đang đồng bộ";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(value);
}

function formatNumber(value: number, maximumFractionDigits = 1) {
  return value.toLocaleString("vi-VN", { maximumFractionDigits });
}

function formatPercent(value: number) {
  return `${formatNumber(value)}%`;
}

function formatLeadHours(value: number) {
  if (value <= 0) return "Chưa có";
  if (value < 24) return `${formatNumber(value)} giờ`;
  return `${formatNumber(value / 24)} ngày`;
}

function reservationHourLabel(value: string) {
  const hour = new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    hour12: false
  }).format(new Date(value));
  return `${hour}:00`;
}

function reservationTimeRange(reservation: ReservationDto) {
  return `${formatClock(reservation.startsAt)} - ${formatClock(reservation.endsAt)}`;
}

function shortId(id: string) {
  return `#${id.slice(0, 6).toUpperCase()}`;
}

function minutesUntil(value: string, now = Date.now()) {
  return Math.ceil((new Date(value).getTime() - now) / 60000);
}

function minuteDistanceLabel(value: string, now = Date.now()) {
  const minutes = minutesUntil(value, now);
  if (minutes < 0) return `Trễ ${Math.abs(minutes)} phút`;
  if (minutes === 0) return "Đến giờ";
  if (minutes < 60) return `Còn ${minutes} phút`;
  return `${formatNumber(minutes / 60)} giờ nữa`;
}

function statusTone(status: ReservationDto["status"]): "neutral" | "green" | "yellow" | "blue" | "red" {
  if (status === "confirmed" || status === "checked_in" || status === "seated" || status === "completed") return "green";
  if (status === "holding" || status === "waiting_deposit_confirm") return "yellow";
  if (status === "cancelled" || status === "rejected" || status === "expired" || status === "no_show") return "red";
  return "neutral";
}

function isHistory(status: ReservationDto["status"]) {
  return ["completed", "cancelled", "rejected", "expired", "no_show"].includes(status);
}

function isFloorActiveReservation(reservation: ReservationDto) {
  return !isHistory(reservation.status) && reservation.status !== "rejected";
}

function tableOperationalLabel(table: ReservationTableOption) {
  if (table.isHidden) return "Đang ẩn";
  if (table.isUnderMaintenance) return "Bảo trì";
  if (table.operationalStatus === "overdue") return "Trễ phục vụ";
  if (table.operationalStatus === "needs_confirm") return "Có đơn mới";
  if (table.operationalStatus === "serving" && table.activeReservationCount) return "Lịch đã vào bàn";
  if (table.operationalStatus === "serving" && table.activeBillCount) return "Phiên bàn mở";
  if (table.operationalStatus === "serving") return "Đang phục vụ";
  if (table.operationalStatus === "awaiting_payment") return "Chờ thanh toán";
  return "Sẵn sàng";
}

function tableOperationalTone(table: ReservationTableOption): "neutral" | "green" | "yellow" | "blue" | "red" {
  if (table.isHidden || table.isUnderMaintenance || table.operationalStatus === "overdue") return "red";
  if (table.operationalStatus === "needs_confirm" || table.operationalStatus === "awaiting_payment") return "yellow";
  if (table.operationalStatus === "serving") return "blue";
  return "green";
}

function holdCountdown(reservation: ReservationDto, now = Date.now()) {
  if (!reservation.holdExpiresAt || !["holding", "waiting_deposit_confirm"].includes(reservation.status)) return null;
  const minutes = Math.ceil((new Date(reservation.holdExpiresAt).getTime() - now) / 60000);
  return minutes > 0 ? `${minutes} phút` : "Đã hết hạn";
}

function canSeatReservation(reservation: ReservationDto) {
  return reservation.status === "confirmed" || reservation.status === "checked_in";
}

function canCheckInReservation(reservation: ReservationDto) {
  return reservation.status === "confirmed";
}

function canCancelReservation(reservation: ReservationDto) {
  return !isHistory(reservation.status) && reservation.status !== "seated";
}

function canRejectReservation(reservation: ReservationDto) {
  if (reservation.status === "checked_in" || reservation.status === "seated") return false;
  if (reservation.depositPaidAmount > 0 || reservation.depositStatus === "paid" || reservation.depositStatus === "waiting_confirm") return false;
  return !isHistory(reservation.status);
}

function canRescheduleReservation(reservation: ReservationDto) {
  return !isHistory(reservation.status) && reservation.status !== "checked_in" && reservation.status !== "seated" && !reservation.seatedTableBillId;
}

function canMarkNoShow(reservation: ReservationDto, arrivalGraceMinutes: number, now = Date.now()) {
  if (reservation.status !== "confirmed") return false;
  return now >= new Date(reservation.startsAt).getTime() + arrivalGraceMinutes * 60_000;
}

function actionEndpoint(action: ReservationAction, reservationId: string) {
  return `/api/admin/reservations/${reservationId}/${action}`;
}

function tableOptionLabel(table: ReservationTableOption) {
  const floor = table.floorLabel || "Tầng trệt";
  const area = table.area || "Khu chính";
  const flags = [table.tableKind === "vip" ? "VIP" : null, table.seatingZone === "outdoor" ? "ngoài trời" : null].filter(Boolean).join(", ");
  return `${table.name} · ${floor} · ${area} · ${table.capacity} khách${flags ? ` · ${flags}` : ""}`;
}

function tableQrUrl(restaurantSlug: string, table: ReservationTableOption) {
  const url = buildTenantUrl(restaurantSlug, `/table/${table.id}`);
  if (!table.qrToken) return url;
  const parsed = new URL(url);
  parsed.searchParams.set("t", table.qrToken);
  return parsed.toString();
}

function qrImageUrl(value: string, size = 260) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`;
}

function realtimeLabel(status: RealtimeState) {
  if (status === "connected") return "Realtime đặt bàn đang bật";
  if (status === "error") return "Realtime đặt bàn gián đoạn";
  return "Đang kết nối realtime";
}

function reservationSourceLabel(source: string) {
  const normalized = source.toLowerCase();
  if (normalized.includes("admin") || normalized.includes("dashboard") || normalized.includes("staff")) return "Nhân viên tạo";
  if (normalized.includes("ai")) return "AI hỗ trợ";
  if (normalized.includes("phone")) return "Gọi điện";
  if (normalized.includes("public") || normalized.includes("customer") || normalized.includes("web")) return "Khách tự đặt";
  return source || "Không rõ nguồn";
}

function matchesReservationSearch(reservation: ReservationDto, normalizedQuery: string) {
  if (!normalizedQuery) return true;

  const digitQuery = normalizedQuery.replace(/\D/g, "");
  if (digitQuery && reservation.customerPhone.replace(/\D/g, "").includes(digitQuery)) return true;

  const haystack = [
    reservation.id,
    shortId(reservation.id),
    reservation.customerName,
    reservation.customerPhone,
    reservation.customerEmail,
    reservation.source,
    reservationSourceLabel(reservation.source),
    reservationStatusLabel(reservation.status),
    reservationDepositStatusLabel(reservation.depositStatus),
    ...reservation.tables.flatMap((table) => [table.name, table.area, table.floorLabel ?? "", table.seatingZone ?? "", table.tableKind ?? ""])
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("vi-VN");

  return haystack.includes(normalizedQuery);
}

const seatingZoneLabels: Record<string, string> = {
  indoor: "Trong nhà",
  outdoor: "Ngoài trời",
  mixed: "Linh hoạt"
};
const tableKindLabels: Record<string, string> = {
  standard: "Tiêu chuẩn",
  vip: "VIP",
  bar: "Quầy bar",
  community: "Bàn chung"
};

function reservationPreferenceLabel(reservation: ReservationDto, areaNameById: Map<string, string>) {
  const items = [
    reservation.preferredTableAreaId ? areaNameById.get(reservation.preferredTableAreaId) ?? "Khu vực đã chọn" : null,
    reservation.preferredSeatingZone ? seatingZoneLabels[reservation.preferredSeatingZone] ?? reservation.preferredSeatingZone : null,
    reservation.preferredTableKind ? tableKindLabels[reservation.preferredTableKind] ?? reservation.preferredTableKind : null
  ].filter(Boolean);

  return items.length > 0 ? items.join(" · ") : "Quán tự chọn bàn phù hợp";
}

function SettingsDrawer({ settings }: { settings: ReservationSettings }) {
  const [state, formAction, pending] = useActionState(updateReservationSettingsAction, undefined);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold">
          Bật nhận đặt bàn trước
          <input type="checkbox" name="reservationsEnabled" value="true" defaultChecked={settings.reservations_enabled} className="h-5 w-5 accent-[var(--accent)]" />
        </label>
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold">
          Yêu cầu cọc giữ bàn
          <input type="checkbox" name="reservationDepositEnabled" value="true" defaultChecked={settings.reservation_deposit_enabled} className="h-5 w-5 accent-[var(--accent)]" />
        </label>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <MapPin size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--foreground)]">Vị trí đặt bàn dùng chung với bản đồ quán</p>
            <p className="mt-1 text-sm font-medium leading-6 text-[var(--muted-foreground)]">
              {settings.address || "Chưa có địa chỉ quán."}{" "}
              {settings.store_lat !== null && settings.store_lng !== null ? "Đã có toạ độ cho chỉ đường." : "Chưa ghim toạ độ."}
            </p>
            <Link href="/dashboard/settings?section=online" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--primary)] hover:text-[var(--primary-strong)]">
              Cập nhật vị trí trên bản đồ
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">
          Kiểu cọc
          <select name="reservationDepositType" defaultValue={settings.reservation_deposit_type} className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--primary)]">
            <option value="FIXED">Cọc cố định</option>
            <option value="PER_PERSON">Cọc theo đầu khách</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Số tiền cọc
          <Input name="reservationDepositValue" type="number" min={0} step={1000} defaultValue={settings.reservation_deposit_value} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Giữ cọc trong
          <Input name="reservationHoldMinutes" type="number" min={1} max={1440} defaultValue={settings.reservation_hold_minutes} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Thời lượng bàn
          <Input name="reservationDurationMinutes" type="number" min={15} max={480} defaultValue={settings.reservation_duration_minutes} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Khoảng đệm bàn
          <Input name="reservationBufferMinutes" type="number" min={0} max={240} defaultValue={settings.reservation_buffer_minutes} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Đặt trước tối thiểu
          <Input name="reservationMinNoticeMinutes" type="number" min={0} max={10080} defaultValue={settings.reservation_min_notice_minutes} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Nhận trước tối đa
          <Input name="reservationMaxDaysAhead" type="number" min={1} max={365} defaultValue={settings.reservation_max_days_ahead} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Trễ hẹn cho phép
          <Input name="reservationArrivalGraceMinutes" type="number" min={0} max={240} defaultValue={settings.reservation_arrival_grace_minutes} />
        </label>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-sm font-semibold text-[var(--muted-foreground)]">
        Mẹo vận hành: bật cọc cố định cho giờ cao điểm, dùng buffer 15-30 phút để tránh khách sau bị đè lịch bàn.
      </div>

      {state?.error ? <p className="text-sm font-semibold text-[var(--accent-strong)]">{state.error}</p> : null}
      {state?.success ? <p className="text-sm font-semibold text-[var(--primary-strong)]">{state.success}</p> : null}

      <Button disabled={pending}>
        {pending ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
        {pending ? "Đang lưu..." : "Lưu cấu hình đặt bàn"}
      </Button>
    </form>
  );
}

export function ReservationsWorkspace({
  restaurantId,
  settings,
  initialReservations,
  tableOptions,
  publicUrl,
  analytics
}: {
  restaurantId: string;
  settings: ReservationSettings;
  initialReservations: ReservationDto[];
  tableOptions: ReservationTableOption[];
  publicUrl: string;
  analytics: ReservationAnalytics;
}) {
  const router = useRouter();
  const [date, setDate] = useState(todayInputValue());
  const [reservations, setReservations] = useState(initialReservations);
  const [analyticsSnapshot, setAnalyticsSnapshot] = useState(analytics);
  const [selectedId, setSelectedId] = useState(initialReservations[0]?.id ?? null);
  const [drawer, setDrawer] = useState<DrawerMode>("closed");
  const [filter, setFilter] = useState<FilterKey>("today");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [tableSelectionIds, setTableSelectionIds] = useState<string[]>([]);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleTableId, setRescheduleTableId] = useState("");
  const [copiedTableQrId, setCopiedTableQrId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("connecting");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(() => new Date());
  const [clockTick, setClockTick] = useState(() => Date.now());
  const refreshTimerRef = useRef<number | null>(null);
  const selected = reservations.find((reservation) => reservation.id === selectedId) ?? null;
  const areaNameById = useMemo(() => {
    const next = new Map<string, string>();
    for (const table of tableOptions) {
      if (table.tableAreaId && !next.has(table.tableAreaId)) {
        next.set(table.tableAreaId, table.area || "Khu chính");
      }
    }
    return next;
  }, [tableOptions]);

  const stats = useMemo(() => {
    return {
      total: reservations.length,
      holding: reservations.filter((item) => item.status === "holding").length,
      waitingDeposit: reservations.filter((item) => item.status === "waiting_deposit_confirm").length,
      confirmed: reservations.filter((item) => item.status === "confirmed").length,
      checkedIn: reservations.filter((item) => item.status === "checked_in").length,
      seated: reservations.filter((item) => item.status === "seated").length
    };
  }, [reservations]);

  const filterCounts = useMemo<Record<FilterKey, number>>(() => {
    return {
      today: reservations.filter((item) => !isHistory(item.status)).length,
      holding: reservations.filter((item) => item.status === "holding").length,
      waiting_deposit_confirm: reservations.filter((item) => item.status === "waiting_deposit_confirm").length,
      confirmed: reservations.filter((item) => item.status === "confirmed").length,
      checked_in: reservations.filter((item) => item.status === "checked_in").length,
      seated: reservations.filter((item) => item.status === "seated").length,
      history: reservations.filter((item) => isHistory(item.status)).length
    };
  }, [reservations]);

  const normalizedSearchTerm = searchTerm.trim().toLocaleLowerCase("vi-VN");
  const hasSearch = normalizedSearchTerm.length > 0;

  const visibleReservations = useMemo(() => {
    return reservations.filter((reservation) => {
      const matchesFilter =
        filter === "today"
          ? !isHistory(reservation.status)
          : filter === "history"
            ? isHistory(reservation.status)
            : reservation.status === filter;
      return matchesFilter && matchesReservationSearch(reservation, normalizedSearchTerm);
    });
  }, [reservations, filter, normalizedSearchTerm]);

  const operationalQueues = useMemo(() => {
    const activeReservations = reservations.filter((reservation) => !isHistory(reservation.status));
    const soonestStart = (left: ReservationDto, right: ReservationDto) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
    const soonestHold = (left: ReservationDto, right: ReservationDto) =>
      new Date(left.holdExpiresAt ?? left.startsAt).getTime() - new Date(right.holdExpiresAt ?? right.startsAt).getTime();

    const waitingDeposits = activeReservations
      .filter((reservation) => reservation.status === "waiting_deposit_confirm" && reservation.depositStatus === "waiting_confirm")
      .sort(soonestHold);
    const expiringHolds = activeReservations
      .filter((reservation) => ["holding", "waiting_deposit_confirm"].includes(reservation.status) && reservation.holdExpiresAt)
      .filter((reservation) => minutesUntil(reservation.holdExpiresAt ?? reservation.startsAt, clockTick) <= 15)
      .sort(soonestHold);
    const upcomingArrivals = activeReservations
      .filter((reservation) => reservation.status === "confirmed" || reservation.status === "checked_in")
      .filter((reservation) => {
        const minutes = minutesUntil(reservation.startsAt, clockTick);
        return minutes <= 60 && !canMarkNoShow(reservation, settings.reservation_arrival_grace_minutes, clockTick);
      })
      .sort(soonestStart);
    const noShowCandidates = activeReservations
      .filter((reservation) => canMarkNoShow(reservation, settings.reservation_arrival_grace_minutes, clockTick))
      .sort(soonestStart);

    return [
      {
        key: "deposit",
        title: "Cọc chờ xác nhận",
        helper: waitingDeposits.length > 0 ? "Đối soát VietQR trước khi giữ chắc bàn" : "Không có cọc treo",
        tone: waitingDeposits.length > 0 ? "yellow" : "green",
        icon: Banknote,
        reservations: waitingDeposits
      },
      {
        key: "hold",
        title: "Giữ chỗ sắp hết",
        helper: expiringHolds.length > 0 ? "Nhắc khách hoặc mở lại slot kịp thời" : "Hold đang ổn",
        tone: expiringHolds.length > 0 ? "yellow" : "green",
        icon: TimerReset,
        reservations: expiringHolds
      },
      {
        key: "arrival",
        title: "Khách sắp đến",
        helper: upcomingArrivals.length > 0 ? "Chuẩn bị bàn, QR và nhân sự đón khách" : "Chưa có khách sát giờ",
        tone: upcomingArrivals.length > 0 ? "blue" : "green",
        icon: CalendarClock,
        reservations: upcomingArrivals
      },
      {
        key: "no-show",
        title: "Trễ hẹn",
        helper: noShowCandidates.length > 0 ? "Cần gọi lại hoặc đánh dấu không đến" : "Không có lịch trễ",
        tone: noShowCandidates.length > 0 ? "red" : "green",
        icon: AlertCircle,
        reservations: noShowCandidates
      }
    ] satisfies Array<{
      key: string;
      title: string;
      helper: string;
      tone: "green" | "yellow" | "blue" | "red";
      icon: typeof Banknote;
      reservations: ReservationDto[];
    }>;
  }, [clockTick, reservations, settings.reservation_arrival_grace_minutes]);

  const pressureCount = operationalQueues.reduce((sum, queue) => sum + queue.reservations.length, 0);
  const pressureTone = operationalQueues.some((queue) => queue.tone === "red" && queue.reservations.length > 0)
    ? "red"
    : operationalQueues.some((queue) => queue.tone === "yellow" && queue.reservations.length > 0)
      ? "yellow"
      : operationalQueues.some((queue) => queue.tone === "blue" && queue.reservations.length > 0)
        ? "blue"
        : "green";
  const pressureLabel = pressureCount > 0 ? `${pressureCount} việc cần xử lý` : "Ca đặt bàn ổn định";
  const primaryQueueReservation = operationalQueues.find((queue) => queue.reservations.length > 0)?.reservations[0] ?? null;

  const timelineGroups = useMemo(() => {
    const groups = new Map<string, ReservationDto[]>();
    for (const reservation of visibleReservations) {
      const key = reservationHourLabel(reservation.startsAt);
      const group = groups.get(key) ?? [];
      group.push(reservation);
      groups.set(key, group);
    }

    return Array.from(groups.entries())
      .sort(([left], [right]) => left.localeCompare(right, "vi"))
      .map(([hour, items]) => ({
        hour,
        items: items.sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())
      }));
  }, [visibleReservations]);

  const floorReservations = useMemo(
    () => visibleReservations.filter((reservation) => filter !== "history" && isFloorActiveReservation(reservation)),
    [filter, visibleReservations]
  );

  const reservationsByTableId = useMemo(() => {
    const next = new Map<string, ReservationDto[]>();
    for (const reservation of floorReservations) {
      for (const table of reservation.tables) {
        const list = next.get(table.id) ?? [];
        list.push(reservation);
        next.set(table.id, list);
      }
    }

    for (const list of next.values()) {
      list.sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
    }
    return next;
  }, [floorReservations]);

  const floorGroups = useMemo(() => {
    const groups = new Map<string, ReservationTableOption[]>();
    for (const table of tableOptions) {
      const floor = table.floorLabel || "Tầng trệt";
      const list = groups.get(floor) ?? [];
      list.push(table);
      groups.set(floor, list);
    }

    return Array.from(groups.entries())
      .sort(([left], [right]) => left.localeCompare(right, "vi"))
      .map(([floor, tables]) => ({
        floor,
        tables: tables.sort((left, right) => {
          const areaDiff = left.area.localeCompare(right.area, "vi");
          if (areaDiff !== 0) return areaDiff;
          return left.name.localeCompare(right.name, "vi");
        })
      }));
  }, [tableOptions]);

  const loadReservations = useCallback(async (nextDate = date, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ date: nextDate });
      const response = await fetch(`/api/admin/reservations?${params.toString()}`);
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tải được lịch đặt bàn.");
      const nextReservations = json.data as ReservationDto[];
      setReservations(nextReservations);
      setSelectedId((current) => (current && nextReservations.some((item) => item.id === current) ? current : nextReservations[0]?.id ?? null));
      setLastSyncedAt(new Date());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không tải được lịch đặt bàn.");
    } finally {
      setLoading(false);
    }
  }, [date]);

  const loadAnalytics = useCallback(async (silent = false) => {
    try {
      const response = await fetch("/api/admin/reservations/analytics");
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tải được analytics đặt bàn.");
      setAnalyticsSnapshot(json.data as ReservationAnalytics);
    } catch (analyticsError) {
      if (!silent) {
        setError(analyticsError instanceof Error ? analyticsError.message : "Không tải được analytics đặt bàn.");
      }
    }
  }, []);

  const tableAssignmentOptions = useMemo(() => {
    if (!selected) return [];
    return tableOptions.filter(
      (table) =>
        table.isBookable !== false &&
        !table.isHidden &&
        !table.isUnderMaintenance
    );
  }, [selected, tableOptions]);
  const rescheduleTableOptions = useMemo(() => {
    if (!selected) return [];
    return tableOptions.filter(
      (table) =>
        table.capacity >= selected.partySize &&
        table.isBookable !== false &&
        !table.isHidden &&
        !table.isUnderMaintenance
    );
  }, [selected, tableOptions]);

  const selectedRescheduleTableId = rescheduleTableOptions.some((table) => table.id === rescheduleTableId)
    ? rescheduleTableId
    : "";
  const selectedTableSelectionIds = tableSelectionIds.filter((tableId) => tableAssignmentOptions.some((table) => table.id === tableId));
  const selectedAssignmentTables = tableAssignmentOptions.filter((table) => selectedTableSelectionIds.includes(table.id));
  const selectedAssignmentCapacity = selectedAssignmentTables.reduce((total, table) => total + table.capacity, 0);
  const canSaveTableAssignment = Boolean(selected) && selectedTableSelectionIds.length > 0 && selectedAssignmentCapacity >= (selected?.partySize ?? 0);
  const assignedTableOption = selected?.tables[0]?.id
    ? tableOptions.find((table) => table.id === selected.tables[0]?.id) ?? null
    : null;
  const selectedTableQrUrl = assignedTableOption ? tableQrUrl(settings.slug, assignedTableOption) : null;
  const selectedTableQrEnabled = assignedTableOption?.qrEnabled !== false;
  const analyticsPeakMax = Math.max(...analyticsSnapshot.peakHours.map((item) => item.reservations), 1);
  const analyticsAreaMax = Math.max(...analyticsSnapshot.topAreas.map((item) => item.reservations), 1);
  const analyticsArrivalCount = analyticsSnapshot.statusCounts.checked_in + analyticsSnapshot.statusCounts.seated + analyticsSnapshot.statusCounts.completed;
  const analyticsConfirmedCount =
    analyticsSnapshot.statusCounts.confirmed +
    analyticsSnapshot.statusCounts.checked_in +
    analyticsSnapshot.statusCounts.seated +
    analyticsSnapshot.statusCounts.completed +
    analyticsSnapshot.statusCounts.no_show;
  const analyticsHighlights = [
    {
      label: "Tỷ lệ xác nhận",
      value: formatPercent(analyticsSnapshot.confirmedRate),
      helper: `${formatNumber(analyticsConfirmedCount, 0)}/${formatNumber(analyticsSnapshot.totalReservations, 0)} lịch`,
      icon: Check
    },
    {
      label: "Khách đến",
      value: formatPercent(analyticsSnapshot.arrivalRate),
      helper: `${formatNumber(analyticsArrivalCount, 0)} lịch đã check-in/vào bàn`,
      icon: UserRoundCheck
    },
    {
      label: "No-show",
      value: formatPercent(analyticsSnapshot.noShowRate),
      helper: `${formatNumber(analyticsSnapshot.statusCounts.no_show, 0)} lịch không đến`,
      icon: AlertCircle
    },
    {
      label: "Bàn vừa sức chứa",
      value: formatPercent(analyticsSnapshot.capacity.tightFitRate),
      helper: `Dư TB ${formatNumber(analyticsSnapshot.capacity.averageUnusedSeats)} ghế`,
      icon: Table2
    },
    {
      label: "Đặt trước TB",
      value: formatLeadHours(analyticsSnapshot.leadTime.averageHours),
      helper: `${formatPercent(analyticsSnapshot.leadTime.sameDayRate)} lịch trong ngày`,
      icon: Clock3
    },
    {
      label: "Cọc đã nhận",
      value: formatPercent(analyticsSnapshot.deposit.paidRate),
      helper: `${formatVnd(analyticsSnapshot.deposit.paidAmount)}/${formatVnd(analyticsSnapshot.deposit.requiredAmount)}`,
      icon: Banknote
    }
  ];

  async function runAction(action: ReservationAction, reservationId: string, body?: Record<string, string | string[] | undefined>) {
    setMutatingId(reservationId);
    setError(null);
    try {
      const response = await fetch(actionEndpoint(action, reservationId), {
        method: "POST",
        ...(body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body)
            }
          : {})
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Thao tác thất bại.");
      const updated = json.data as ReservationDto;
      setReservations((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedId(updated.id);
      setLastSyncedAt(new Date());
      primeReservationControls(updated);
      void loadAnalytics(true);
      return updated;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Thao tác thất bại.");
      return null;
    } finally {
      setMutatingId(null);
    }
  }

  async function submitReschedule() {
    if (!selected) return;
    const startsAt = localDateTimeToIso(rescheduleDate, rescheduleTime);
    if (!startsAt) {
      setError("Vui lòng chọn ngày và giờ mới hợp lệ.");
      return;
    }
    const updated = await runAction("reschedule", selected.id, {
      startsAt,
      tableId: selectedRescheduleTableId || undefined
    });
    if (updated) {
      setDate(rescheduleDate);
      await loadReservations(rescheduleDate, true);
    }
  }

  async function submitTableAssignment() {
    if (!selected) return;
    if (!canSaveTableAssignment) {
      setError("Nhóm bàn đã chọn chưa đủ sức chứa cho số khách của lịch đặt.");
      return;
    }
    const updated = await runAction("tables", selected.id, { tableIds: selectedTableSelectionIds });
    if (updated) await loadReservations(date, true);
  }

  function toggleTableSelection(tableId: string) {
    setTableSelectionIds((current) => {
      if (current.includes(tableId)) return current.filter((item) => item !== tableId);
      if (current.length >= 8) return current;
      return [...current, tableId];
    });
  }

  function primeReservationControls(reservation: ReservationDto) {
    const parts = localInputParts(reservation.startsAt);
    setRescheduleDate(parts.date);
    setRescheduleTime(parts.time);
    setRescheduleTableId(reservation.tables[0]?.id ?? "");
    setTableSelectionIds(reservation.tables.map((table) => table.id));
  }

  function openReservationDetail(reservation: ReservationDto) {
    setSelectedId(reservation.id);
    primeReservationControls(reservation);
    setDrawer("detail");
  }

  async function copyPublicUrl() {
    await navigator.clipboard.writeText(publicUrl);
  }

  async function copyTableQrUrl() {
    if (!selectedTableQrUrl || !assignedTableOption) return;
    await navigator.clipboard.writeText(selectedTableQrUrl);
    setCopiedTableQrId(assignedTableOption.id);
  }

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        router.refresh();
        void loadReservations(date, true);
        void loadAnalytics(true);
      }, 280);
    };

    const channel = supabase
      .channel(`admin-reservations:${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations", filter: `restaurant_id=eq.${restaurantId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservation_table_locks", filter: `restaurant_id=eq.${restaurantId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "tables", filter: `restaurant_id=eq.${restaurantId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "table_bills", filter: `restaurant_id=eq.${restaurantId}` }, scheduleRefresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeState("connected");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtimeState("error");
      });

    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [date, loadAnalytics, loadReservations, restaurantId, router]);

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <section className="admin-hero-panel rounded-[14px] p-4">
            <div className="relative z-[1] grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={settings.reservations_enabled ? "green" : "yellow"}>{settings.reservations_enabled ? "Đang nhận đặt bàn" : "Đang tắt đặt bàn"}</Badge>
                  <Badge tone={realtimeState === "connected" ? "green" : realtimeState === "error" ? "red" : "yellow"}>
                    <span className="inline-flex items-center gap-1.5">
                      <RadioTower size={13} />
                      {realtimeLabel(realtimeState)}
                    </span>
                  </Badge>
                  <Badge tone={pressureTone}>{pressureLabel}</Badge>
                  <Badge tone={settings.reservation_deposit_enabled ? "blue" : "neutral"}>
                    {settings.reservation_deposit_enabled ? "Cọc VietQR đang bật" : "Không bắt buộc cọc"}
                  </Badge>
                </div>
                <h1 className="dashboard-page-title mt-3">Đặt bàn trước</h1>
                <p className="dashboard-body-copy mt-2 max-w-3xl">
                  Điều phối lịch giữ bàn, cọc VietQR, khách sắp đến và QR gọi món trong một màn đủ nhanh cho ca cao điểm.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/85 p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3 text-sm font-semibold text-[var(--muted-foreground)]">
                  <span>Cập nhật</span>
                  <strong className="text-[var(--foreground)]">{formatSyncedClock(lastSyncedAt)}</strong>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (primaryQueueReservation) {
                        openReservationDetail(primaryQueueReservation);
                        return;
                      }
                      setFilter("today");
                    }}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--primary-strong)] px-3 text-sm font-semibold text-[var(--background)]"
                  >
                    <Flame size={15} />
                    Ưu tiên
                  </button>
                  <button
                    type="button"
                    onClick={() => void Promise.all([loadReservations(date), loadAnalytics()])}
                    disabled={loading}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--primary)] disabled:opacity-60"
                  >
                    <RefreshCw size={15} className={loading ? "animate-spin" : undefined} />
                    Làm mới
                  </button>
                  <Button type="button" variant="secondary" onClick={() => setDrawer("settings")} className="col-span-1">
                    <Settings2 size={16} />
                    Cấu hình
                  </Button>
                  <Button type="button" onClick={() => setDrawer("share")} className="col-span-1">
                    <QrCode size={16} />
                    Link đặt bàn
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {[
                { label: "Tổng lịch", value: stats.total, icon: CalendarCheck },
                { label: "Đang giữ", value: stats.holding, icon: Clock3 },
                { label: "Chờ cọc", value: stats.waitingDeposit, icon: Banknote },
                { label: "Đã xác nhận", value: stats.confirmed, icon: Check },
                { label: "Đã check-in", value: stats.checkedIn, icon: UserRoundCheck },
                { label: "Đã đến", value: stats.seated, icon: Sofa }
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.label} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                    <span className="dashboard-stat-icon"><Icon size={17} /></span>
                    <p className="mt-3 text-xs font-semibold uppercase text-[var(--muted-foreground)]">{item.label}</p>
                    <p className="metric-number mt-1 text-2xl font-semibold text-[var(--foreground)]">{item.value}</p>
                  </article>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-2">
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--primary)] text-white">
                    <ShieldCheck size={16} />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--foreground)]">Hàng ưu tiên trong ca</h2>
                    <p className="text-xs font-medium text-[var(--muted-foreground)]">Gom các lịch cần xử lý trước để không miss khách, cọc hoặc bàn sát giờ.</p>
                  </div>
                </div>
                <span className="metric-number rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--foreground)]">
                  {pressureCount} việc
                </span>
              </div>

              <div className="grid gap-2 lg:grid-cols-4">
                {operationalQueues.map((queue) => {
                  const Icon = queue.icon;
                  const firstReservation = queue.reservations[0] ?? null;
                  return (
                    <button
                      key={queue.key}
                      type="button"
                      onClick={() => firstReservation && openReservationDetail(firstReservation)}
                      disabled={!firstReservation}
                      className={`min-h-[132px] rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)] disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:shadow-none ${
                        queue.reservations.length > 0
                          ? queue.tone === "red"
                            ? "border-[var(--tertiary)]/20 bg-[var(--danger-soft)] text-[var(--tertiary)]"
                            : queue.tone === "yellow"
                              ? "border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                              : queue.tone === "blue"
                                ? "border-[var(--secondary)]/25 bg-[var(--secondary-soft)] text-[var(--primary)]"
                                : "border-[var(--primary)]/18 bg-[var(--primary-soft)] text-[var(--primary)]"
                          : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--surface)]/75">
                          <Icon size={18} />
                        </span>
                        <span className="metric-number rounded-lg bg-[var(--surface)]/80 px-2.5 py-1 text-xs font-semibold">{queue.reservations.length}</span>
                      </div>
                      <p className="mt-3 text-sm font-semibold">{queue.title}</p>
                      <p className="mt-1 text-xs font-semibold leading-5 opacity-80">{queue.helper}</p>
                      {firstReservation ? (
                        <p className="mt-2 truncate text-xs font-semibold">
                          {firstReservation.customerName} · {minuteDistanceLabel(firstReservation.startsAt, clockTick)}
                        </p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="blue">Analytics {analyticsSnapshot.windowDays} ngày</Badge>
                    {analyticsSnapshot.deposit.waitingConfirmCount > 0 ? <Badge tone="yellow">{analyticsSnapshot.deposit.waitingConfirmCount} cọc chờ xác nhận</Badge> : null}
                  </div>
                  <h2 className="mt-2 text-lg font-semibold text-[var(--foreground)]">Tín hiệu vận hành đặt bàn</h2>
                  <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">
                    {formatNumber(analyticsSnapshot.totalReservations, 0)} lịch · {formatNumber(analyticsSnapshot.totalGuests, 0)} khách · nhóm trung bình {formatNumber(analyticsSnapshot.averagePartySize)} khách
                  </p>
                </div>
                <Badge tone={analyticsSnapshot.cancellationRate >= 20 ? "yellow" : "green"}>Huỷ/từ chối {formatPercent(analyticsSnapshot.cancellationRate)}</Badge>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {analyticsHighlights.map((item) => {
                  const Icon = item.icon;
                  return (
                    <article key={item.label} className="min-h-[118px] rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">{item.label}</p>
                          <p className="metric-number mt-2 text-2xl font-semibold text-[var(--foreground)]">{item.value}</p>
                        </div>
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
                          <Icon size={17} />
                        </span>
                      </div>
                      <p className="mt-2 text-xs font-semibold leading-5 text-[var(--muted-foreground)]">{item.helper}</p>
                    </article>
                  );
                })}
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--foreground)]">Khung giờ cao điểm</p>
                    <Badge tone="neutral">Theo lượt đặt</Badge>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {analyticsSnapshot.peakHours.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-3 text-sm font-semibold text-[var(--muted-foreground)]">Chưa có dữ liệu trong kỳ.</p>
                    ) : (
                      analyticsSnapshot.peakHours.map((item) => (
                        <div key={item.label} className="grid gap-1">
                          <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[var(--muted-foreground)]">
                            <span>{item.label}</span>
                            <span>{item.reservations} lịch · {item.guests} khách</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-[var(--surface)]">
                            <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${Math.max(12, (item.reservations / analyticsPeakMax) * 100)}%` }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--foreground)]">Khu vực được đặt nhiều</p>
                    <Badge tone="neutral">{analyticsSnapshot.capacity.assignedReservations} lịch có bàn</Badge>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {analyticsSnapshot.topAreas.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-3 text-sm font-semibold text-[var(--muted-foreground)]">Chưa có lịch gắn bàn trong kỳ.</p>
                    ) : (
                      analyticsSnapshot.topAreas.map((item) => (
                        <div key={item.label} className="grid gap-1">
                          <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[var(--muted-foreground)]">
                            <span className="truncate">{item.label}</span>
                            <span className="shrink-0">{item.reservations} lịch · {item.guests} khách</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-[var(--surface)]">
                            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(12, (item.reservations / analyticsAreaMax) * 100)}%` }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="dashboard-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--foreground)]">Lịch vận hành</h2>
                <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">
                  {visibleReservations.length}/{reservations.length} lịch trong ngày{hasSearch ? " theo tìm kiếm" : ""}.
                </p>
              </div>
              <Badge tone={realtimeState === "connected" ? "green" : realtimeState === "error" ? "red" : "yellow"}>
                <RadioTower size={13} />
                {realtimeLabel(realtimeState)}
              </Badge>
            </div>

            <div className="mt-4 grid gap-2 lg:grid-cols-[180px_minmax(0,1fr)_auto]">
                <Input
                  type="date"
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                    void loadReservations(event.target.value);
                  }}
                  aria-label="Chọn ngày đặt bàn"
                />
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" size={16} />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Tìm khách, SĐT, bàn, mã lịch..."
                  aria-label="Tìm lịch đặt bàn"
                  className="pl-9"
                />
              </label>
              <button
                type="button"
                onClick={() => void Promise.all([loadReservations(date), loadAnalytics()])}
                disabled={loading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--primary)] disabled:opacity-60"
              >
                {loading ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
                Tải lại
              </button>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-1.5">
              {[
                ["today", "Đang mở"],
                ["holding", "Đang giữ"],
                ["waiting_deposit_confirm", "Chờ cọc"],
                ["confirmed", "Đã xác nhận"],
                ["checked_in", "Check-in"],
                ["seated", "Đã đến"],
                ["history", "Lịch sử"]
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key as FilterKey)}
                  aria-pressed={filter === key}
                  className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold transition ${filter === key ? "bg-[var(--surface)] text-[var(--primary)]" : "text-[var(--muted-foreground)]"}`}
                >
                  {label}
                  <span className="metric-number rounded bg-[var(--surface)]/80 px-1.5 py-0.5 text-[11px]">{filterCounts[key as FilterKey]}</span>
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-1.5">
              {[
                { key: "list", label: "Danh sách", icon: LayoutList },
                { key: "timeline", label: "Timeline", icon: Rows3 },
                { key: "floor", label: "Sơ đồ bàn", icon: Table2 }
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setViewMode(item.key as ViewMode)}
                    aria-pressed={viewMode === item.key}
                    className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
                      viewMode === item.key ? "bg-[var(--surface)] text-[var(--primary)] shadow-sm" : "text-[var(--muted-foreground)]"
                    }`}
                  >
                    <Icon size={15} />
                    <span className="hidden sm:inline">{item.label}</span>
                  </button>
                );
              })}
            </div>

            {error ? <p className="mt-4 rounded-xl bg-[var(--danger-soft)] p-3 text-sm font-semibold text-[var(--accent-strong)]">{error}</p> : null}

            {viewMode === "list" ? <div className="mt-4 grid gap-2">
              {visibleReservations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-8 text-center text-sm font-semibold text-[var(--muted-foreground)]">
                  {hasSearch ? "Không tìm thấy lịch phù hợp từ khóa." : "Chưa có lịch đặt phù hợp bộ lọc."}
                </div>
              ) : (
                visibleReservations.map((reservation) => {
                  const countdown = holdCountdown(reservation, clockTick);
                  const isLate = canMarkNoShow(reservation, settings.reservation_arrival_grace_minutes, clockTick);
                  const isSelected = selectedId === reservation.id;
                  return (
                    <button
                      key={reservation.id}
                      type="button"
                      onClick={() => openReservationDetail(reservation)}
                      aria-pressed={isSelected}
                      className={`grid gap-3 rounded-xl border bg-[var(--surface)] p-4 text-left transition hover:border-[var(--primary)] md:grid-cols-[minmax(0,1fr)_auto] ${
                        isSelected ? "border-[var(--primary)] shadow-[var(--shadow-soft)]" : "border-[var(--border)]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[var(--foreground)]">{reservation.customerName}</span>
                          <Badge tone={statusTone(reservation.status)}>{reservationStatusLabel(reservation.status)}</Badge>
                          <Badge tone={reservation.depositStatus === "paid" ? "green" : reservation.depositStatus === "waiting_confirm" ? "yellow" : "neutral"}>
                            {reservationDepositStatusLabel(reservation.depositStatus)}
                          </Badge>
                          {isLate ? <Badge tone="red">Trễ hẹn</Badge> : null}
                          {countdown ? <Badge tone={countdown === "Đã hết hạn" ? "red" : "yellow"}>Hold {countdown}</Badge> : null}
                          {reservation.tables.length === 0 ? <Badge tone="yellow">Chưa gán bàn</Badge> : null}
                        </div>
                        <p className="mt-2 text-sm font-medium text-[var(--muted-foreground)]">
                          {formatTime(reservation.startsAt)} · {minuteDistanceLabel(reservation.startsAt, clockTick)} · {reservation.partySize} khách · {reservation.tables.map((table) => table.name).join(", ") || "Chưa có bàn"}
                        </p>
                        <p className="mt-1 truncate text-xs font-semibold text-[var(--muted-foreground)]">
                          {reservationSourceLabel(reservation.source)} · {reservationPreferenceLabel(reservation, areaNameById)}
                        </p>
                      </div>
                      <div className="text-left md:text-right">
                        <p className="metric-number font-semibold text-[var(--foreground)]">{reservation.depositRequiredAmount > 0 ? formatVnd(reservation.depositRequiredAmount) : "Không cọc"}</p>
                        <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">{shortId(reservation.id)}</p>
                        <p className="mt-1 text-xs font-semibold text-[var(--primary)]">{reservationTimeRange(reservation)}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div> : null}

            {viewMode === "timeline" ? (
              <div className="mt-4 grid gap-3">
                {timelineGroups.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-8 text-center text-sm font-semibold text-[var(--muted-foreground)]">
                    Chưa có mốc giờ phù hợp bộ lọc.
                  </div>
                ) : (
                  timelineGroups.map((group) => (
                    <section key={group.hour} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                        <div className="flex items-center gap-2">
                          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
                            <Clock3 size={16} />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-[var(--foreground)]">{group.hour}</p>
                            <p className="text-xs font-semibold text-[var(--muted-foreground)]">{group.items.length} lịch trong khung này</p>
                          </div>
                        </div>
                        {group.items.length >= 3 ? <Badge tone="yellow">Cao điểm</Badge> : <Badge tone="neutral">Ổn định</Badge>}
                      </div>

                      <div className="mt-3 grid gap-2">
                        {group.items.map((reservation) => (
                          <button
                            key={reservation.id}
                            type="button"
                            onClick={() => openReservationDetail(reservation)}
                            aria-pressed={selectedId === reservation.id}
                            className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-left transition hover:border-[var(--primary)] md:grid-cols-[120px_minmax(0,1fr)_auto]"
                          >
                            <div>
                              <p className="text-sm font-semibold text-[var(--foreground)]">{reservationTimeRange(reservation)}</p>
                              <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">{shortId(reservation.id)}</p>
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-[var(--foreground)]">{reservation.customerName}</span>
                                <Badge tone={statusTone(reservation.status)}>{reservationStatusLabel(reservation.status)}</Badge>
                              </div>
                              <p className="mt-1 truncate text-sm font-medium text-[var(--muted-foreground)]">
                                {reservation.partySize} khách · {reservation.tables.map((table) => table.name).join(", ") || "Chưa có bàn"} · {reservationPreferenceLabel(reservation, areaNameById)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 md:justify-end">
                              {reservation.depositRequiredAmount > 0 ? <Badge tone={reservation.depositStatus === "paid" ? "green" : "yellow"}>{reservationDepositStatusLabel(reservation.depositStatus)}</Badge> : null}
                              {canMarkNoShow(reservation, settings.reservation_arrival_grace_minutes, clockTick) ? <Badge tone="red">Trễ hẹn</Badge> : null}
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </div>
            ) : null}

            {viewMode === "floor" ? (
              <div className="mt-4 grid gap-3">
                {filter === "history" ? (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-sm font-semibold text-[var(--muted-foreground)]">
                    Sơ đồ bàn dùng cho lịch đang vận hành trong ngày. Chọn bộ lọc đang mở hoặc một trạng thái hiện hành để xem bàn giữ chỗ.
                  </div>
                ) : null}
                {floorGroups.map((group) => (
                  <section key={group.floor} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--foreground)]">{group.floor}</h3>
                        <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">{group.tables.length} bàn · {group.tables.filter((table) => reservationsByTableId.has(table.id)).length} đang giữ lịch</p>
                      </div>
                      <Badge tone="neutral">{group.tables.filter((table) => table.isBookable !== false && !table.isHidden && !table.isUnderMaintenance).length} bàn nhận đặt</Badge>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {group.tables.map((table) => {
                        const tableReservations = reservationsByTableId.get(table.id) ?? [];
                        const nextReservation = tableReservations[0] ?? null;
                        const disabled = table.isHidden || table.isUnderMaintenance || table.isBookable === false;
                        return (
                          <button
                            key={table.id}
                            type="button"
                            onClick={() => {
                              if (!nextReservation) return;
                              openReservationDetail(nextReservation);
                            }}
                            className={`min-h-[136px] rounded-xl border p-3 text-left transition ${
                              nextReservation
                                ? "border-[var(--primary)] bg-[var(--primary-soft)] hover:border-[var(--primary-strong)]"
                                : disabled
                                  ? "border-[var(--border)] bg-[var(--soft-surface)] opacity-70"
                                  : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary)]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[var(--foreground)]">{table.name}</p>
                                <p className="mt-1 truncate text-xs font-semibold text-[var(--muted-foreground)]">{table.area} · {table.capacity} khách</p>
                              </div>
                              <Badge tone={nextReservation ? statusTone(nextReservation.status) : tableOperationalTone(table)}>
                                {nextReservation ? reservationStatusLabel(nextReservation.status) : tableOperationalLabel(table)}
                              </Badge>
                            </div>

                            {nextReservation ? (
                              <div className="mt-3 rounded-lg border border-[var(--primary)]/15 bg-[var(--surface)] p-2">
                                <p className="truncate text-sm font-semibold text-[var(--foreground)]">{nextReservation.customerName}</p>
                                <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">{reservationTimeRange(nextReservation)} · {nextReservation.partySize} khách</p>
                                {tableReservations.length > 1 ? <p className="mt-1 text-xs font-semibold text-[var(--primary)]">+{tableReservations.length - 1} lịch sau đó</p> : null}
                              </div>
                            ) : (
                              <div className="mt-3 grid gap-1 text-xs font-semibold text-[var(--muted-foreground)]">
                                <p>{tableKindLabels[table.tableKind ?? ""] ?? "Bàn tiêu chuẩn"} · {seatingZoneLabels[table.seatingZone ?? ""] ?? "Không gian linh hoạt"}</p>
                                {table.activeOrderCount ? (
                                  <p>{table.activeOrderCount} đơn đang gắn bàn</p>
                                ) : table.activeReservationCount ? (
                                  <p>{table.activeReservationCount} lịch đã vào bàn</p>
                                ) : table.activeBillCount ? (
                                  <p>{table.activeBillCount} phiên bàn đang mở</p>
                                ) : (
                                  <p>Chưa có lịch giữ bàn theo bộ lọc</p>
                                )}
                                {table.unpaidTotal ? <p className="text-[var(--accent-strong)]">{formatVnd(table.unpaidTotal)} chưa thanh toán</p> : null}
                              </div>
                            )}

                            {disabled ? (
                              <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-strong)]">
                                <AlertCircle size={13} />
                                Không nhận đặt trước
                              </p>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        <aside className="hidden xl:block">
          <section className="dashboard-panel sticky top-[92px] p-4">
            <div className="flex items-center gap-2">
              <UsersRound className="text-[var(--primary)]" size={18} />
              <h2 className="text-lg font-semibold text-[var(--foreground)]">Tác vụ nhanh</h2>
            </div>
            <div className="mt-4 grid gap-2">
              <RestaurantVisitMapCard
                compact
                restaurant={{
                  name: settings.name,
                  address: settings.address,
                  storeLat: settings.store_lat,
                  storeLng: settings.store_lng,
                  hotline: settings.hotline
                }}
                title="Bản đồ khách đặt bàn"
                description="Kiểm tra nhanh trải nghiệm chỉ đường mà khách thấy trên trang đặt bàn."
              />
              <button type="button" onClick={() => setDrawer("share")} className="inline-flex min-h-11 items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground)]">
                Link đặt bàn cho khách
                <ExternalLink size={16} />
              </button>
              <button type="button" onClick={() => setDrawer("settings")} className="inline-flex min-h-11 items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground)]">
                Cấu hình nhận cọc
                <Settings2 size={16} />
              </button>
            </div>
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-sm font-semibold text-[var(--muted-foreground)]">
              Lịch cọc hết hạn sẽ tự mở lại khi hệ thống kiểm tra trạng thái hoặc khi khách xem khung giờ.
            </div>
          </section>
        </aside>
      </div>

      {drawer !== "closed" ? (
        <div className="fixed inset-0 z-[var(--z-dashboard-drawer)] overflow-hidden overscroll-contain">
          <button type="button" className="drawer-backdrop absolute inset-0 z-0" aria-label="Đóng đặt bàn" onClick={() => setDrawer("closed")} />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="reservation-drawer-title"
            className="drawer-panel ml-auto flex h-dvh max-h-dvh w-full max-w-xl flex-col border-l border-[var(--border)] bg-[var(--surface)]"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5 sm:py-4">
              <div>
                <p className="dashboard-eyebrow text-[var(--muted-foreground)]">
                  {drawer === "settings" ? "Cấu hình" : drawer === "share" ? "Chia sẻ" : "Chi tiết"}
                </p>
                <h2 id="reservation-drawer-title" className="dashboard-section-title mt-1">
                  {drawer === "settings" ? "Thiết lập đặt bàn" : drawer === "share" ? "Link đặt bàn" : "Chi tiết lịch đặt"}
                </h2>
              </div>
              <button type="button" onClick={() => setDrawer("closed")} className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted-foreground)]" aria-label="Đóng">
                <X size={17} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-5">
              {drawer === "settings" ? <SettingsDrawer settings={settings} /> : null}

              {drawer === "share" ? (
                <div className="grid gap-4">
                  <RestaurantVisitMapCard
                    compact
                    restaurant={{
                      name: settings.name,
                      address: settings.address,
                      storeLat: settings.store_lat,
                      storeLng: settings.store_lng,
                      hotline: settings.hotline
                    }}
                    title="Preview bản đồ đặt bàn"
                    description="Nếu thiếu tọa độ, cập nhật vị trí quán trước khi in QR hoặc chia sẻ link đặt bàn."
                  />
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                    <p className="text-sm font-semibold text-[var(--muted-foreground)]">Link cho khách đặt bàn trước</p>
                    <code className="mt-3 block overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm font-semibold text-[var(--foreground)]">{publicUrl}</code>
                    <div className="mx-auto mt-4 w-full max-w-[260px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/api/admin/reservation-qr?size=520" alt="QR đặt bàn trước" className="mx-auto aspect-square w-full rounded-xl object-contain" />
                      <p className="mt-3 text-sm font-semibold text-[var(--muted-foreground)]">QR dẫn khách tới trang đặt bàn</p>
                    </div>
                    <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
                      <Button type="button" variant="secondary" onClick={copyPublicUrl}>
                        <Copy size={16} />
                        Sao chép link
                      </Button>
                      <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--primary)]">
                        <ExternalLink size={16} />
                        Mở trang khách
                      </a>
                      <a href="/api/admin/reservation-qr?size=1200&download=1" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--primary)]">
                        <QrCode size={16} />
                        Tải QR
                      </a>
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm font-semibold text-[var(--muted-foreground)]">
                    Bước tiếp theo có thể sinh QR riêng cho đặt bàn để in standee, đặt ở fanpage hoặc chạy quảng cáo.
                  </div>
                </div>
              ) : null}

              {drawer === "detail" && selected ? (
                <div className="grid gap-4">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--muted-foreground)]">{shortId(selected.id)}</p>
                        <h3 className="mt-1 text-xl font-semibold text-[var(--foreground)]">{selected.customerName}</h3>
                      </div>
                      <Badge tone={statusTone(selected.status)}>{reservationStatusLabel(selected.status)}</Badge>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm font-semibold sm:grid-cols-2">
                      <p><span className="text-[var(--muted-foreground)]">Thời gian:</span> {formatTime(selected.startsAt)}</p>
                      <p><span className="text-[var(--muted-foreground)]">Số khách:</span> {selected.partySize}</p>
                      <p><span className="text-[var(--muted-foreground)]">Điện thoại:</span> {selected.customerPhone}</p>
                      <p><span className="text-[var(--muted-foreground)]">Email:</span> {selected.customerEmail || "Chưa có"}</p>
                      <p><span className="text-[var(--muted-foreground)]">Bàn giữ:</span> {selected.tables.map((table) => table.name).join(", ") || "Chưa có"}</p>
                      <p><span className="text-[var(--muted-foreground)]">Ưu tiên:</span> {reservationPreferenceLabel(selected, areaNameById)}</p>
                      <p><span className="text-[var(--muted-foreground)]">Nguồn:</span> {reservationSourceLabel(selected.source)}</p>
                      <p><span className="text-[var(--muted-foreground)]">Còn/trễ:</span> {minuteDistanceLabel(selected.startsAt, clockTick)}</p>
                      <p><span className="text-[var(--muted-foreground)]">Hết hạn cọc:</span> {holdCountdown(selected, clockTick) ?? "Không áp dụng"}</p>
                    </div>
                    {selected.customerNote ? <p className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm font-semibold text-[var(--muted-foreground)]">{selected.customerNote}</p> : null}
                  </div>

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                      <Banknote size={16} className="text-[var(--primary)]" />
                      Cọc giữ bàn
                    </div>
                    <div className="mt-3 grid gap-3 text-sm font-semibold sm:grid-cols-3">
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                        <p className="text-[var(--muted-foreground)]">Yêu cầu</p>
                        <p className="metric-number mt-1 text-lg text-[var(--foreground)]">{formatVnd(selected.depositRequiredAmount)}</p>
                      </div>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                        <p className="text-[var(--muted-foreground)]">Đã nhận</p>
                        <p className="metric-number mt-1 text-lg text-[var(--foreground)]">{formatVnd(selected.depositPaidAmount)}</p>
                      </div>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                        <p className="text-[var(--muted-foreground)]">Trạng thái</p>
                        <p className="mt-1 text-sm text-[var(--foreground)]">{reservationDepositStatusLabel(selected.depositStatus)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                        <QrCode size={16} className="text-[var(--primary)]" />
                        QR gọi món sau khi nhận khách
                      </div>
                      <Badge tone={selected.seatedTableBillId ? "green" : selectedTableQrEnabled ? "blue" : "red"}>
                        {selected.seatedTableBillId ? "Đã mở phiên bàn" : selectedTableQrEnabled ? "Sẵn sàng scan" : "QR đang tắt"}
                      </Badge>
                    </div>

                    {assignedTableOption && selectedTableQrUrl ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={qrImageUrl(selectedTableQrUrl)} alt={`QR gọi món ${assignedTableOption.name}`} className="aspect-square w-full rounded-lg bg-white object-contain p-2" />
                        </div>
                        <div className="grid gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[var(--foreground)]">{assignedTableOption.name}</p>
                            <p className="mt-1 text-sm font-medium leading-6 text-[var(--muted-foreground)]">
                              {selected.seatedTableBillId
                                ? "Phiên bàn đã mở từ lịch đặt. Khách có thể scan QR để gọi món vào hóa đơn đang phục vụ."
                                : "Dùng QR này để hỗ trợ khách scan nhanh. Khi bấm nhận khách vào bàn, LogiVN sẽ mở phiên bàn và nối vào luồng QR order hiện có."}
                            </p>
                          </div>

                          {!selectedTableQrEnabled ? (
                            <p className="rounded-lg border border-[rgba(197,48,48,0.16)] bg-[var(--danger-soft)] p-3 text-sm font-semibold text-[var(--accent-strong)]">
                              QR của bàn này đang tắt. Mở lại trong Bàn & QR trước khi đưa khách scan.
                            </p>
                          ) : null}

                          <div className="grid gap-2 sm:grid-cols-2">
                            <Button type="button" variant="secondary" onClick={copyTableQrUrl} disabled={!selectedTableQrEnabled}>
                              <Copy size={16} />
                              {copiedTableQrId === assignedTableOption.id ? "Đã sao chép" : "Sao chép QR"}
                            </Button>
                            <a
                              href={selectedTableQrEnabled ? selectedTableQrUrl : "/dashboard/tables"}
                              target={selectedTableQrEnabled ? "_blank" : undefined}
                              rel={selectedTableQrEnabled ? "noreferrer" : undefined}
                              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--primary)]"
                            >
                              <ExternalLink size={16} />
                              {selectedTableQrEnabled ? "Mở trang gọi món" : "Mở Bàn & QR"}
                            </a>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-4 text-sm font-semibold text-[var(--muted-foreground)]">
                        Lịch này chưa có bàn giữ chỗ. Hãy đổi sang một bàn phù hợp trước khi check-in hoặc nhận khách vào bàn.
                      </div>
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {selected.status === "waiting_deposit_confirm" && selected.depositStatus === "waiting_confirm" ? (
                      <Button type="button" onClick={() => runAction("confirm-deposit", selected.id)} disabled={mutatingId === selected.id}>
                        {mutatingId === selected.id ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                        Xác nhận cọc
                      </Button>
                    ) : null}
                    <Button type="button" variant="secondary" onClick={() => runAction("check-in", selected.id)} disabled={mutatingId === selected.id || !canCheckInReservation(selected)}>
                      <UserRoundCheck size={16} />
                      Check-in khách
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => runAction("seat", selected.id)} disabled={mutatingId === selected.id || !canSeatReservation(selected)}>
                      <UserRoundCheck size={16} />
                      Nhận khách vào bàn
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => runAction("no-show", selected.id)} disabled={mutatingId === selected.id || !canMarkNoShow(selected, settings.reservation_arrival_grace_minutes, clockTick)}>
                      <Clock3 size={16} />
                      Khách không đến
                    </Button>
                    <Button type="button" variant="danger" onClick={() => runAction("cancel", selected.id)} disabled={mutatingId === selected.id || !canCancelReservation(selected)}>
                      <X size={16} />
                      Huỷ lịch đặt
                    </Button>
                    <Button type="button" variant="danger" onClick={() => runAction("reject", selected.id)} disabled={mutatingId === selected.id || !canRejectReservation(selected)}>
                      <X size={16} />
                      Từ chối lịch
                    </Button>
                  </div>

                  {canRescheduleReservation(selected) ? (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                        <Clock3 size={16} className="text-[var(--primary)]" />
                        Đổi giờ giữ chỗ
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <label className="grid gap-2 text-sm font-semibold">
                          Ngày mới
                          <Input type="date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} />
                        </label>
                        <label className="grid gap-2 text-sm font-semibold">
                          Giờ mới
                          <Input type="time" value={rescheduleTime} onChange={(event) => setRescheduleTime(event.target.value)} />
                        </label>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <select
                          value={selectedRescheduleTableId}
                          onChange={(event) => setRescheduleTableId(event.target.value)}
                          className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--primary)]"
                        >
                          <option value="">Giữ bàn hiện tại nếu còn trống, nếu không tự chọn bàn phù hợp</option>
                          {rescheduleTableOptions.map((table) => (
                            <option key={table.id} value={table.id}>
                              {tableOptionLabel(table)}
                            </option>
                          ))}
                        </select>
                        <Button type="button" variant="secondary" onClick={() => void submitReschedule()} disabled={mutatingId === selected.id || !rescheduleDate || !rescheduleTime}>
                          Đổi giờ
                        </Button>
                      </div>
                      <p className="mt-3 text-xs font-semibold leading-5 text-[var(--muted-foreground)]">
                        LogiVN sẽ kiểm tra lại giờ hoạt động, buffer dọn bàn và lock bàn trước khi cập nhật lịch.
                      </p>
                    </div>
                  ) : null}

                  {!isHistory(selected.status) && selected.status !== "seated" ? (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                        <Sofa size={16} className="text-[var(--primary)]" />
                        Đổi/ghép bàn giữ chỗ
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--muted-foreground)]">
                        <Badge tone={selectedAssignmentCapacity >= selected.partySize ? "green" : "yellow"}>
                          {selectedTableSelectionIds.length} bàn · {selectedAssignmentCapacity}/{selected.partySize} ghế
                        </Badge>
                        {selectedAssignmentTables.length > 0 ? <span className="truncate">{selectedAssignmentTables.map((table) => table.name).join(", ")}</span> : null}
                      </div>

                      <div className="mt-3 grid max-h-[280px] gap-2 overflow-y-auto pr-1">
                        {tableAssignmentOptions.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-3 text-sm font-semibold text-[var(--muted-foreground)]">
                            Không có bàn khả dụng để giữ chỗ.
                          </div>
                        ) : (
                          tableAssignmentOptions.map((table) => {
                            const checked = selectedTableSelectionIds.includes(table.id);
                            const addingDisabled = !checked && selectedTableSelectionIds.length >= 8;
                            return (
                              <label
                                key={table.id}
                                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm font-semibold transition ${
                                  checked ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-strong)]" : "border-[var(--border)] bg-[var(--soft-surface)] text-[var(--foreground)]"
                                } ${addingDisabled ? "cursor-not-allowed opacity-60" : ""}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={addingDisabled}
                                  onChange={() => toggleTableSelection(table.id)}
                                  className="h-5 w-5 shrink-0 accent-[var(--primary)]"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate">{table.name}</span>
                                  <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--muted-foreground)]">
                                    {table.floorLabel || "Tầng trệt"} · {table.area || "Khu chính"} · {table.capacity} khách
                                  </span>
                                </span>
                                {table.tableKind === "vip" ? <Badge tone="blue">VIP</Badge> : null}
                                {table.seatingZone === "outdoor" ? <Badge tone="yellow">Ngoài trời</Badge> : null}
                              </label>
                            );
                          })
                        )}
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                        <p className="text-xs font-semibold leading-5 text-[var(--muted-foreground)]">
                          QR chính: {assignedTableOption?.name ?? "Chưa có bàn"} · Nhóm giữ chỗ {selectedTableSelectionIds.length} bàn.
                        </p>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void submitTableAssignment()}
                          disabled={mutatingId === selected.id || !canSaveTableAssignment}
                        >
                          Lưu nhóm bàn
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

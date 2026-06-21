"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Banknote,

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
import { DashboardDrawer } from "@/components/dashboard/shared-drawer";
import { useToast } from "@/components/dashboard/toast-provider";
import { RestaurantVisitMapCard } from "@/components/location/restaurant-visit-map-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readDashboardApiResponse } from "@/lib/dashboard/api-response";
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
type ViewMode = "list" | "timeline" | "calendar" | "floor";
type ReservationAction = "confirm-deposit" | "refund-deposit" | "check-in" | "seat" | "cancel" | "reject" | "no-show" | "move-table" | "reschedule" | "tables";
type BadgeTone = "neutral" | "green" | "yellow" | "blue" | "red";
type ReservationSignal = { key: string; label: string; tone: BadgeTone };
type PreflightIssue = { code: string; message: string; tableId?: string; tableName?: string };
type QuickReservationAction = {
  action: ReservationAction;
  label: string;
  icon: typeof Check;
  danger?: boolean;
};
type ReservationTablePreflight = {
  canSave: boolean;
  blockers: PreflightIssue[];
  warnings: PreflightIssue[];
  totalCapacity: number;
  capacityGap: number;
  tableCount: number;
  tables: Array<{
    id: string;
    name: string;
    activeBillCount: number;
    activeOrderCount: number;
    unpaidTotal: number;
    conflicts: Array<{ reservationId: string; customerName: string; status: string; partySize: number | null; startsAt: string; endsAt: string }>;
    signals: Array<{ code: string; tone: BadgeTone; label: string }>;
  }>;
};
type ReservationReschedulePreflight = {
  canSave: boolean;
  blockers: PreflightIssue[];
  warnings: PreflightIssue[];
  assignmentMode: "selected" | "current" | "auto" | "none";
  startsAt: string;
  endsAt: string | null;
  lockEnd: string | null;
  tableIds: string[];
  tableCount: number;
  totalCapacity: number;
  capacityGap: number;
  tables: Array<{
    id: string;
    name: string;
    capacity: number;
    conflicts: Array<{ reservationId: string; customerName: string; status: string; partySize: number | null; startsAt: string; endsAt: string }>;
    signals: Array<{ code: string; tone: BadgeTone; label: string }>;
  }>;
};
type ReservationSeatingPreflight = {
  canSeat: boolean;
  blockers: PreflightIssue[];
  warnings: PreflightIssue[];
  status: ReservationDto["status"];
  partySize: number;
  depositAppliedAmount: number;
  primaryTableId: string | null;
  primaryTableName: string | null;
  tableIds: string[];
  tableCount: number;
  totalCapacity: number;
  capacityGap: number;
  qrReadyCount: number;
  tables: Array<{
    id: string;
    name: string;
    capacity: number;
    isPrimary: boolean;
    qrEnabled: boolean;
    activeBillCount: number;
    activeOrderCount: number;
    conflicts: Array<{ reservationId: string; customerName: string; status: string; partySize: number | null; startsAt: string; endsAt: string }>;
    signals: Array<{ code: string; tone: BadgeTone; label: string }>;
  }>;
};
type PreflightState = "idle" | "checking" | "ready" | "error";

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

function reservationTableLabel(reservation: ReservationDto) {
  const names = reservation.tables.map((table) => table.name).filter(Boolean);
  if (names.length === 0) return "Chưa có bàn";
  if (names.length === 1) return names[0];
  return `${names[0]} + ${names.length - 1} bàn ghép`;
}

function reservationTotalCapacity(reservation: ReservationDto) {
  return reservation.tables.reduce((total, table) => total + Number(table.capacity || 0), 0);
}

function reservationOperationSignals(
  reservation: ReservationDto,
  arrivalGraceMinutes: number,
  now = Date.now()
): ReservationSignal[] {
  const signals: ReservationSignal[] = [];
  const countdown = holdCountdown(reservation, now);
  const capacity = reservationTotalCapacity(reservation);

  if (canMarkNoShow(reservation, arrivalGraceMinutes, now)) {
    signals.push({ key: "late", label: "Trễ hẹn", tone: "red" });
  }
  if (countdown) {
    signals.push({ key: "hold", label: `Hold ${countdown}`, tone: countdown === "Đã hết hạn" ? "red" : "yellow" });
  }
  if (reservation.tables.length === 0) {
    signals.push({ key: "missing-table", label: "Chưa gán bàn", tone: "yellow" });
  } else if (reservation.tables.length > 1) {
    signals.push({ key: "merged-table", label: `${reservation.tables.length} bàn ghép`, tone: "blue" });
  }
  if (capacity > 0 && capacity < reservation.partySize) {
    signals.push({ key: "under-capacity", label: "Thiếu ghế", tone: "red" });
  }
  if (reservation.depositStatus === "waiting_confirm") {
    signals.push({ key: "deposit-waiting", label: "Đối soát cọc", tone: "yellow" });
  }

  return signals;
}

function reservationsOverlap(left: ReservationDto, right: ReservationDto) {
  return new Date(left.startsAt).getTime() < new Date(right.endsAt).getTime() && new Date(left.endsAt).getTime() > new Date(right.startsAt).getTime();
}

function hasReservationTableConflict(reservations: ReservationDto[]) {
  return reservations.some((reservation, index) => reservations.slice(index + 1).some((next) => reservationsOverlap(reservation, next)));
}

function quickReservationAction(reservation: ReservationDto, arrivalGraceMinutes: number, now = Date.now()): QuickReservationAction | null {
  if (reservation.status === "waiting_deposit_confirm" && reservation.depositStatus === "waiting_confirm") {
    return { action: "confirm-deposit", label: "Xác nhận cọc", icon: Check };
  }
  if (canMarkNoShow(reservation, arrivalGraceMinutes, now)) {
    return { action: "no-show", label: "No-show", icon: AlertCircle, danger: true };
  }
  if (reservation.status === "checked_in" && reservation.tables.length > 0) {
    return { action: "seat", label: "Nhận bàn", icon: UserRoundCheck };
  }
  if (reservation.status === "confirmed" && minutesUntil(reservation.startsAt, now) <= 60) {
    return { action: "check-in", label: "Check-in", icon: UserRoundCheck };
  }
  return null;
}

function actionEndpoint(action: ReservationAction, reservationId: string) {
  return `/api/admin/reservations/${reservationId}/${action}`;
}

function reservationActionToast(action: ReservationAction) {
  if (action === "confirm-deposit") return { title: "Đã xác nhận cọc", message: "Lịch đặt bàn đã được giữ chắc cho khách." };
  if (action === "refund-deposit") return { title: "Đã ghi nhận hoàn cọc", message: "Trạng thái cọc đã được cập nhật." };
  if (action === "check-in") return { title: "Đã check-in khách", message: "Khách đã đến quán và sẵn sàng xếp bàn." };
  if (action === "seat") return { title: "Đã nhận khách vào bàn", message: "Bàn đã chuyển sang trạng thái đang phục vụ." };
  if (action === "cancel") return { title: "Đã huỷ đặt bàn", message: "Lịch đặt bàn đã được đóng trong hệ thống." };
  if (action === "reject") return { title: "Đã từ chối đặt bàn", message: "Yêu cầu đặt bàn đã được đóng." };
  if (action === "no-show") return { title: "Đã đánh dấu no-show", message: "Hệ thống đã ghi nhận khách không đến." };
  if (action === "reschedule") return { title: "Đã đổi lịch đặt bàn", message: "Thời gian mới đã được lưu." };
  if (action === "tables") return { title: "Đã cập nhật bàn", message: "Bàn giữ chỗ đã được đồng bộ." };
  return { title: "Đã cập nhật đặt bàn", message: "Thay đổi đã được lưu." };
}

function tableOptionLabel(table: ReservationTableOption) {
  const floor = table.floorLabel || "Tầng trệt";
  const area = table.area || "Khu chính";
  const flags = [table.tableKind === "vip" ? "VIP" : null, table.seatingZone === "outdoor" ? "ngoài trời" : null].filter(Boolean).join(", ");
  return `${table.name} · ${floor} · ${area} · ${table.capacity} khách${flags ? ` · ${flags}` : ""}`;
}

function tableSortKey(table: ReservationTableOption) {
  return `${table.floorLabel || "Tầng trệt"}|${table.area || "Khu chính"}|${table.name}`;
}

function isTableOperationallyBusy(table: ReservationTableOption) {
  return Boolean(table.activeBillCount || table.activeOrderCount || table.activeReservationCount || table.operationalStatus === "serving" || table.operationalStatus === "awaiting_payment");
}

function tableOperationalSignals(table: ReservationTableOption): ReservationSignal[] {
  const signals: ReservationSignal[] = [];
  if (table.tableKind === "vip") signals.push({ key: "vip", label: "VIP", tone: "blue" });
  if (table.seatingZone === "outdoor") signals.push({ key: "outdoor", label: "Ngoài trời", tone: "yellow" });
  if (table.qrEnabled === false) signals.push({ key: "qr-off", label: "QR tắt", tone: "red" });
  if (table.operationalStatus === "awaiting_payment") signals.push({ key: "payment", label: "Chờ thanh toán", tone: "yellow" });
  if (isTableOperationallyBusy(table)) signals.push({ key: "busy", label: "Đang bận", tone: "blue" });
  if (table.unpaidTotal && table.unpaidTotal > 0) signals.push({ key: "unpaid", label: "Có công nợ", tone: "yellow" });
  return signals;
}

function tableConflictingReservations(tableId: string, reservation: ReservationDto, reservations: ReservationDto[]) {
  return reservations.filter(
    (item) =>
      item.id !== reservation.id &&
      !isHistory(item.status) &&
      item.tables.some((table) => table.id === tableId) &&
      reservationsOverlap(item, reservation)
  );
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

function preflightIssueKey(issue: PreflightIssue) {
  return `${issue.code}:${issue.tableId ?? issue.message}`;
}

function PreflightStatusCard({
  state,
  blockers = [],
  warnings = [],
  verifiedLabel,
  checkingLabel,
  errorLabel,
  verifiedMeta,
  onRetry
}: {
  state: PreflightState;
  blockers?: PreflightIssue[];
  warnings?: PreflightIssue[];
  verifiedLabel: string;
  checkingLabel: string;
  errorLabel: string;
  verifiedMeta?: ReactNode;
  onRetry: () => void;
}) {
  if (state === "idle") return null;

  if (state === "checking") {
    return (
      <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-sm font-semibold text-[var(--muted-foreground)]">
        <Loader2 className="animate-spin" size={15} />
        {checkingLabel}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="mt-3 grid gap-3 rounded-lg border border-[rgba(197,48,48,0.16)] bg-[var(--danger-soft)] p-3 text-sm font-semibold text-[var(--accent-strong)]">
        <p>{errorLabel}</p>
        <button type="button" onClick={onRetry} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--accent-strong)]">
          <RefreshCw size={13} />
          Kiểm tra lại
        </button>
      </div>
    );
  }

  if (blockers.length > 0) {
    return (
      <div className="mt-3 grid gap-2 rounded-lg border border-[rgba(197,48,48,0.16)] bg-[var(--danger-soft)] p-3 text-sm font-semibold text-[var(--accent-strong)]">
        {blockers.slice(0, 3).map((blocker) => (
          <p key={preflightIssueKey(blocker)}>{blocker.message}</p>
        ))}
        <button type="button" onClick={onRetry} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--accent-strong)]">
          <RefreshCw size={13} />
          Kiểm tra lại
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="green">{verifiedLabel}</Badge>
        {verifiedMeta}
        <button type="button" onClick={onRetry} className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-semibold text-[var(--primary)]">
          <RefreshCw size={12} />
          Kiểm tra lại
        </button>
      </div>
      {warnings.length > 0 ? (
        <div className="mt-2 grid gap-1 text-xs font-semibold text-[var(--accent-strong)]">
          {warnings.slice(0, 3).map((warning) => (
            <p key={preflightIssueKey(warning)}>{warning.message}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
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
  const toast = useToast();
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
  const [tableAssignmentSearch, setTableAssignmentSearch] = useState("");
  const [tableAssignmentArea, setTableAssignmentArea] = useState("");
  const [tableAssignmentZone, setTableAssignmentZone] = useState("");
  const [tableAssignmentKind, setTableAssignmentKind] = useState("");
  const [hideBusyAssignmentTables, setHideBusyAssignmentTables] = useState(false);
  const [tablePreflight, setTablePreflight] = useState<ReservationTablePreflight | null>(null);
  const [tablePreflightState, setTablePreflightState] = useState<PreflightState>("idle");
  const [reschedulePreflight, setReschedulePreflight] = useState<ReservationReschedulePreflight | null>(null);
  const [reschedulePreflightState, setReschedulePreflightState] = useState<PreflightState>("idle");
  const [seatingPreflight, setSeatingPreflight] = useState<ReservationSeatingPreflight | null>(null);
  const [seatingPreflightState, setSeatingPreflightState] = useState<PreflightState>("idle");
  const [tablePreflightRequestKey, setTablePreflightRequestKey] = useState("");
  const [reschedulePreflightRequestKey, setReschedulePreflightRequestKey] = useState("");
  const [seatingPreflightRequestKey, setSeatingPreflightRequestKey] = useState("");
  const [tablePreflightRetryKey, setTablePreflightRetryKey] = useState(0);
  const [reschedulePreflightRetryKey, setReschedulePreflightRetryKey] = useState(0);
  const [seatingPreflightRetryKey, setSeatingPreflightRetryKey] = useState(0);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleTableId, setRescheduleTableId] = useState("");
  const [copiedTableQrId, setCopiedTableQrId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("connecting");

  const [clockTick, setClockTick] = useState(() => Date.now());
  const refreshTimerRef = useRef<number | null>(null);
  const selected = reservations.find((reservation) => reservation.id === selectedId) ?? null;
  const currentSeatingPreflightRequestKey = selected
    ? `${selected.id}:${selected.status}:${selected.tables.map((table) => table.id).sort().join("|")}:${selected.depositPaidAmount}`
    : "";
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
  const noShowCount = operationalQueues.find((queue) => queue.key === "no-show")?.reservations.length ?? 0;
  const depositCount = operationalQueues.find((queue) => queue.key === "deposit")?.reservations.length ?? 0;
  const holdCount = operationalQueues.find((queue) => queue.key === "hold")?.reservations.length ?? 0;
  const arrivalCount = operationalQueues.find((queue) => queue.key === "arrival")?.reservations.length ?? 0;
  const intakeScore = Math.max(0, 100 - noShowCount * 18 - depositCount * 12 - holdCount * 10 - arrivalCount * 5 - (settings.reservations_enabled ? 0 : 20));
  const intakeTone = intakeScore >= 84 ? "green" : intakeScore >= 64 ? "yellow" : "red";

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

  const calendarRows = useMemo(() => {
    const groups = new Map<number, ReservationDto[]>();
    for (const reservation of visibleReservations) {
      const hour = new Date(reservation.startsAt).getHours();
      const group = groups.get(hour) ?? [];
      group.push(reservation);
      groups.set(hour, group);
    }

    const activeHours = Array.from(groups.keys());
    const minHour = activeHours.length > 0 ? Math.min(...activeHours, 8) : 8;
    const maxHour = activeHours.length > 0 ? Math.max(...activeHours, 22) : 22;

    return Array.from({ length: maxHour - minHour + 1 }, (_, index) => {
      const hour = minHour + index;
      const items = groups.get(hour) ?? [];
      return {
        hour,
        label: `${String(hour).padStart(2, "0")}:00`,
        items: items.sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())
      };
    });
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
  const selectedTableSelectionIds = useMemo(() => {
    return tableSelectionIds.filter((tableId) => tableAssignmentOptions.some((table) => table.id === tableId));
  }, [tableAssignmentOptions, tableSelectionIds]);
  const currentTablePreflightRequestKey = selected ? `${selected.id}:${[...selectedTableSelectionIds].sort().join("|")}` : "";
  const selectedAssignmentTables = useMemo(() => {
    return tableAssignmentOptions.filter((table) => selectedTableSelectionIds.includes(table.id));
  }, [selectedTableSelectionIds, tableAssignmentOptions]);
  const selectedAssignmentCapacity = selectedAssignmentTables.reduce((total, table) => total + table.capacity, 0);
  const tableAssignmentAreaOptions = useMemo(() => {
    const labels = new Set(tableAssignmentOptions.map((table) => table.area || "Khu chính"));
    return Array.from(labels).sort((left, right) => left.localeCompare(right, "vi"));
  }, [tableAssignmentOptions]);
  const normalizedTableAssignmentSearch = tableAssignmentSearch.trim().toLocaleLowerCase("vi-VN");
  const tableAssignmentConflictsById = useMemo(() => {
    const next = new Map<string, ReservationDto[]>();
    if (!selected) return next;
    for (const table of tableAssignmentOptions) {
      const conflicts = tableConflictingReservations(table.id, selected, reservations);
      if (conflicts.length > 0) next.set(table.id, conflicts);
    }
    return next;
  }, [reservations, selected, tableAssignmentOptions]);
  const selectedAssignmentConflictCount = selectedTableSelectionIds.filter((tableId) => tableAssignmentConflictsById.has(tableId)).length;
  const selectedBusyAssignmentCount = selectedAssignmentTables.filter(isTableOperationallyBusy).length;
  const selectedQrDisabledCount = selectedAssignmentTables.filter((table) => table.qrEnabled === false).length;
  const selectedAssignmentCapacityGap = Math.max(0, (selected?.partySize ?? 0) - selectedAssignmentCapacity);
  const selectedAssignmentFloorLabels = Array.from(new Set(selectedAssignmentTables.map((table) => table.floorLabel || "Tầng trệt"))).sort((left, right) => left.localeCompare(right, "vi"));
  const selectedAssignmentAreaLabels = Array.from(new Set(selectedAssignmentTables.map((table) => table.area || "Khu chính"))).sort((left, right) => left.localeCompare(right, "vi"));
  const preflightTableById = useMemo(() => new Map((tablePreflight?.tables ?? []).map((table) => [table.id, table])), [tablePreflight]);
  const hasFreshTablePreflight = tablePreflightState === "ready" && tablePreflightRequestKey === currentTablePreflightRequestKey;
  const visibleTablePreflightState =
    selected && selectedTableSelectionIds.length > 0 && tablePreflightRequestKey !== currentTablePreflightRequestKey
      ? "checking"
      : tablePreflightState;
  const tableAssignmentSaveBlocker = !selected
    ? "Chưa chọn lịch đặt bàn."
    : selectedTableSelectionIds.length === 0
      ? "Chọn ít nhất một bàn để giữ chỗ."
      : selectedAssignmentCapacity < selected.partySize
        ? `Nhóm bàn còn thiếu ${selected.partySize - selectedAssignmentCapacity} ghế.`
        : selectedAssignmentConflictCount > 0
          ? "Nhóm bàn đang chồng lịch với reservation khác."
          : visibleTablePreflightState === "checking"
            ? "Đang xác minh nhóm bàn trên server."
            : visibleTablePreflightState === "error"
              ? "Server chưa xác minh được nhóm bàn."
              : !hasFreshTablePreflight
                ? "Chờ LogiVN xác minh nhóm bàn mới nhất."
                : tablePreflight?.canSave === false
                  ? tablePreflight.blockers[0]?.message ?? "Nhóm bàn chưa đủ điều kiện lưu."
                  : null;
  const canSaveTableAssignment = !tableAssignmentSaveBlocker;
  const filteredTableAssignmentOptions = useMemo(() => {
    return tableAssignmentOptions
      .filter((table) => {
        if (tableAssignmentArea && (table.area || "Khu chính") !== tableAssignmentArea) return false;
        if (tableAssignmentZone && table.seatingZone !== tableAssignmentZone) return false;
        if (tableAssignmentKind && table.tableKind !== tableAssignmentKind) return false;
        if (hideBusyAssignmentTables && isTableOperationallyBusy(table)) return false;
        if (!normalizedTableAssignmentSearch) return true;
        return [table.name, table.area, table.floorLabel, table.seatingZone, table.tableKind]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("vi-VN")
          .includes(normalizedTableAssignmentSearch);
      })
      .sort((left, right) => {
        const leftSelected = selectedTableSelectionIds.includes(left.id) ? 0 : 1;
        const rightSelected = selectedTableSelectionIds.includes(right.id) ? 0 : 1;
        if (leftSelected !== rightSelected) return leftSelected - rightSelected;
        const leftConflict = tableAssignmentConflictsById.has(left.id) ? 1 : 0;
        const rightConflict = tableAssignmentConflictsById.has(right.id) ? 1 : 0;
        if (leftConflict !== rightConflict) return leftConflict - rightConflict;
        const capacityDiff = Math.abs(left.capacity - (selected?.partySize ?? 0)) - Math.abs(right.capacity - (selected?.partySize ?? 0));
        if (capacityDiff !== 0) return capacityDiff;
        return tableSortKey(left).localeCompare(tableSortKey(right), "vi");
      });
  }, [
    hideBusyAssignmentTables,
    normalizedTableAssignmentSearch,
    selected?.partySize,
    selectedTableSelectionIds,
    tableAssignmentArea,
    tableAssignmentConflictsById,
    tableAssignmentKind,
    tableAssignmentOptions,
    tableAssignmentZone
  ]);
  const assignedTableOption = selected?.tables[0]?.id
    ? tableOptions.find((table) => table.id === selected.tables[0]?.id) ?? null
    : null;
  const assignedTableOptions = selected
    ? selected.tables
        .map((table) => tableOptions.find((option) => option.id === table.id) ?? null)
        .filter((table): table is ReservationTableOption => Boolean(table))
    : [];
  const selectedTableQrUrl = assignedTableOption ? tableQrUrl(settings.slug, assignedTableOption) : null;
  const selectedTableQrEnabled = assignedTableOption?.qrEnabled !== false;
  const hasFreshSeatingPreflight = seatingPreflightState === "ready" && seatingPreflightRequestKey === currentSeatingPreflightRequestKey;
  const visibleSeatingPreflightState =
    selected && canSeatReservation(selected) && seatingPreflightRequestKey !== currentSeatingPreflightRequestKey
      ? "checking"
      : seatingPreflightState;
  const seatingSubmitBlocker = !selected
    ? "Chưa chọn lịch đặt bàn."
    : !canSeatReservation(selected)
      ? "Lịch chưa ở trạng thái có thể nhận khách."
      : visibleSeatingPreflightState === "checking"
        ? "Đang kiểm tra bàn, QR và phiên thanh toán."
        : visibleSeatingPreflightState === "error"
          ? "Server chưa xác minh được điều kiện nhận bàn."
          : !hasFreshSeatingPreflight
            ? "Chờ LogiVN xác minh điều kiện nhận bàn mới nhất."
            : seatingPreflight?.canSeat === false
              ? seatingPreflight.blockers[0]?.message ?? "Lịch chưa đủ điều kiện nhận khách vào bàn."
              : null;
  const canSubmitSeatReservation = !seatingSubmitBlocker;
  const rescheduleStartsAt = localDateTimeToIso(rescheduleDate, rescheduleTime);
  const currentReschedulePreflightRequestKey = selected ? `${selected.id}:${rescheduleStartsAt ?? "invalid"}:${selectedRescheduleTableId || "auto"}` : "";
  const hasFreshReschedulePreflight = reschedulePreflightState === "ready" && reschedulePreflightRequestKey === currentReschedulePreflightRequestKey;
  const visibleReschedulePreflightState =
    selected && Boolean(rescheduleStartsAt) && reschedulePreflightRequestKey !== currentReschedulePreflightRequestKey
      ? "checking"
      : reschedulePreflightState;
  const rescheduleSubmitBlocker = !selected
    ? "Chưa chọn lịch đặt bàn."
    : !rescheduleDate || !rescheduleTime || !rescheduleStartsAt
      ? "Chọn ngày và giờ mới hợp lệ."
      : visibleReschedulePreflightState === "checking"
        ? "Đang kiểm tra giờ mới, buffer và bàn giữ."
        : visibleReschedulePreflightState === "error"
          ? "Server chưa xác minh được giờ mới."
          : !hasFreshReschedulePreflight
            ? "Chờ LogiVN xác minh giờ mới nhất."
            : reschedulePreflight?.canSave === false
              ? reschedulePreflight.blockers[0]?.message ?? "Giờ mới chưa đủ điều kiện lưu."
              : null;
  const canSubmitReschedule = !rescheduleSubmitBlocker;
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
      const updated = await readDashboardApiResponse<ReservationDto>(response, "Thao tác thất bại.");
      if (!updated) throw new Error("Thao tác thất bại.");
      setReservations((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedId(updated.id);
      toast.success(reservationActionToast(action));

      primeReservationControls(updated);
      void loadAnalytics(true);
      return updated;
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Thao tác thất bại.";
      setError(message);
      toast.error({ title: "Không xử lý được đặt bàn", message });
      return null;
    } finally {
      setMutatingId(null);
    }
  }

  async function submitReschedule() {
    if (!selected) return;
    if (rescheduleSubmitBlocker || !rescheduleStartsAt) {
      setError(rescheduleSubmitBlocker ?? "Vui lòng chọn ngày và giờ mới hợp lệ.");
      return;
    }
    const updated = await runAction("reschedule", selected.id, {
      startsAt: rescheduleStartsAt,
      tableId: selectedRescheduleTableId || undefined
    });
    if (updated) {
      setDate(rescheduleDate);
      await loadReservations(rescheduleDate, true);
    }
  }

  async function submitTableAssignment() {
    if (!selected) return;
    if (tableAssignmentSaveBlocker) {
      setError(tableAssignmentSaveBlocker);
      return;
    }
    const updated = await runAction("tables", selected.id, { tableIds: selectedTableSelectionIds });
    if (updated) await loadReservations(date, true);
  }

  async function submitSeatReservation() {
    if (!selected) return;
    if (seatingSubmitBlocker) {
      setError(seatingSubmitBlocker);
      return;
    }
    await runAction("seat", selected.id);
  }

  function toggleTableSelection(tableId: string) {
    setTableSelectionIds((current) => {
      if (current.includes(tableId)) return current.filter((item) => item !== tableId);
      if (current.length >= 8) return current;
      return [...current, tableId];
    });
  }

  function applyTightTableRecommendation() {
    if (!selected) return;
    const candidate = tableAssignmentOptions
      .filter((table) => table.capacity >= selected.partySize && !tableAssignmentConflictsById.has(table.id) && !isTableOperationallyBusy(table))
      .sort((left, right) => {
        const capacityDiff = left.capacity - right.capacity;
        if (capacityDiff !== 0) return capacityDiff;
        return tableSortKey(left).localeCompare(tableSortKey(right), "vi");
      })[0];

    if (candidate) setTableSelectionIds([candidate.id]);
  }

  function completeSelectionWithCompatibleTables() {
    if (!selected || selectedAssignmentCapacity >= selected.partySize) return;
    const selectedAreas = new Set(selectedAssignmentTables.map((table) => table.area || "Khu chính"));
    const candidates = tableAssignmentOptions
      .filter((table) => !selectedTableSelectionIds.includes(table.id))
      .filter((table) => !tableAssignmentConflictsById.has(table.id))
      .filter((table) => (selectedAreas.size > 0 ? selectedAreas.has(table.area || "Khu chính") : true))
      .sort((left, right) => {
        const busyDiff = Number(isTableOperationallyBusy(left)) - Number(isTableOperationallyBusy(right));
        if (busyDiff !== 0) return busyDiff;
        const capacityDiff = left.capacity - right.capacity;
        if (capacityDiff !== 0) return capacityDiff;
        return tableSortKey(left).localeCompare(tableSortKey(right), "vi");
      });
    const nextIds = [...selectedTableSelectionIds];
    let capacity = selectedAssignmentCapacity;
    for (const table of candidates) {
      if (nextIds.length >= 8 || capacity >= selected.partySize) break;
      nextIds.push(table.id);
      capacity += table.capacity;
    }
    setTableSelectionIds(nextIds);
  }

  function primeReservationControls(reservation: ReservationDto) {
    const parts = localInputParts(reservation.startsAt);
    setRescheduleDate(parts.date);
    setRescheduleTime(parts.time);
    setRescheduleTableId(reservation.tables[0]?.id ?? "");
    setTableSelectionIds(reservation.tables.map((table) => table.id));
    setTablePreflight(null);
    setTablePreflightState("idle");
    setTablePreflightRequestKey("");
    setReschedulePreflight(null);
    setReschedulePreflightState("idle");
    setReschedulePreflightRequestKey("");
    setSeatingPreflight(null);
    setSeatingPreflightState("idle");
    setSeatingPreflightRequestKey("");
    setTablePreflightRetryKey((value) => value + 1);
    setReschedulePreflightRetryKey((value) => value + 1);
    setSeatingPreflightRetryKey((value) => value + 1);
  }

  function openReservationDetail(reservation: ReservationDto) {
    setSelectedId(reservation.id);
    primeReservationControls(reservation);
    setDrawer("detail");
  }

  async function copyPublicUrl() {
    await navigator.clipboard.writeText(publicUrl);
  }

  async function copyTableQrUrl(table = assignedTableOption) {
    if (!table) return;
    await navigator.clipboard.writeText(tableQrUrl(settings.slug, table));
    setCopiedTableQrId(table.id);
  }

  function retryTablePreflight() {
    setTablePreflightRetryKey((value) => value + 1);
  }

  function retryReschedulePreflight() {
    setReschedulePreflightRetryKey((value) => value + 1);
  }

  function retrySeatingPreflight() {
    setSeatingPreflightRetryKey((value) => value + 1);
  }

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selected || !canSeatReservation(selected)) {
      const idleTimer = window.setTimeout(() => {
        setSeatingPreflight(null);
        setSeatingPreflightState("idle");
        setSeatingPreflightRequestKey("");
      }, 0);
      return () => window.clearTimeout(idleTimer);
    }

    let cancelled = false;
    const requestKey = currentSeatingPreflightRequestKey;
    const timer = window.setTimeout(async () => {
      setSeatingPreflight(null);
      setSeatingPreflightRequestKey(requestKey);
      setSeatingPreflightState("checking");
      try {
        const response = await fetch(`/api/admin/reservations/${selected.id}/seat/preflight`, { method: "POST" });
        const json = await response.json();
        if (!json.ok) throw new Error(json.error ?? "Không kiểm tra được điều kiện nhận bàn.");
        if (cancelled) return;
        setSeatingPreflight(json.data as ReservationSeatingPreflight);
        setSeatingPreflightRequestKey(requestKey);
        setSeatingPreflightState("ready");
      } catch {
        if (cancelled) return;
        setSeatingPreflight(null);
        setSeatingPreflightRequestKey(requestKey);
        setSeatingPreflightState("error");
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentSeatingPreflightRequestKey, seatingPreflightRetryKey, selected]);

  useEffect(() => {
    if (!selected || isHistory(selected.status) || selected.status === "seated" || selectedTableSelectionIds.length === 0) {
      const idleTimer = window.setTimeout(() => {
        setTablePreflight(null);
        setTablePreflightState("idle");
        setTablePreflightRequestKey("");
      }, 0);
      return () => window.clearTimeout(idleTimer);
    }

    let cancelled = false;
    const requestKey = currentTablePreflightRequestKey;
    const timer = window.setTimeout(async () => {
      setTablePreflight(null);
      setTablePreflightRequestKey(requestKey);
      setTablePreflightState("checking");
      try {
        const response = await fetch(`/api/admin/reservations/${selected.id}/tables/preflight`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tableIds: selectedTableSelectionIds })
        });
        const json = await response.json();
        if (!json.ok) throw new Error(json.error ?? "Không kiểm tra được nhóm bàn.");
        if (cancelled) return;
        setTablePreflight(json.data as ReservationTablePreflight);
        setTablePreflightRequestKey(requestKey);
        setTablePreflightState("ready");
      } catch {
        if (cancelled) return;
        setTablePreflight(null);
        setTablePreflightRequestKey(requestKey);
        setTablePreflightState("error");
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentTablePreflightRequestKey, selected, selectedTableSelectionIds, tablePreflightRetryKey]);

  useEffect(() => {
    if (!selected || !canRescheduleReservation(selected) || !rescheduleDate || !rescheduleTime) {
      const idleTimer = window.setTimeout(() => {
        setReschedulePreflight(null);
        setReschedulePreflightState("idle");
        setReschedulePreflightRequestKey("");
      }, 0);
      return () => window.clearTimeout(idleTimer);
    }

    if (!rescheduleStartsAt) {
      const idleTimer = window.setTimeout(() => {
        setReschedulePreflight(null);
        setReschedulePreflightState("idle");
        setReschedulePreflightRequestKey("");
      }, 0);
      return () => window.clearTimeout(idleTimer);
    }

    let cancelled = false;
    const startsAt = rescheduleStartsAt;
    const requestKey = currentReschedulePreflightRequestKey;
    const timer = window.setTimeout(async () => {
      setReschedulePreflight(null);
      setReschedulePreflightRequestKey(requestKey);
      setReschedulePreflightState("checking");
      try {
        const response = await fetch(`/api/admin/reservations/${selected.id}/reschedule/preflight`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startsAt, tableId: selectedRescheduleTableId || undefined })
        });
        const json = await response.json();
        if (!json.ok) throw new Error(json.error ?? "Không kiểm tra được giờ mới.");
        if (cancelled) return;
        setReschedulePreflight(json.data as ReservationReschedulePreflight);
        setReschedulePreflightRequestKey(requestKey);
        setReschedulePreflightState("ready");
      } catch {
        if (cancelled) return;
        setReschedulePreflight(null);
        setReschedulePreflightRequestKey(requestKey);
        setReschedulePreflightState("error");
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentReschedulePreflightRequestKey, rescheduleDate, reschedulePreflightRetryKey, rescheduleStartsAt, rescheduleTime, selected, selectedRescheduleTableId]);

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
      <div className="dashboard-operations-stack grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-4">
          <section className="admin-hero-panel dashboard-mobile-reservation-hero rounded-[14px] p-4">
            <div className="dashboard-mobile-reservation-intro relative z-[1] flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="dashboard-page-title">Đặt bàn trước</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone={realtimeState === "connected" ? "green" : realtimeState === "error" ? "red" : "yellow"}>
                    <span className="inline-flex items-center gap-1.5">
                      <RadioTower size={13} />
                      {realtimeLabel(realtimeState)}
                    </span>
                  </Badge>
                  <Badge tone={pressureTone}>{pressureLabel}</Badge>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                    void loadReservations(event.target.value);
                  }}
                  aria-label="Chọn ngày đặt bàn"
                  className="h-9 w-auto"
                />
                <button
                  type="button"
                  onClick={() => void Promise.all([loadReservations(date), loadAnalytics()])}
                  disabled={loading}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-sm font-semibold text-[var(--primary)] disabled:opacity-60"
                >
                  {loading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                  Làm mới
                </button>
              </div>
            </div>

            <div className="dashboard-mobile-hide mt-4 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
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
                  const quickAction = firstReservation ? quickReservationAction(firstReservation, settings.reservation_arrival_grace_minutes, clockTick) : null;
                  const QuickIcon = quickAction?.icon;
                  return (
                    <article
                      key={queue.key}
                      className={`min-h-[164px] rounded-xl border p-3 text-left transition ${
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
                        <div className="mt-3 rounded-lg bg-[var(--surface)]/78 p-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-[var(--foreground)]">{firstReservation.customerName}</p>
                              <p className="mt-0.5 truncate text-[11px] font-semibold text-[var(--muted-foreground)]">
                                {reservationTimeRange(firstReservation)} · {firstReservation.partySize} khách
                              </p>
                            </div>
                            <Badge tone={statusTone(firstReservation.status)}>{reservationStatusLabel(firstReservation.status)}</Badge>
                          </div>
                          <p className="mt-1 truncate text-[11px] font-semibold text-[var(--muted-foreground)]">
                            {minuteDistanceLabel(firstReservation.startsAt, clockTick)} · {firstReservation.tables.map((table) => table.name).join(", ") || "Chưa có bàn"}
                          </p>
                        </div>
                      ) : null}
                      {firstReservation ? (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => openReservationDetail(firstReservation)}
                            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-semibold text-[var(--primary)]"
                          >
                            <ExternalLink size={13} />
                            Mở
                          </button>
                          {quickAction && QuickIcon ? (
                            <button
                              type="button"
                              onClick={() => void runAction(quickAction.action, firstReservation.id)}
                              disabled={mutatingId === firstReservation.id}
                              className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold disabled:opacity-60 ${
                                quickAction.danger
                                  ? "bg-[var(--tertiary)] text-white"
                                  : "bg-[var(--primary-strong)] text-[var(--background)]"
                              }`}
                            >
                              {mutatingId === firstReservation.id ? <Loader2 className="animate-spin" size={13} /> : <QuickIcon size={13} />}
                              {quickAction.label}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openReservationDetail(firstReservation)}
                              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-[var(--primary-strong)] px-2 text-xs font-semibold text-[var(--background)]"
                            >
                              <Flame size={13} />
                              Xử lý
                            </button>
                          )}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="dashboard-mobile-hide mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
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

          <section className="dashboard-data-surface dashboard-panel p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
              <Badge tone={intakeTone}>Đặt bàn {intakeScore}/100</Badge>
              <span className="text-xs font-semibold text-[var(--muted-foreground)]">Hôm nay {stats.total}</span>
              <span className="mx-0.5 text-[var(--border)]">·</span>
              <span className={`text-xs font-semibold ${stats.waitingDeposit > 0 ? 'text-[var(--accent-strong)]' : 'text-[var(--muted-foreground)]'}`}>Cọc chờ {stats.waitingDeposit}</span>
              <span className="mx-0.5 text-[var(--border)]">·</span>
              <span className="text-xs font-semibold text-[var(--muted-foreground)]">{stats.confirmed} xác nhận</span>
              <span className="mx-0.5 text-[var(--border)]">·</span>
              <span className="text-xs font-semibold text-[var(--muted-foreground)]">{stats.checkedIn + stats.seated} đã tới</span>
              <span className="mx-0.5 text-[var(--border)]">·</span>
              <span className={`text-xs font-semibold ${pressureCount > 0 ? 'text-[var(--accent-strong)]' : 'text-[var(--muted-foreground)]'}`}>{pressureLabel}</span>
            </div>

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

            <div className="dashboard-ops-toolbar mt-4 grid gap-2 lg:grid-cols-[180px_minmax(0,1fr)_auto]">
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

            <div className="dashboard-segmented-scroll mt-4 flex gap-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-1.5">
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

            <div className="dashboard-view-switch mt-3 grid grid-cols-4 gap-2 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-1.5">
              {[
                { key: "list", label: "Danh sách", icon: LayoutList },
                { key: "timeline", label: "Timeline", icon: Rows3 },
                { key: "calendar", label: "Calendar", icon: CalendarClock },
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
                  const operationSignals = reservationOperationSignals(reservation, settings.reservation_arrival_grace_minutes, clockTick);
                  const isSelected = selectedId === reservation.id;
                  return (
                    <button
                      key={reservation.id}
                      type="button"
                      onClick={() => openReservationDetail(reservation)}
                      aria-pressed={isSelected}
                      className={`dashboard-reservation-card rounded-xl border bg-[var(--surface)] p-4 text-left transition hover:border-[var(--primary)] ${
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
                          {operationSignals.map((signal) => (
                            <Badge key={signal.key} tone={signal.tone}>{signal.label}</Badge>
                          ))}
                        </div>
                        <p className="mt-2 text-sm font-medium text-[var(--muted-foreground)]">
                          {formatTime(reservation.startsAt)} · {minuteDistanceLabel(reservation.startsAt, clockTick)} · {reservation.partySize} khách · {reservationTableLabel(reservation)}
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
                          (() => {
                            const operationSignals = reservationOperationSignals(reservation, settings.reservation_arrival_grace_minutes, clockTick);
                            return (
                              <button
                                key={reservation.id}
                                type="button"
                                onClick={() => openReservationDetail(reservation)}
                                aria-pressed={selectedId === reservation.id}
                                className="dashboard-reservation-card rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-left transition hover:border-[var(--primary)] md:grid-cols-[120px_minmax(0,1fr)_auto]"
                              >
                                <div>
                                  <p className="text-sm font-semibold text-[var(--foreground)]">{reservationTimeRange(reservation)}</p>
                                  <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">{shortId(reservation.id)}</p>
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-[var(--foreground)]">{reservation.customerName}</span>
                                    <Badge tone={statusTone(reservation.status)}>{reservationStatusLabel(reservation.status)}</Badge>
                                    {operationSignals.map((signal) => (
                                      <Badge key={signal.key} tone={signal.tone}>{signal.label}</Badge>
                                    ))}
                                  </div>
                                  <p className="mt-1 truncate text-sm font-medium text-[var(--muted-foreground)]">
                                    {reservation.partySize} khách · {reservationTableLabel(reservation)} · {reservationPreferenceLabel(reservation, areaNameById)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 md:justify-end">
                                  {reservation.depositRequiredAmount > 0 ? <Badge tone={reservation.depositStatus === "paid" ? "green" : "yellow"}>{reservationDepositStatusLabel(reservation.depositStatus)}</Badge> : null}
                                </div>
                              </button>
                            );
                          })()
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </div>
            ) : null}

            {viewMode === "calendar" ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                <div className="grid grid-cols-[76px_minmax(0,1fr)] border-b border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2 text-xs font-semibold text-[var(--muted-foreground)]">
                  <span>Giờ</span>
                  <span>Lịch trong ngày</span>
                </div>
                <div className="max-h-[680px] overflow-y-auto">
                  {calendarRows.map((row) => (
                    <div key={row.hour} className="grid min-h-[86px] grid-cols-[76px_minmax(0,1fr)] border-b border-[var(--border)] last:border-b-0">
                      <div className="border-r border-[var(--border)] bg-[var(--soft-surface)] px-3 py-3">
                        <p className="metric-number text-sm font-semibold text-[var(--foreground)]">{row.label}</p>
                        <p className="mt-1 text-[11px] font-semibold text-[var(--muted-foreground)]">{row.items.length} lịch</p>
                      </div>
                      <div className="grid gap-2 p-2 sm:grid-cols-2 xl:grid-cols-3">
                        {row.items.length === 0 ? (
                          <div className="flex min-h-14 items-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--soft-surface)] px-3 text-xs font-semibold text-[var(--muted-foreground)]">
                            Trống khung giờ này
                          </div>
                        ) : (
                          row.items.map((reservation) => {
                            const operationSignals = reservationOperationSignals(reservation, settings.reservation_arrival_grace_minutes, clockTick);
                            return (
                              <button
                                key={reservation.id}
                                type="button"
                                onClick={() => openReservationDetail(reservation)}
                                className="min-h-20 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-left transition hover:border-[var(--primary)]"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-[var(--foreground)]">{reservation.customerName}</p>
                                    <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">
                                      {formatClock(reservation.startsAt)} · {reservation.partySize} khách · {reservationTableLabel(reservation)}
                                    </p>
                                  </div>
                                  <Badge tone={statusTone(reservation.status)}>{reservationStatusLabel(reservation.status)}</Badge>
                                </div>
                                {operationSignals.length > 0 ? (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {operationSignals.slice(0, 2).map((signal) => (
                                      <Badge key={signal.key} tone={signal.tone}>{signal.label}</Badge>
                                    ))}
                                  </div>
                                ) : null}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {viewMode === "floor" ? (
              <div className="mt-4 grid gap-3">
                {filter === "history" ? (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-sm font-semibold text-[var(--muted-foreground)]">
                    Chọn trạng thái để xem bàn đang giữ lịch.
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

                    <div className="dashboard-reservation-floor-grid mt-3">
                      {group.tables.map((table) => {
                        const tableReservations = reservationsByTableId.get(table.id) ?? [];
                        const nextReservation = tableReservations[0] ?? null;
                        const operationSignals = nextReservation ? reservationOperationSignals(nextReservation, settings.reservation_arrival_grace_minutes, clockTick) : [];
                        const hasConflict = hasReservationTableConflict(tableReservations);
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
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-[var(--foreground)]">{nextReservation.customerName}</p>
                                    <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">{reservationTimeRange(nextReservation)} · {nextReservation.partySize} khách</p>
                                  </div>
                                  {nextReservation.tables.length > 1 ? <Badge tone="blue">{nextReservation.tables.length} bàn</Badge> : null}
                                </div>
                                {operationSignals.length > 0 ? (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {operationSignals.slice(0, 3).map((signal) => (
                                      <Badge key={signal.key} tone={signal.tone}>{signal.label}</Badge>
                                    ))}
                                  </div>
                                ) : null}
                                {hasConflict ? <p className="mt-2 text-xs font-semibold text-[var(--accent-strong)]">Có lịch chồng giờ trên bàn này</p> : null}
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
        <DashboardDrawer
          open
          onClose={() => setDrawer("closed")}
          title={drawer === "settings" ? "Thiết lập đặt bàn" : drawer === "share" ? "Link đặt bàn" : "Chi tiết lịch đặt"}
          subtitle={drawer === "settings" ? "Cấu hình" : drawer === "share" ? "Chia sẻ" : "Chi tiết"}
          closeLabel="Đóng đặt bàn"
          width="lg"
          contentClassName="p-0 sm:p-0"
        >

            <div className="px-4 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-5">
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
                    <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-sm font-semibold leading-6 text-[var(--muted-foreground)]">
                      {selected.depositStatus === "forfeited"
                        ? "Cọc đã được ghi giữ lại do khách không đến. Sự kiện này được lưu vào risk log để hỗ trợ blacklist sau này."
                        : selected.depositStatus === "refundable"
                          ? "Lịch này cần hoàn cọc thủ công. Sau khi chuyển khoản hoặc xử lý ngoài hệ thống, bấm xác nhận đã hoàn cọc."
                          : selected.depositStatus === "refunded"
                            ? "Cọc đã được đánh dấu hoàn thủ công và đã ghi log đối soát."
                            : selected.depositPaidAmount > 0
                              ? "Nếu quán huỷ lịch, LogiVN sẽ chuyển cọc sang trạng thái cần hoàn. Nếu no-show, cọc sẽ được ghi giữ lại."
                              : "Chưa phát sinh cọc đã thu; khi huỷ/no-show hệ thống vẫn ghi log chính sách để đối soát."}
                    </div>
                    {selected.depositStatus === "refundable" ? (
                      <Button type="button" variant="secondary" onClick={() => runAction("refund-deposit", selected.id)} disabled={mutatingId === selected.id} className="mt-3 w-full">
                        {mutatingId === selected.id ? <Loader2 className="animate-spin" size={16} /> : <Banknote size={16} />}
                        Đánh dấu đã hoàn cọc thủ công
                      </Button>
                    ) : null}
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
                      <div className="mt-3 grid gap-3">
                        <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                          <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={qrImageUrl(selectedTableQrUrl)} alt={`QR gọi món ${assignedTableOption.name}`} className="aspect-square w-full rounded-lg bg-white object-contain p-2" />
                          </div>
                          <div className="grid gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[var(--foreground)]">
                                {assignedTableOption.name}{assignedTableOptions.length > 1 ? ` · bàn chính trong nhóm ${assignedTableOptions.length} bàn` : ""}
                              </p>
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
                              <Button type="button" variant="secondary" onClick={() => void copyTableQrUrl()} disabled={!selectedTableQrEnabled}>
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
                        {assignedTableOptions.length > 1 ? (
                          <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-[var(--foreground)]">QR bàn ghép</p>
                              <Badge tone="blue">{assignedTableOptions.length} bàn</Badge>
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {assignedTableOptions.map((table, index) => {
                                const enabled = table.qrEnabled !== false;
                                const url = tableQrUrl(settings.slug, table);
                                return (
                                  <div key={table.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-[var(--foreground)]">{table.name}</p>
                                        <p className="mt-0.5 truncate text-xs font-semibold text-[var(--muted-foreground)]">{index === 0 ? "Bàn chính" : "Bàn ghép"} · {table.area}</p>
                                      </div>
                                      <Badge tone={enabled ? "green" : "red"}>{enabled ? "QR bật" : "QR tắt"}</Badge>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void copyTableQrUrl(table)}
                                        disabled={!enabled}
                                        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-semibold text-[var(--primary)] disabled:opacity-60"
                                      >
                                        <Copy size={13} />
                                        {copiedTableQrId === table.id ? "Đã copy" : "Copy"}
                                      </button>
                                      <a
                                        href={enabled ? url : "/dashboard/tables"}
                                        target={enabled ? "_blank" : undefined}
                                        rel={enabled ? "noreferrer" : undefined}
                                        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-[var(--primary-strong)] px-2 text-xs font-semibold text-[var(--background)]"
                                      >
                                        <ExternalLink size={13} />
                                        {enabled ? "Mở" : "Cài QR"}
                                      </a>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
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
                    <Button type="button" variant="secondary" onClick={() => void submitSeatReservation()} disabled={mutatingId === selected.id || !canSubmitSeatReservation}>
                      {visibleSeatingPreflightState === "checking" ? <Loader2 className="animate-spin" size={16} /> : <UserRoundCheck size={16} />}
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

                  {canSeatReservation(selected) ? (
                    <>
                      {seatingSubmitBlocker && visibleSeatingPreflightState !== "ready" ? (
                        <p className="text-xs font-semibold leading-5 text-[var(--muted-foreground)]">
                          Chưa thể nhận bàn: {seatingSubmitBlocker}
                        </p>
                      ) : null}
                      <PreflightStatusCard
                        state={visibleSeatingPreflightState}
                        blockers={seatingPreflight?.blockers ?? []}
                        warnings={seatingPreflight?.warnings ?? []}
                        verifiedLabel="Sẵn sàng nhận bàn"
                        checkingLabel="Đang kiểm tra bàn, QR và phiên thanh toán..."
                        errorLabel="Không kiểm tra được điều kiện nhận bàn trên server. Vui lòng tải lại trước khi nhận khách."
                        onRetry={retrySeatingPreflight}
                        verifiedMeta={seatingPreflight ? (
                          <>
                            <Badge tone={seatingPreflight.capacityGap > 0 ? "red" : "green"}>
                              {seatingPreflight.totalCapacity}/{selected.partySize} ghế
                            </Badge>
                            <Badge tone="blue">{seatingPreflight.tableCount} bàn</Badge>
                            <Badge tone={seatingPreflight.qrReadyCount === seatingPreflight.tableCount ? "green" : "yellow"}>
                              {seatingPreflight.qrReadyCount}/{seatingPreflight.tableCount} QR
                            </Badge>
                            {seatingPreflight.depositAppliedAmount > 0 ? <Badge tone="green">Cọc {formatVnd(seatingPreflight.depositAppliedAmount)}</Badge> : null}
                            <span className="w-full text-xs font-semibold leading-5 text-[var(--muted-foreground)]">
                              Bill chính sẽ mở ở {seatingPreflight.primaryTableName ?? "bàn chính"}; QR từ bàn ghép sẽ ghi món vào cùng phiên reservation.
                            </span>
                          </>
                        ) : null}
                      />
                    </>
                  ) : null}

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
                        <Button type="button" variant="secondary" onClick={() => void submitReschedule()} disabled={mutatingId === selected.id || !canSubmitReschedule}>
                          {visibleReschedulePreflightState === "checking" ? <Loader2 className="animate-spin" size={16} /> : null}
                          Đổi giờ
                        </Button>
                      </div>
                      {rescheduleSubmitBlocker && visibleReschedulePreflightState !== "ready" ? (
                        <p className="mt-2 text-xs font-semibold leading-5 text-[var(--muted-foreground)]">
                          Chưa thể đổi giờ: {rescheduleSubmitBlocker}
                        </p>
                      ) : null}
                      <PreflightStatusCard
                        state={visibleReschedulePreflightState}
                        blockers={reschedulePreflight?.blockers ?? []}
                        warnings={reschedulePreflight?.warnings ?? []}
                        verifiedLabel="Giờ mới khả dụng"
                        checkingLabel="Đang kiểm tra giờ mới, buffer và bàn giữ..."
                        errorLabel="Không kiểm tra được giờ mới trên server. Vui lòng tải lại trước khi đổi giờ."
                        onRetry={retryReschedulePreflight}
                        verifiedMeta={reschedulePreflight ? (
                          <>
                            <Badge tone={reschedulePreflight.assignmentMode === "auto" ? "yellow" : "blue"}>
                              {reschedulePreflight.assignmentMode === "auto"
                                ? "Tự đổi bàn"
                                : reschedulePreflight.assignmentMode === "selected"
                                  ? "Bàn đã chọn"
                                  : "Giữ nhóm bàn"}
                            </Badge>
                            <Badge tone={reschedulePreflight.capacityGap > 0 ? "red" : "green"}>
                              {reschedulePreflight.totalCapacity}/{selected.partySize} ghế
                            </Badge>
                            <span className="w-full text-xs font-semibold leading-5 text-[var(--muted-foreground)]">
                              {reschedulePreflight.tables.map((table) => table.name).join(", ") || "Chưa có bàn"} · {reschedulePreflight.tableCount} bàn · lock tới {reschedulePreflight.lockEnd ? formatClock(reschedulePreflight.lockEnd) : "chưa rõ"}.
                            </span>
                          </>
                        ) : null}
                      />
                      <p className="mt-3 text-xs font-semibold leading-5 text-[var(--muted-foreground)]">
                        LogiVN sẽ kiểm tra lại giờ hoạt động, buffer dọn bàn và lock bàn trước khi cập nhật lịch.
                      </p>
                    </div>
                  ) : null}

                  {!isHistory(selected.status) && selected.status !== "seated" ? (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                          <Sofa size={16} className="text-[var(--primary)]" />
                          Đổi/ghép bàn giữ chỗ
                        </div>
                        <Badge tone={canSaveTableAssignment ? "green" : selectedAssignmentConflictCount > 0 || selectedAssignmentCapacityGap > 0 ? "red" : "yellow"}>
                          {canSaveTableAssignment ? "Sẵn sàng lưu" : selectedAssignmentConflictCount > 0 ? "Có chồng lịch" : selectedAssignmentCapacityGap > 0 ? "Thiếu ghế" : "Cần chọn bàn"}
                        </Badge>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                          <p className="text-xs font-semibold text-[var(--muted-foreground)]">Sức chứa</p>
                          <p className="metric-number mt-1 text-lg font-semibold text-[var(--foreground)]">{selectedAssignmentCapacity}/{selected.partySize}</p>
                          <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">{selectedAssignmentCapacityGap > 0 ? `Thiếu ${selectedAssignmentCapacityGap} ghế` : "Đủ ghế cho lịch"}</p>
                        </div>
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                          <p className="text-xs font-semibold text-[var(--muted-foreground)]">Nhóm bàn</p>
                          <p className="metric-number mt-1 text-lg font-semibold text-[var(--foreground)]">{selectedTableSelectionIds.length}/8</p>
                          <p className="mt-1 truncate text-xs font-semibold text-[var(--muted-foreground)]">{selectedAssignmentAreaLabels.join(", ") || "Chưa chọn khu"}</p>
                        </div>
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                          <p className="text-xs font-semibold text-[var(--muted-foreground)]">Rủi ro</p>
                          <p className="metric-number mt-1 text-lg font-semibold text-[var(--foreground)]">{selectedAssignmentConflictCount + selectedBusyAssignmentCount + selectedQrDisabledCount}</p>
                          <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">{selectedAssignmentConflictCount} chồng lịch · {selectedBusyAssignmentCount} bận · {selectedQrDisabledCount} QR tắt</p>
                        </div>
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                          <p className="text-xs font-semibold text-[var(--muted-foreground)]">Tầng</p>
                          <p className="mt-1 truncate text-sm font-semibold text-[var(--foreground)]">{selectedAssignmentFloorLabels.join(", ") || "Chưa chọn"}</p>
                          <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">{selectedAssignmentTables.length > 1 ? "Ghép bàn nhiều điểm" : "Một bàn chính"}</p>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                        <div className="grid gap-2 md:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.8fr))]">
                          <label className="relative block">
                            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" size={15} />
                            <Input value={tableAssignmentSearch} onChange={(event) => setTableAssignmentSearch(event.target.value)} placeholder="Tìm bàn, khu, tầng..." aria-label="Tìm bàn giữ chỗ" className="pl-9" />
                          </label>
                          <select value={tableAssignmentArea} onChange={(event) => setTableAssignmentArea(event.target.value)} className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--primary)]">
                            <option value="">Tất cả khu</option>
                            {tableAssignmentAreaOptions.map((area) => <option key={area} value={area}>{area}</option>)}
                          </select>
                          <select value={tableAssignmentZone} onChange={(event) => setTableAssignmentZone(event.target.value)} className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--primary)]">
                            <option value="">Mọi không gian</option>
                            <option value="indoor">Trong nhà</option>
                            <option value="outdoor">Ngoài trời</option>
                            <option value="mixed">Linh hoạt</option>
                          </select>
                          <select value={tableAssignmentKind} onChange={(event) => setTableAssignmentKind(event.target.value)} className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--primary)]">
                            <option value="">Mọi loại bàn</option>
                            <option value="standard">Tiêu chuẩn</option>
                            <option value="vip">VIP</option>
                            <option value="bar">Quầy bar</option>
                            <option value="community">Bàn chung</option>
                          </select>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button type="button" onClick={applyTightTableRecommendation} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--primary-strong)] px-3 text-xs font-semibold text-[var(--background)]">
                            <Check size={13} />
                            Đề xuất vừa đủ
                          </button>
                          <button type="button" onClick={completeSelectionWithCompatibleTables} disabled={!selectedAssignmentCapacityGap} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--primary)] disabled:opacity-60">
                            <Sofa size={13} />
                            Bổ sung cùng khu
                          </button>
                          <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--muted-foreground)]">
                            <input type="checkbox" checked={hideBusyAssignmentTables} onChange={(event) => setHideBusyAssignmentTables(event.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                            Ẩn bàn đang bận
                          </label>
                          <button type="button" onClick={() => setTableSelectionIds([])} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--muted-foreground)]">
                            <X size={13} />
                            Bỏ chọn
                          </button>
                        </div>
                      </div>

                      <PreflightStatusCard
                        state={visibleTablePreflightState}
                        blockers={tablePreflight?.blockers ?? []}
                        warnings={tablePreflight?.warnings ?? []}
                        verifiedLabel="Nhóm bàn đã xác minh"
                        checkingLabel="Đang kiểm tra nhóm bàn trên server..."
                        errorLabel="Không kiểm tra được nhóm bàn trên server. Vui lòng tải lại trước khi lưu để tránh conflict."
                        onRetry={retryTablePreflight}
                        verifiedMeta={tablePreflight ? (
                          <>
                            <Badge tone={tablePreflight.capacityGap > 0 ? "red" : "green"}>
                              {tablePreflight.totalCapacity}/{selected.partySize} ghế
                            </Badge>
                            <Badge tone="blue">{tablePreflight.tableCount} bàn</Badge>
                          </>
                        ) : null}
                      />

                      {visibleTablePreflightState === "idle" && selectedAssignmentConflictCount > 0 ? (
                        <p className="mt-3 rounded-lg border border-[rgba(197,48,48,0.16)] bg-[var(--danger-soft)] p-3 text-sm font-semibold text-[var(--accent-strong)]">
                          Có bàn trong nhóm đang chồng lịch với reservation khác cùng khung giờ. Hãy bỏ bàn đó hoặc chọn giờ/bàn khác trước khi lưu.
                        </p>
                      ) : visibleTablePreflightState === "idle" && (selectedBusyAssignmentCount > 0 || selectedQrDisabledCount > 0) ? (
                        <p className="mt-3 rounded-lg border border-[rgba(242,140,40,0.20)] bg-[var(--accent-soft)] p-3 text-sm font-semibold text-[var(--accent-strong)]">
                          Nhóm bàn có bàn đang phục vụ hoặc QR tắt. Vẫn có thể lưu nếu không chồng lịch, nhưng staff nên kiểm tra vận hành trước khi nhận khách.
                        </p>
                      ) : null}

                      <div className="mt-3 grid max-h-[360px] gap-2 overflow-y-auto pr-1">
                        {tableAssignmentOptions.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-3 text-sm font-semibold text-[var(--muted-foreground)]">
                            Không có bàn khả dụng để giữ chỗ.
                          </div>
                        ) : filteredTableAssignmentOptions.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-3 text-sm font-semibold text-[var(--muted-foreground)]">
                            Không có bàn phù hợp bộ lọc hiện tại.
                          </div>
                        ) : (
                          filteredTableAssignmentOptions.map((table) => {
                            const checked = selectedTableSelectionIds.includes(table.id);
                            const addingDisabled = !checked && selectedTableSelectionIds.length >= 8;
                            const conflicts = selected ? tableAssignmentConflictsById.get(table.id) ?? [] : [];
                            const serverTable = preflightTableById.get(table.id);
                            const tableSignals = [
                              ...tableOperationalSignals(table).map((signal) => ({ code: signal.key, label: signal.label, tone: signal.tone })),
                              ...(serverTable?.signals ?? []),
                              ...(conflicts.length > 0 ? [{ key: "conflict", label: `${conflicts.length} chồng lịch`, tone: "red" as const }] : []),
                              ...(table.capacity < selected.partySize ? [{ key: "small", label: "Cần ghép", tone: "yellow" as const }] : [])
                            ]
                              .map((signal) => ({ code: "code" in signal ? signal.code : signal.key, label: signal.label, tone: signal.tone }))
                              .filter((signal, index, signals) => signals.findIndex((item) => item.code === signal.code) === index);
                            return (
                              <label key={table.id} className={`grid min-h-16 cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg border p-3 text-sm font-semibold transition ${checked ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-strong)]" : "border-[var(--border)] bg-[var(--soft-surface)] text-[var(--foreground)]"} ${addingDisabled ? "cursor-not-allowed opacity-60" : ""} ${conflicts.length > 0 ? "border-[var(--tertiary)]/40" : ""}`}>
                                <input type="checkbox" checked={checked} disabled={addingDisabled} onChange={() => toggleTableSelection(table.id)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--primary)]" />
                                <span className="min-w-0 flex-1">
                                  <span className="flex flex-wrap items-center gap-2">
                                    <span className="truncate">{table.name}</span>
                                    <Badge tone={table.capacity >= selected.partySize ? "green" : "yellow"}>{table.capacity} ghế</Badge>
                                    {tableSignals.map((signal) => <Badge key={signal.code} tone={signal.tone}>{signal.label}</Badge>)}
                                  </span>
                                  <span className="mt-1 block truncate text-xs font-semibold text-[var(--muted-foreground)]">
                                    {table.floorLabel || "Tầng trệt"} · {table.area || "Khu chính"} · {seatingZoneLabels[table.seatingZone ?? ""] ?? "Linh hoạt"} · {tableKindLabels[table.tableKind ?? ""] ?? "Tiêu chuẩn"}
                                  </span>
                                  {conflicts[0] ? <span className="mt-1 block truncate text-xs font-semibold text-[var(--accent-strong)]">Chồng với {conflicts[0].customerName} · {reservationTimeRange(conflicts[0])}</span> : null}
                                </span>
                              </label>
                            );
                          })
                        )}
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                        <p className="text-xs font-semibold leading-5 text-[var(--muted-foreground)]">
                          QR chính: {assignedTableOption?.name ?? "Chưa có bàn"} · Nhóm giữ chỗ {selectedTableSelectionIds.length} bàn.
                          {tableAssignmentSaveBlocker ? <span className="block text-[var(--accent-strong)]">Chưa thể lưu: {tableAssignmentSaveBlocker}</span> : null}
                        </p>
                        <Button type="button" variant="secondary" onClick={() => void submitTableAssignment()} disabled={mutatingId === selected.id || !canSaveTableAssignment}>
                          {mutatingId === selected.id ? <Loader2 className="animate-spin" size={16} /> : null}
                          Lưu nhóm bàn
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
        </DashboardDrawer>
      ) : null}
    </>
  );
}

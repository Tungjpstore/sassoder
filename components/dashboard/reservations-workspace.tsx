"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Banknote, CalendarCheck, Check, Clock3, Copy, ExternalLink, Loader2, MapPin, QrCode, RefreshCw, Settings2, Sofa, UserRoundCheck, UsersRound, X } from "lucide-react";
import { updateReservationSettingsAction } from "@/app/dashboard/actions";
import { RestaurantVisitMapCard } from "@/components/location/restaurant-visit-map-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatVnd } from "@/lib/money";
import { reservationDepositStatusLabel, reservationStatusLabel } from "@/lib/labels";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
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
  floorLabel?: string | null;
  seatingZone?: string | null;
  tableKind?: string | null;
  isBookable?: boolean;
  isHidden?: boolean;
  isUnderMaintenance?: boolean;
};

type DrawerMode = "closed" | "detail" | "settings" | "share";
type RealtimeState = "connecting" | "connected" | "error";
type FilterKey = "today" | "holding" | "waiting_deposit_confirm" | "confirmed" | "checked_in" | "seated" | "history";

function todayInputValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

function shortId(id: string) {
  return `#${id.slice(0, 6).toUpperCase()}`;
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

function holdCountdown(reservation: ReservationDto) {
  if (!reservation.holdExpiresAt || !["holding", "waiting_deposit_confirm"].includes(reservation.status)) return null;
  const minutes = Math.ceil((new Date(reservation.holdExpiresAt).getTime() - Date.now()) / 60000);
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

function canMarkNoShow(reservation: ReservationDto, arrivalGraceMinutes: number) {
  if (reservation.status !== "confirmed") return false;
  return Date.now() >= new Date(reservation.startsAt).getTime() + arrivalGraceMinutes * 60_000;
}

function actionEndpoint(action: "confirm-deposit" | "check-in" | "seat" | "cancel" | "reject" | "no-show" | "move-table", reservationId: string) {
  return `/api/admin/reservations/${reservationId}/${action}`;
}

function tableOptionLabel(table: ReservationTableOption) {
  const floor = table.floorLabel || "Tầng trệt";
  const area = table.area || "Khu chính";
  const flags = [table.tableKind === "vip" ? "VIP" : null, table.seatingZone === "outdoor" ? "ngoài trời" : null].filter(Boolean).join(", ");
  return `${table.name} · ${floor} · ${area} · ${table.capacity} khách${flags ? ` · ${flags}` : ""}`;
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
            <p className="text-sm font-black text-[var(--foreground)]">Vị trí đặt bàn dùng chung với bản đồ quán</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-[var(--muted-foreground)]">
              {settings.address || "Chưa có địa chỉ quán."}{" "}
              {settings.store_lat !== null && settings.store_lng !== null ? "Đã có toạ độ cho chỉ đường." : "Chưa ghim toạ độ."}
            </p>
            <Link href="/dashboard/settings?section=online" className="mt-2 inline-flex min-h-11 items-center text-sm font-black text-[var(--primary)] hover:text-[var(--primary-strong)]">
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

      {state?.error ? <p className="text-sm font-bold text-[var(--accent-strong)]">{state.error}</p> : null}
      {state?.success ? <p className="text-sm font-bold text-[var(--primary-strong)]">{state.success}</p> : null}

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
  publicUrl
}: {
  restaurantId: string;
  settings: ReservationSettings;
  initialReservations: ReservationDto[];
  tableOptions: ReservationTableOption[];
  publicUrl: string;
}) {
  const [date, setDate] = useState(todayInputValue());
  const [reservations, setReservations] = useState(initialReservations);
  const [selectedId, setSelectedId] = useState(initialReservations[0]?.id ?? null);
  const [drawer, setDrawer] = useState<DrawerMode>("closed");
  const [filter, setFilter] = useState<FilterKey>("today");
  const [loading, setLoading] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [moveTableId, setMoveTableId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("connecting");
  const refreshTimerRef = useRef<number | null>(null);
  const selected = reservations.find((reservation) => reservation.id === selectedId) ?? null;

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

  const visibleReservations = useMemo(() => {
    return reservations.filter((reservation) => {
      if (filter === "today") return !isHistory(reservation.status);
      if (filter === "history") return isHistory(reservation.status);
      return reservation.status === filter;
    });
  }, [reservations, filter]);

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

  const moveTableOptions = useMemo(() => {
    if (!selected) return [];
    const currentTableIds = new Set(selected.tables.map((table) => table.id));
    return tableOptions.filter(
      (table) =>
        !currentTableIds.has(table.id) &&
        table.capacity >= selected.partySize &&
        table.isBookable !== false &&
        !table.isHidden &&
        !table.isUnderMaintenance
    );
  }, [selected, tableOptions]);

  const selectedMoveTableId = moveTableOptions.some((table) => table.id === moveTableId)
    ? moveTableId
    : moveTableOptions[0]?.id ?? "";

  async function runAction(action: "confirm-deposit" | "check-in" | "seat" | "cancel" | "reject" | "no-show" | "move-table", reservationId: string, body?: Record<string, string>) {
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
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Thao tác thất bại.");
    } finally {
      setMutatingId(null);
    }
  }

  async function copyPublicUrl() {
    await navigator.clipboard.writeText(publicUrl);
  }

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => void loadReservations(date, true), 280);
    };

    const channel = supabase
      .channel(`admin-reservations:${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations", filter: `restaurant_id=eq.${restaurantId}` }, scheduleRefresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeState("connected");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtimeState("error");
      });

    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [date, loadReservations, restaurantId]);

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <section className="dashboard-panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Badge tone={settings.reservations_enabled ? "green" : "yellow"}>{settings.reservations_enabled ? "Đang nhận đặt bàn" : "Đang tắt đặt bàn"}</Badge>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--foreground)]">Đặt bàn trước</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
                  Quản lý lịch giữ bàn, cọc VietQR, chống trùng lịch và nhận khách vào bàn đang phục vụ.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => setDrawer("settings")}>
                  <Settings2 size={16} />
                  Cấu hình
                </Button>
                <Button type="button" onClick={() => setDrawer("share")}>
                  <QrCode size={16} />
                  Link đặt bàn
                </Button>
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
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{item.label}</p>
                    <p className="metric-number mt-1 text-2xl font-semibold text-[var(--foreground)]">{item.value}</p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="dashboard-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                    void loadReservations(event.target.value);
                  }}
                  className="w-[180px]"
                />
                <button type="button" onClick={() => void loadReservations(date)} className="inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--primary)]">
                  {loading ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
                  Tải lại
                </button>
              </div>
              <Badge tone={realtimeState === "connected" ? "green" : realtimeState === "error" ? "red" : "yellow"}>
                {realtimeState === "connected" ? "Cập nhật tức thời đang bật" : realtimeState === "error" ? "Kết nối bị gián đoạn" : "Đang kết nối"}
              </Badge>
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
                  className={`h-11 shrink-0 rounded-md px-3 text-sm font-semibold transition ${filter === key ? "bg-[var(--surface)] text-[var(--primary)]" : "text-[var(--muted-foreground)]"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {error ? <p className="mt-4 rounded-xl bg-[var(--danger-soft)] p-3 text-sm font-bold text-[var(--accent-strong)]">{error}</p> : null}

            <div className="mt-4 grid gap-2">
              {visibleReservations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-8 text-center text-sm font-semibold text-[var(--muted-foreground)]">
                  Chưa có lịch đặt phù hợp bộ lọc.
                </div>
              ) : (
                visibleReservations.map((reservation) => (
                  <button
                    key={reservation.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(reservation.id);
                      setDrawer("detail");
                    }}
                    className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--primary)] md:grid-cols-[1fr_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[var(--foreground)]">{reservation.customerName}</span>
                        <Badge tone={statusTone(reservation.status)}>{reservationStatusLabel(reservation.status)}</Badge>
                        <Badge tone={reservation.depositStatus === "paid" ? "green" : reservation.depositStatus === "waiting_confirm" ? "yellow" : "neutral"}>
                          {reservationDepositStatusLabel(reservation.depositStatus)}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm font-medium text-[var(--muted-foreground)]">
                        {formatTime(reservation.startsAt)} · {reservation.partySize} khách · {reservation.tables[0]?.name ?? "Chưa có bàn"}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="metric-number font-semibold text-[var(--foreground)]">{reservation.depositRequiredAmount > 0 ? formatVnd(reservation.depositRequiredAmount) : "Không cọc"}</p>
                      <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">{shortId(reservation.id)}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
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
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                  {drawer === "settings" ? "Cấu hình" : drawer === "share" ? "Chia sẻ" : "Chi tiết"}
                </p>
                <h2 id="reservation-drawer-title" className="mt-1 text-xl font-semibold text-[var(--foreground)] sm:text-2xl">
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
                      <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--primary)]">
                        <ExternalLink size={16} />
                        Mở trang khách
                      </a>
                      <a href="/api/admin/reservation-qr?size=1200&download=1" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--primary)]">
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
                        <h3 className="mt-1 text-2xl font-semibold text-[var(--foreground)]">{selected.customerName}</h3>
                      </div>
                      <Badge tone={statusTone(selected.status)}>{reservationStatusLabel(selected.status)}</Badge>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm font-semibold sm:grid-cols-2">
                      <p><span className="text-[var(--muted-foreground)]">Thời gian:</span> {formatTime(selected.startsAt)}</p>
                      <p><span className="text-[var(--muted-foreground)]">Số khách:</span> {selected.partySize}</p>
                      <p><span className="text-[var(--muted-foreground)]">Điện thoại:</span> {selected.customerPhone}</p>
                      <p><span className="text-[var(--muted-foreground)]">Email:</span> {selected.customerEmail || "Chưa có"}</p>
                      <p><span className="text-[var(--muted-foreground)]">Bàn giữ:</span> {selected.tables.map((table) => table.name).join(", ") || "Chưa có"}</p>
                      <p><span className="text-[var(--muted-foreground)]">Hết hạn cọc:</span> {holdCountdown(selected) ?? "Không áp dụng"}</p>
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
                    <Button type="button" variant="secondary" onClick={() => runAction("no-show", selected.id)} disabled={mutatingId === selected.id || !canMarkNoShow(selected, settings.reservation_arrival_grace_minutes)}>
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

                  {!isHistory(selected.status) && selected.status !== "seated" ? (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                        <Sofa size={16} className="text-[var(--primary)]" />
                        Đổi bàn giữ chỗ
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                        <select
                          value={selectedMoveTableId}
                          onChange={(event) => setMoveTableId(event.target.value)}
                          className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--primary)]"
                          disabled={moveTableOptions.length === 0}
                        >
                          {moveTableOptions.length === 0 ? <option value="">Không có bàn phù hợp</option> : null}
                          {moveTableOptions.map((table) => (
                            <option key={table.id} value={table.id}>
                              {tableOptionLabel(table)}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => selectedMoveTableId && runAction("move-table", selected.id, { tableId: selectedMoveTableId })}
                          disabled={mutatingId === selected.id || !selectedMoveTableId}
                        >
                          Đổi bàn
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

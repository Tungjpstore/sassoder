"use client";

/* RealReservationsWorkspaceV2 — production /dashboard/reservations.
 * Full v2 layout (Toolbar + KPI + FilterTabs + card grid + Drawer).
 * Backend giữ thật:
 *  - 9 mutation endpoints qua /api/admin/reservations/:id/{action}
 *  - Supabase realtime channel
 *  - "Quản lý nâng cao" drawer mở legacy ReservationsWorkspace cho timeline/calendar/floor + settings + preflights
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Eye, Phone, Plus, Settings2, Users, Wallet, X } from "lucide-react";
import { FilterTabs, Toolbar } from "../workspace-ui";
import { MetricCard, EmptyState, Badge } from "../primitives";
import { Button } from "../button";
import { Drawer, Modal } from "../overlay";
import { RealtimeStatusBadge, type RealtimeState } from "../realtime";
import { ReservationsWorkbenchV2 } from "@/components/dashboard-v2/real/reservations/adapters/legacy-reservations-workbench";
import { useToast } from "@/components/dashboard-v2/adapters/dashboard-shared";
import { readDashboardApiResponse } from "@/lib/dashboard/api-response";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { formatVnd } from "@/lib/money";
import { reservationStatusLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ReservationAnalytics } from "@/services/reservation-analytics";
import type { ReservationDto } from "@/types/domain";

type ReservationSettings = Parameters<typeof ReservationsWorkbenchV2>[0]["settings"];
type ReservationTableOption = Parameters<typeof ReservationsWorkbenchV2>[0]["tableOptions"][number];

type Props = {
  restaurantId: string;
  settings: ReservationSettings;
  initialReservations: ReservationDto[];
  tableOptions: ReservationTableOption[];
  publicUrl: string;
  analytics: ReservationAnalytics;
  initialNowMs: number;
};

type ReservationAction = "confirm-deposit" | "check-in" | "seat" | "cancel" | "no-show" | "reject";
type Tab = "all" | "pending" | "confirmed" | "seated" | "history";

function statusToneV2(status: ReservationDto["status"]): "ok" | "orange" | "info" | "danger" | "neutral" {
  if (status === "confirmed" || status === "checked_in" || status === "seated" || status === "completed") return "ok";
  if (status === "holding" || status === "waiting_deposit_confirm") return "orange";
  if (status === "cancelled" || status === "rejected" || status === "no_show" || status === "expired") return "danger";
  return "neutral";
}

function isHistory(status: ReservationDto["status"]) {
  return ["completed", "cancelled", "rejected", "expired", "no_show"].includes(status);
}

function tabOf(status: ReservationDto["status"]): Tab {
  if (isHistory(status)) return "history";
  if (status === "seated" || status === "checked_in") return "seated";
  if (status === "confirmed") return "confirmed";
  return "pending";
}

function tableLabel(r: ReservationDto) {
  const names = r.tables.map((t) => t.name).filter(Boolean);
  if (names.length === 0) return "Chưa xếp bàn";
  if (names.length === 1) return `Bàn ${names[0]}`;
  return `${names.length} bàn ghép`;
}

function formatClock(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(value));
}

function nextAction(r: ReservationDto): { action: ReservationAction; label: string } | null {
  if (r.status === "waiting_deposit_confirm" && r.depositStatus === "waiting_confirm") return { action: "confirm-deposit", label: "Xác nhận cọc" };
  if (r.status === "confirmed") return { action: "check-in", label: "Check-in" };
  if (r.status === "checked_in" && r.tables.length > 0) return { action: "seat", label: "Nhận bàn" };
  if (r.status === "holding") return { action: "confirm-deposit", label: "Xác nhận" };
  return null;
}

function reservationActionToast(action: ReservationAction) {
  if (action === "confirm-deposit") return { title: "Đã xác nhận cọc", message: "Lịch đặt bàn đã được giữ chắc cho khách." };
  if (action === "check-in") return { title: "Đã check-in khách", message: "Khách đã đến quán và sẵn sàng xếp bàn." };
  if (action === "seat") return { title: "Đã nhận khách vào bàn", message: "Bàn đã chuyển sang trạng thái đang phục vụ." };
  if (action === "cancel") return { title: "Đã huỷ đặt bàn", message: "Lịch đặt bàn đã được đóng trong hệ thống." };
  if (action === "no-show") return { title: "Đã đánh dấu no-show", message: "Hệ thống đã ghi nhận khách không đến." };
  return { title: "Đã từ chối đặt bàn", message: "Yêu cầu đặt bàn đã được đóng." };
}

export function RealReservationsWorkspaceV2(props: Props) {
  const { restaurantId, initialReservations, analytics } = props;
  const router = useRouter();
  const toast = useToast();
  const [reservations, setReservations] = useState<ReservationDto[]>(initialReservations);
  const [tab, setTab] = useState<Tab>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rtState, setRtState] = useState<RealtimeState>("connecting");
  const [nowMs, setNowMs] = useState(props.initialNowMs);
  const refreshRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  /* Realtime channel */
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const sched = (delay = 240) => {
      if (refreshRef.current) window.clearTimeout(refreshRef.current);
      refreshRef.current = window.setTimeout(() => router.refresh(), delay);
    };
    const channel = supabase
      .channel(`admin-reservations-v2:${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations", filter: `restaurant_id=eq.${restaurantId}` }, () => sched())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRtState("connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRtState("error");
      });
    return () => {
      if (refreshRef.current) window.clearTimeout(refreshRef.current);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, router]);

  async function runAction(id: string, action: ReservationAction) {
    if (mutatingId) return;
    setMutatingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reservations/${id}/${action}`, { method: "POST", cache: "no-store" });
      await readDashboardApiResponse(res, "Thao tác đặt bàn thất bại");
      toast.success(reservationActionToast(action));
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Thao tác thất bại";
      setError(message);
      toast.error({ title: "Không xử lý được đặt bàn", message });
    } finally {
      setMutatingId(null);
    }
  }

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: 0, pending: 0, confirmed: 0, seated: 0, history: 0 };
    for (const r of reservations) {
      c.all += 1;
      c[tabOf(r.status)] += 1;
    }
    return c;
  }, [reservations]);

  const upcomingSoon = useMemo(() => {
    return reservations
      .filter((r) => !isHistory(r.status) && r.status !== "cancelled" && r.status !== "rejected")
      .map((r) => ({ r, mins: Math.floor((new Date(r.startsAt).getTime() - nowMs) / 60_000) }))
      .filter((x) => x.mins >= 0 && x.mins <= 30)
      .sort((a, b) => a.mins - b.mins);
  }, [nowMs, reservations]);

  const visible = useMemo(() => {
    if (tab === "all") return reservations.filter((r) => !isHistory(r.status));
    return reservations.filter((r) => tabOf(r.status) === tab);
  }, [reservations, tab]);
  const selected = reservations.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <Toolbar eyebrow="Đặt bàn trước" title="Đặt bàn">
        <RealtimeStatusBadge state={rtState} />
        <Button variant="primary" size="md" onClick={() => setCreateOpen(true)}><Plus size={15} /> Tạo đặt bàn</Button>
        <Button variant="secondary" size="md" onClick={() => setAdvancedOpen(true)}><Settings2 size={15} /> Quản lý chi tiết</Button>
      </Toolbar>

      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        <MetricCard icon={<CalendarClock size={18} />} label="Đặt bàn" value={String(analytics.totalReservations)} helper={`Trong ${analytics.windowDays} ngày`} tone="jade" />
        <MetricCard icon={<Users size={18} />} label="Tổng khách" value={String(analytics.totalGuests)} helper={`TB ${analytics.averagePartySize.toFixed(1)} khách/đặt`} tone="info" />
        <MetricCard icon={<Wallet size={18} />} label="Cọc đã thu" value={formatVnd(analytics.deposit.paidAmount)} helper={`${analytics.deposit.paidCount}/${analytics.deposit.requiredCount} đã đóng`} tone="orange" />
        <MetricCard icon={<Check size={18} />} label="Tỉ lệ tới" value={`${Math.round(analytics.arrivalRate * 100)}%`} helper={`No-show ${Math.round(analytics.noShowRate * 100)}%`} tone="neutral" />
      </section>

      {error ? (
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-danger-fg)]/30 bg-[var(--d-danger-bg)] px-[var(--d-s-4)] py-2.5 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-danger-fg)]">
          {error}
        </div>
      ) : null}

      {upcomingSoon.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-[var(--d-r-lg)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)] p-[var(--d-s-4)]">
          <div className="flex items-center gap-2">
            <CalendarClock size={16} className="text-[var(--d-orange-600)]" />
            <p className="text-[length:var(--d-fs-sm)] font-bold text-[var(--d-orange-600)]">
              Sắp tới trong 30 phút · {upcomingSoon.length} đặt bàn
            </p>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {upcomingSoon.slice(0, 6).map(({ r, mins }) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className="flex items-center justify-between gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-left transition hover:border-[var(--d-orange)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{r.customerName}</span>
                  <span className="block truncate text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{r.partySize} khách · {tableLabel(r)}</span>
                </span>
                <span className={`d-num shrink-0 rounded-[var(--d-r-pill)] px-2 py-0.5 text-[length:var(--d-fs-2xs)] font-bold ${mins <= 15 ? "bg-[var(--d-danger-bg)] text-[var(--d-danger-fg)]" : "bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]"}`}>
                  {mins === 0 ? "Bây giờ" : `${mins}p nữa`}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <FilterTabs
        active={tab}
        onChange={(k) => setTab(k as Tab)}
        tabs={[
          { key: "all", label: "Sắp tới", count: counts.all - counts.history },
          { key: "pending", label: "Chờ xác nhận", count: counts.pending },
          { key: "confirmed", label: "Đã xác nhận", count: counts.confirmed },
          { key: "seated", label: "Đang ngồi", count: counts.seated },
          { key: "history", label: "Lịch sử", count: counts.history }
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<CalendarClock size={22} />}
          title="Chưa có đặt bàn ở mục này"
          description="Tạo đặt bàn mới để giữ chỗ cho khách."
          action={<Button variant="primary" size="md" onClick={() => setCreateOpen(true)}><Plus size={15} /> Tạo đặt bàn</Button>}
        />
      ) : (
        <div className="grid gap-[var(--d-s-3)] sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((r) => (
            <ReservationCard
              key={r.id}
              reservation={r}
              mutating={mutatingId === r.id}
              onDetail={() => setSelectedId(r.id)}
              onAction={(act) => void runAction(r.id, act)}
            />
          ))}
        </div>
      )}

      {selected ? (
        <ReservationDrawer
          reservation={selected}
          mutating={mutatingId === selected.id}
          onClose={() => setSelectedId(null)}
          onAction={(act) => void runAction(selected.id, act)}
        />
      ) : null}

      <Drawer
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        width="lg"
        title="Quản lý đặt bàn nâng cao"
        subtitle="Lịch ca, settings, preflight, multi-view"
        contentClassName="px-2 sm:px-3"
      >
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-3)]">
          <ReservationsWorkbenchV2 {...props} />
        </div>
      </Drawer>

      <CreateReservationModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        restaurantSlug={props.settings.slug}
        onCreated={() => {
          setCreateOpen(false);
          toast.success({ title: "Đã tạo đặt bàn", message: "Lịch mới đã được thêm vào danh sách." });
          router.refresh();
        }}
      />

    </div>
  );
}

function ReservationCard({
  reservation,
  mutating,
  onDetail,
  onAction
}: {
  reservation: ReservationDto;
  mutating: boolean;
  onDetail: () => void;
  onAction: (act: ReservationAction) => void;
}) {
  const next = nextAction(reservation);
  const accent =
    reservation.status === "confirmed" || reservation.status === "checked_in" || reservation.status === "seated"
      ? "var(--d-jade)"
      : reservation.status === "holding" || reservation.status === "waiting_deposit_confirm"
      ? "var(--d-orange)"
      : isHistory(reservation.status)
      ? "var(--d-line-strong)"
      : "var(--d-info-fg)";

  return (
    <article className="relative flex flex-col overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--d-sh-md)]">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
      <header className="flex items-start justify-between gap-2 px-[var(--d-s-4)] pb-2 pt-[var(--d-s-4)]">
        <div className="min-w-0">
          <p className="text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{reservation.customerName}</p>
          <a href={`tel:${reservation.customerPhone}`} className="mt-0.5 inline-flex items-center gap-1.5 text-[length:var(--d-fs-xs)] text-[var(--d-primary)]">
            <Phone size={12} />
            {reservation.customerPhone}
          </a>
        </div>
        <Badge tone={statusToneV2(reservation.status)}>{reservationStatusLabel(reservation.status)}</Badge>
      </header>

      <div className="grid grid-cols-3 gap-2 px-[var(--d-s-4)] pb-3">
        <Tile label="Lúc" value={formatClock(reservation.startsAt)} />
        <Tile label="Khách" value={`${reservation.partySize} người`} />
        <Tile label="Bàn" value={tableLabel(reservation)} />
      </div>

      {reservation.depositRequiredAmount > 0 ? (
        <div className="border-t border-[var(--d-line)] bg-[var(--d-surface-2)]/40 px-[var(--d-s-4)] py-2 text-[length:var(--d-fs-xs)]">
          <span className="text-[var(--d-text-muted)]">Cọc:</span>{" "}
          <span className="d-num font-semibold text-[var(--d-text)]">
            {formatVnd(reservation.depositPaidAmount)} / {formatVnd(reservation.depositRequiredAmount)}
          </span>
        </div>
      ) : null}

      {reservation.customerNote ? (
        <p className="border-t border-[var(--d-line)] bg-[var(--d-surface-2)]/40 px-[var(--d-s-4)] py-2 text-[length:var(--d-fs-xs)] italic text-[var(--d-text-muted)]">
          "{reservation.customerNote}"
        </p>
      ) : null}

      <div className="grid grid-cols-3 border-t border-[var(--d-line)]">
        <button
          type="button"
          onClick={onDetail}
          className="flex h-11 items-center justify-center gap-1 border-r border-[var(--d-line)] text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)] transition hover:bg-[var(--d-surface-2)] hover:text-[var(--d-text)]"
        >
          <Eye size={15} /> Chi tiết
        </button>
        <button
          type="button"
          onClick={() => onAction("cancel")}
          className="flex h-11 items-center justify-center gap-1 border-r border-[var(--d-line)] text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)] transition hover:bg-[var(--d-danger-bg)] hover:text-[var(--d-danger-fg)] disabled:opacity-50"
          disabled={isHistory(reservation.status) || mutating}
        >
          <X size={15} /> Huỷ
        </button>
        {next ? (
          <button
            type="button"
            onClick={() => onAction(next.action)}
            disabled={mutating}
            className="flex h-11 items-center justify-center gap-1 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-on-jade)] transition active:scale-[0.99] disabled:opacity-60"
            style={{ background: accent }}
          >
            <Check size={15} /> {next.label}
          </button>
        ) : (
          <span className="flex h-11 items-center justify-center gap-1 bg-[var(--d-surface-2)] text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-faint)]">
            Xong
          </span>
        )}
      </div>
    </article>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--d-r-sm)] bg-[var(--d-surface-2)] p-2 text-center">
      <p className="text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">{label}</p>
      <p className="d-num mt-0.5 truncate text-[length:var(--d-fs-xs)] font-bold text-[var(--d-text)]">{value}</p>
    </div>
  );
}

function ReservationDrawer({
  reservation,
  mutating,
  onClose,
  onAction
}: {
  reservation: ReservationDto;
  mutating: boolean;
  onClose: () => void;
  onAction: (act: ReservationAction) => void;
}) {
  const next = nextAction(reservation);

  return (
    <Drawer
      open
      onClose={onClose}
      width="md"
      title={reservation.customerName}
      subtitle={`${reservation.partySize} khách · ${formatClock(reservation.startsAt)}`}
      headerMeta={<Badge tone={statusToneV2(reservation.status)}>{reservationStatusLabel(reservation.status)}</Badge>}
      footer={
        <div className="flex flex-wrap gap-2">
          {reservation.status === "holding" || reservation.status === "waiting_deposit_confirm" ? (
            <Button variant="danger" size="lg" disabled={mutating} onClick={() => onAction("reject")}>
              <X size={15} /> Từ chối
            </Button>
          ) : (
            <Button variant="danger" size="lg" disabled={mutating || isHistory(reservation.status)} onClick={() => onAction("no-show")}>
              No-show
            </Button>
          )}
          <Button variant="secondary" size="lg" className="flex-1" disabled={mutating || isHistory(reservation.status)} onClick={() => onAction("cancel")}>
            Huỷ đặt
          </Button>
          {next ? (
            <Button variant="primary" size="lg" className="flex-[2]" disabled={mutating} onClick={() => onAction(next.action)}>
              <Check size={15} /> {next.label}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-[var(--d-s-5)]">
        <section className="grid grid-cols-3 gap-2">
          <Tile label="Lúc" value={formatClock(reservation.startsAt)} />
          <Tile label="Khách" value={`${reservation.partySize} người`} />
          <Tile label="Bàn" value={tableLabel(reservation)} />
        </section>

        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
          <p className="d-eyebrow">Liên hệ</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Tile label="SĐT" value={reservation.customerPhone} />
            <Tile label="Email" value={reservation.customerEmail ?? "—"} />
          </div>
          {reservation.customerNote ? (
            <p className="mt-3 text-[length:var(--d-fs-sm)] italic text-[var(--d-text-muted)]">"{reservation.customerNote}"</p>
          ) : null}
        </section>

        {reservation.depositRequiredAmount > 0 ? (
          <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-4)]">
            <p className="d-eyebrow">Cọc giữ chỗ</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Tile label="Yêu cầu" value={formatVnd(reservation.depositRequiredAmount)} />
              <Tile label="Đã thu" value={formatVnd(reservation.depositPaidAmount)} />
            </div>
          </section>
        ) : null}
      </div>
    </Drawer>
  );
}

function CreateReservationModal({
  open,
  onClose,
  restaurantSlug,
  onCreated
}: {
  open: boolean;
  onClose: () => void;
  restaurantSlug: string;
  onCreated: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  async function submit(formData: FormData) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const date = String(formData.get("date") ?? "");
      const time = String(formData.get("time") ?? "");
      const startsAt = new Date(`${date}T${time}:00`).toISOString();
      const body = {
        restaurantSlug,
        customerName: String(formData.get("customerName") ?? "").trim(),
        customerPhone: String(formData.get("customerPhone") ?? "").trim(),
        customerEmail: String(formData.get("customerEmail") ?? "").trim() || undefined,
        partySize: Number(formData.get("partySize") ?? 2),
        startsAt,
        customerNote: String(formData.get("customerNote") ?? "").trim() || undefined
      };
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const t = await res.text().catch(() => `${res.status}`);
        throw new Error(t || "Không tạo được đặt bàn");
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tạo được đặt bàn");
    } finally {
      setSubmitting(false);
    }
  }

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Tạo đặt bàn mới"
      subtitle="Đặt bàn trước"
    >
      <form action={submit} className="grid gap-3">
        {error ? (
          <p className="rounded-[var(--d-r-md)] border border-[var(--d-danger-fg)]/30 bg-[var(--d-danger-bg)] px-3 py-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-danger-fg)]">
            {error}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Tên khách</span>
            <input name="customerName" required minLength={2} maxLength={120} className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">SĐT</span>
            <input name="customerPhone" required pattern="[0-9+() .\-]{6,24}" className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Email (tuỳ chọn)</span>
            <input name="customerEmail" type="email" className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Số khách</span>
            <input name="partySize" type="number" min={1} max={100} defaultValue={2} required className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Ngày</span>
            <input name="date" type="date" min={todayStr} defaultValue={todayStr} required className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Giờ</span>
            <input name="time" type="time" defaultValue="19:00" required className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Ghi chú khách (tuỳ chọn)</span>
            <textarea name="customerNote" maxLength={300} className="min-h-20 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" />
          </label>
        </div>
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary" size="md" disabled={submitting}>
            <Plus size={15} /> {submitting ? "Đang tạo…" : "Tạo đặt bàn"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

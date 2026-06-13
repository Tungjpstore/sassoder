"use client";

/* RealOverviewWorkspaceV2 — production /dashboard (Ca bán hôm nay).
 * Layout mirror demo overview: KPI strip + Sparkline + section "Đơn cần
 * xử lý" + tab pill + card grid + drawer chi tiết. Đọc cùng dữ liệu
 * route đã tính sẵn (operations, recentOrders, hourlyRevenueToday...).
 * Backend giữ nguyên 1:1.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Banknote,
  Bell,
  Check,
  ChefHat,
  Clock3,
  CreditCard,
  Eye,
  QrCode,
  RefreshCw,
  TrendingUp,
  Truck,
  Users,
  Utensils
} from "lucide-react";
import { Sparkline } from "../charts";
import { Toolbar } from "../workspace-ui";
import { Drawer } from "../overlay";
import { NextSteps } from "../cross-link";
import { Badge, EmptyState, Panel } from "../primitives";
import { Button } from "../button";
import { RealtimeStatusBadge, type RealtimeState } from "../realtime";
import { useToast } from "@/components/dashboard/toast-provider";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { formatVnd } from "@/lib/money";
import { orderStatusLabel, paymentStatusLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

type OrderRow = {
  id: string;
  status: string;
  total: number;
  itemSummary?: string | null;
  createdAt: string;
  tableName?: string | null;
  paymentMethod?: string | null;
};

type HourlyRow = { label: string; revenue: number; orderCount: number };

type Operations = {
  pending: number;
  ordering: number;
  completed: number;
  waitingPayment: number;
  waitingConfirm: number;
  paid: number;
  todayOrders: number;
  todayRevenue: number;
  qrRevenue: number;
  cashRevenue: number;
  averageTicket: number;
  openOrderTotal: number;
};

type Props = {
  restaurantId: string;
  restaurantName: string;
  operations: Operations;
  recentOrders: OrderRow[];
  hourlyRevenueToday: HourlyRow[];
  monthRevenue: number;
  activeTables: number;
  totalTables: number;
  overdueTables: number;
  paymentWaiting: number;
  openOrderCount: number;
  serviceHealthScore: number;
  kitchenLoad: number;
  bestSellerName?: string | null;
  topItemRevenue: number;
};

type StatusFilter = "all" | "pending" | "ordering" | "completed" | "waiting_payment" | "waiting_confirm";

function statusToTab(s: string): StatusFilter {
  if (s === "pending") return "pending";
  if (s === "ordering") return "ordering";
  if (s === "completed") return "completed";
  if (s === "waiting_payment") return "waiting_payment";
  if (s === "waiting_confirm") return "waiting_confirm";
  return "all";
}

function statusBadgeTone(status: string): "ok" | "orange" | "danger" | "info" | "neutral" {
  if (status === "paid" || status === "completed") return "ok";
  if (status === "waiting_payment" || status === "waiting_confirm") return "orange";
  if (status === "cancelled") return "danger";
  return "info";
}

function fulfillmentLabel(o: OrderRow) {
  return o.tableName ?? "Tại bàn";
}

function fulfillmentIcon(_o: OrderRow) {
  return <QrCode size={14} />;
}

function elapsedMin(createdAt: string, nowMs: number) {
  return Math.max(0, Math.floor((nowMs - new Date(createdAt).getTime()) / 60_000));
}

export function RealOverviewWorkspaceV2({
  restaurantId,
  restaurantName,
  operations,
  recentOrders,
  hourlyRevenueToday,
  monthRevenue,
  activeTables,
  totalTables,
  overdueTables,
  paymentWaiting,
  openOrderCount,
  serviceHealthScore,
  kitchenLoad,
  bestSellerName,
  topItemRevenue
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<StatusFilter>("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [rtState, setRtState] = useState<RealtimeState>("connecting");
  const [refreshing, setRefreshing] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  function manualRefresh() {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 1200);
  }

  async function quickAction(orderId: string, action: "accept" | "complete" | "confirm-payment") {
    if (mutatingId) return;
    setMutatingId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/${action}`, { method: "POST", cache: "no-store" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `${res.status} ${res.statusText}`);
      }
      toast.success(action === "accept" ? "Đã nhận đơn." : action === "complete" ? "Đã báo ra món." : "Đã thu tiền.");
      setDetailId(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Thao tác thất bại.");
    } finally {
      setMutatingId(null);
    }
  }

  // Realtime: cùng channels như AdminDashboardClientLayout từng dùng.
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const sched = (delay = 260) => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => router.refresh(), delay);
    };
    const channel = supabase
      .channel(`admin-overview:${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, () => sched())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => sched())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRtState("connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRtState("error");
      });
    const refreshIfVisible = () => {
      if (document.visibilityState !== "hidden" && window.navigator.onLine) sched(0);
    };
    const fb = window.setInterval(refreshIfVisible, 30_000);
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      window.clearInterval(fb);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, router]);

  const counts = useMemo(() => {
    // Badge phản ánh TOÀN CA (từ operations) thay vì chỉ 5 đơn gần đây → tránh đếm sai.
    return {
      all: operations.pending + operations.ordering + operations.completed + operations.waitingPayment + operations.waitingConfirm,
      pending: operations.pending,
      ordering: operations.ordering,
      completed: operations.completed,
      waiting_payment: operations.waitingPayment,
      waiting_confirm: operations.waitingConfirm
    };
  }, [operations]);

  const visible = useMemo(
    () => (tab === "all" ? recentOrders : recentOrders.filter((o) => statusToTab(o.status) === tab)),
    [recentOrders, tab]
  );
  const detail = recentOrders.find((o) => o.id === detailId) ?? null;

  const sparkRevenue = hourlyRevenueToday.length > 0 ? hourlyRevenueToday.map((r) => r.revenue) : [0];
  const sparkOrders = hourlyRevenueToday.length > 0 ? hourlyRevenueToday.map((r) => r.orderCount) : [0];

  const KPIS = [
    { label: "Doanh thu hôm nay", value: formatVnd(operations.todayRevenue), helper: monthRevenue > 0 ? `Tháng: ${formatVnd(monthRevenue)}` : "Chưa có doanh thu tháng", icon: <TrendingUp size={16} />, spark: sparkRevenue, sparkColor: "var(--d-jade)" },
    { label: "Đơn hôm nay", value: String(operations.todayOrders), helper: `${operations.pending} mới · ${operations.ordering} đang làm`, icon: <Check size={16} />, spark: sparkOrders, sparkColor: "var(--d-orange)" },
    { label: "Vé trung bình", value: formatVnd(operations.averageTicket), helper: bestSellerName ? `Bán chạy: ${bestSellerName}` : "Theo dõi món bán chạy", icon: <Users size={16} /> },
    { label: "Tiền chờ thu", value: formatVnd(operations.openOrderTotal), helper: `${paymentWaiting} bill · ${openOrderCount} đơn mở`, icon: <Banknote size={16} />, tone: paymentWaiting > 0 ? "orange" : "jade" }
  ];

  const tabs: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "Tất cả" },
    { key: "pending", label: "Đơn mới" },
    { key: "ordering", label: "Đang làm" },
    { key: "completed", label: "Sẵn sàng" },
    { key: "waiting_payment", label: "Chờ thu" }
  ];

  return (
    <div className="flex flex-col gap-[var(--d-s-5)]">
      <Toolbar eyebrow={`Ca bán · ${restaurantName}`} title="Tổng quan hôm nay">
        <RealtimeStatusBadge state={rtState} />
        <Button variant="secondary" size="md" onClick={manualRefresh} disabled={refreshing}>
          <RefreshCw size={15} className={refreshing ? "animate-spin" : undefined} /> {refreshing ? "Đang làm mới…" : "Làm mới"}
        </Button>
      </Toolbar>

      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        {KPIS.map((k) => (
          <div key={k.label} className="flex flex-col gap-2 rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
            <div className="flex items-center justify-between">
              <span className={cn("grid h-8 w-8 place-items-center rounded-[var(--d-r-md)]", k.tone === "orange" ? "bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]" : "bg-[var(--d-primary-soft)] text-[var(--d-primary)]")}>{k.icon}</span>
              {k.spark ? <Sparkline data={k.spark} stroke={k.sparkColor ?? "var(--d-jade)"} className="h-7 w-14 shrink-0" /> : null}
            </div>
            <p className="d-num text-[1.5rem] font-bold leading-none text-[var(--d-text)]">{k.value}</p>
            <p className="text-[length:var(--d-fs-2xs)] uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{k.label}</p>
            {k.helper ? <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{k.helper}</p> : null}
          </div>
        ))}
      </section>

      <section className="-mx-1 flex gap-[var(--d-s-3)] overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
        <div className="min-w-[150px] shrink-0 lg:min-w-0"><ShiftSignal label="Sức khoẻ ca" value={`${serviceHealthScore}%`} helper={serviceHealthScore >= 82 ? "Ổn định" : serviceHealthScore >= 62 ? "Cần theo dõi" : "Cần xử lý"} tone={serviceHealthScore >= 82 ? "ok" : serviceHealthScore >= 62 ? "orange" : "danger"} /></div>
        <div className="min-w-[150px] shrink-0 lg:min-w-0"><ShiftSignal label="Tải bếp" value={String(kitchenLoad)} helper={`${operations.pending} mới · ${operations.ordering} đang làm`} tone={kitchenLoad >= 8 ? "danger" : kitchenLoad >= 4 ? "orange" : "ok"} /></div>
        <div className="min-w-[150px] shrink-0 lg:min-w-0"><ShiftSignal label="Bàn hoạt động" value={`${activeTables}/${totalTables || 0}`} helper={overdueTables > 0 ? `${overdueTables} bàn quá giờ` : "Không có bàn quá giờ"} tone={overdueTables > 0 ? "danger" : activeTables > 0 ? "orange" : "ok"} /></div>
        <div className="min-w-[150px] shrink-0 lg:min-w-0"><ShiftSignal label="Bán chạy" value={bestSellerName ?? "—"} helper={topItemRevenue > 0 ? `DT: ${formatVnd(topItemRevenue)}` : "Chưa đủ dữ liệu"} tone="info" /></div>
      </section>

      <section className="flex flex-col gap-[var(--d-s-4)]">
        <div className="flex flex-col gap-[var(--d-s-3)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="d-eyebrow text-[var(--d-orange-600)]">Đang diễn ra</p>
            <h2 className="text-[length:var(--d-fs-h1)] font-bold text-[var(--d-text)]">Đơn cần xử lý</h2>
            <p className="mt-0.5 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
              Hiển thị {recentOrders.length} đơn gần đây · badge là tổng toàn ca
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tabs.map((t) => {
              const active = tab === t.key;
              const c = counts[t.key];
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-[var(--d-r-pill)] px-3.5 text-[length:var(--d-fs-sm)] font-semibold transition-colors",
                    active
                      ? "bg-[var(--d-jade)] text-[var(--d-on-jade)]"
                      : "border border-[var(--d-line)] bg-[var(--d-surface)] text-[var(--d-text-muted)] hover:border-[var(--d-line-strong)] hover:text-[var(--d-text)]"
                  )}
                >
                  {t.label}
                  <span className={cn("d-num grid h-5 min-w-5 place-items-center rounded-full px-1 text-[length:var(--d-fs-2xs)] font-bold", active ? "bg-white/20 text-[var(--d-on-jade)]" : "bg-[var(--d-surface-2)] text-[var(--d-text-faint)]")}>
                    {c}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState icon={<Bell size={22} />} title="Không có đơn ở mục này" description="Đơn mới sẽ hiện ngay khi khách gọi món." />
        ) : (
          <div className="grid gap-[var(--d-s-3)] sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((o) => (
              <OrderCard key={o.id} order={o} nowMs={nowMs} onDetail={() => setDetailId(o.id)} />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-[var(--d-s-3)] lg:grid-cols-3">
        <Panel className="p-[var(--d-s-5)]">
          <p className="d-eyebrow text-[var(--d-orange-600)]">Lối tắt</p>
          <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Mở workspace</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <ShortcutLink href="/dashboard/orders" icon={<ChefHat size={16} />} label="Đơn hàng realtime" sub={`${operations.pending + operations.ordering} đơn mở`} />
            <ShortcutLink href="/dashboard/kitchen" icon={<ChefHat size={16} />} label="Màn hình bếp" sub={`${kitchenLoad} món đang làm`} />
            <ShortcutLink href="/dashboard/tables" icon={<Users size={16} />} label="Bàn & QR" sub={`${activeTables}/${totalTables || 0} bàn bận`} />
            <ShortcutLink href="/dashboard/payments" icon={<CreditCard size={16} />} label="Thu tiền" sub={`${paymentWaiting} bill chờ`} />
          </div>
        </Panel>

        <Panel className="p-[var(--d-s-5)] lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="d-eyebrow text-[var(--d-orange-600)]">Doanh thu theo giờ</p>
              <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Hôm nay</h3>
            </div>
            <span className="d-num text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{hourlyRevenueToday.length} khung</span>
          </div>
          <div className="mt-3 grid grid-cols-12 gap-1">
            {hourlyRevenueToday.slice(0, 12).map((h) => {
              const max = Math.max(...hourlyRevenueToday.map((row) => row.revenue), 1);
              const pct = (h.revenue / max) * 100;
              return (
                <div key={h.label} className="flex flex-col items-center gap-1">
                  <div className="flex h-24 w-full items-end">
                    <span className="block w-full rounded-[var(--d-r-sm)] bg-[var(--d-jade)]" style={{ height: `${Math.max(2, pct)}%` }} />
                  </div>
                  <span className="d-num text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">{h.label}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      </section>

      {detail ? (
        <Drawer
          open
          onClose={() => setDetailId(null)}
          width="md"
          title={fulfillmentLabel(detail)}
          subtitle={`Đơn ${detail.id.slice(0, 8).toUpperCase()}`}
          headerMeta={<Badge tone={statusBadgeTone(detail.status)}>{orderStatusLabel(detail.status)}</Badge>}
        >
          <div className="grid gap-[var(--d-s-3)]">
            <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-4)]">
              <p className="text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">{detail.itemSummary ?? "Không có món"}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="d-num text-[length:var(--d-fs-h2)] font-bold text-[var(--d-text)]">{formatVnd(detail.total)}</span>
                <span className="inline-flex items-center gap-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-faint)]"><Clock3 size={13} />{elapsedMin(detail.createdAt, nowMs)}'</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {detail.status === "pending" ? (
                <Button variant="primary" size="md" onClick={() => void quickAction(detail.id, "accept")} disabled={mutatingId === detail.id}>
                  <Check size={15} /> Nhận đơn
                </Button>
              ) : null}
              {detail.status === "ordering" ? (
                <Button variant="primary" size="md" onClick={() => void quickAction(detail.id, "complete")} disabled={mutatingId === detail.id}>
                  <ChefHat size={15} /> Báo ra món
                </Button>
              ) : null}
              {detail.status === "completed" || detail.status === "waiting_payment" || detail.status === "waiting_confirm" ? (
                <Button variant="primary" size="md" onClick={() => void quickAction(detail.id, "confirm-payment")} disabled={mutatingId === detail.id}>
                  <CreditCard size={15} /> Thu tiền
                </Button>
              ) : null}
              <Link href="/dashboard/orders" className="inline-flex h-10 items-center gap-1.5 rounded-[var(--d-r-md)] border border-[var(--d-line-strong)] bg-[var(--d-surface)] px-4 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)] transition hover:border-[var(--d-jade)] hover:bg-[var(--d-surface-2)]">
                Mở Đơn hàng <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </Drawer>
      ) : null}

      <NextSteps
        items={[
          { href: "/dashboard/orders", label: "Đơn hàng realtime", hint: `${operations.pending + operations.ordering} đơn mở`, icon: <ChefHat size={14} />, tone: operations.pending > 0 ? "orange" : "jade" },
          { href: "/dashboard/payments", label: "Đối soát thanh toán", hint: `${paymentWaiting} bill chờ`, icon: <CreditCard size={14} />, tone: paymentWaiting > 0 ? "orange" : "neutral" },
          { href: "/dashboard/kitchen", label: "Màn hình bếp", hint: `${kitchenLoad} món đang làm`, icon: <ChefHat size={14} /> },
          { href: "/dashboard/tables", label: "Bàn & QR", hint: `${activeTables}/${totalTables || 0} bàn bận`, icon: <Users size={14} />, tone: overdueTables > 0 ? "danger" : "neutral" },
          { href: "/dashboard/inventory", label: "Kho hàng", hint: "Cảnh báo & nhập kho", icon: <RefreshCw size={14} /> },
          { href: "/dashboard/analytics", label: "Báo cáo", hint: "Phân tích chuyên sâu", icon: <TrendingUp size={14} /> }
        ]}
      />
    </div>
  );
}

function ShiftSignal({ label, value, helper, tone }: { label: string; value: string; helper: string; tone: "ok" | "orange" | "danger" | "info" }) {
  const cls: Record<string, string> = {
    ok: "border-[var(--d-jade)]/25 bg-[var(--d-primary-soft)] text-[var(--d-primary)]",
    orange: "border-[var(--d-orange)]/25 bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]",
    danger: "border-[var(--d-danger-fg)]/25 bg-[var(--d-danger-bg)] text-[var(--d-danger-fg)]",
    info: "border-[var(--d-line)] bg-[var(--d-surface-2)] text-[var(--d-text-muted)]"
  };
  return (
    <div className={cn("flex flex-col gap-1 rounded-[var(--d-r-md)] border bg-[var(--d-surface)] p-[var(--d-s-4)]", cls[tone])}>
      <p className="text-[length:var(--d-fs-2xs)] uppercase tracking-[var(--d-track-wide)]">{label}</p>
      <p className="d-num text-[length:var(--d-fs-h2)] font-bold leading-tight">{value}</p>
      <p className="text-[length:var(--d-fs-xs)] opacity-80">{helper}</p>
    </div>
  );
}

function ShortcutLink({ href, icon, label, sub }: { href: string; icon: React.ReactNode; label: string; sub: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3 transition hover:border-[var(--d-jade)]">
      <span className="grid h-9 w-9 place-items-center rounded-[var(--d-r-md)] bg-[var(--d-primary-soft)] text-[var(--d-primary)]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{label}</span>
        <span className="block text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{sub}</span>
      </span>
      <ArrowRight size={14} className="text-[var(--d-text-faint)]" />
    </Link>
  );
}

function OrderCard({ order, nowMs, onDetail }: { order: OrderRow; nowMs: number; onDetail: () => void }) {
  const min = elapsedMin(order.createdAt, nowMs);
  const overdue = min >= 10;
  const accent =
    order.status === "completed" || order.status === "paid"
      ? "var(--d-ok-fg)"
      : order.status === "cancelled"
      ? "var(--d-danger-fg)"
      : order.status === "waiting_payment" || order.status === "waiting_confirm"
      ? "var(--d-orange)"
      : "var(--d-jade)";

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)] transition-all duration-[var(--d-dur)] hover:-translate-y-0.5 hover:border-[var(--d-line-strong)] hover:shadow-[var(--d-sh-md)]">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} aria-hidden="true" />
      <header className="flex items-start justify-between gap-3 px-[var(--d-s-4)] pb-2 pt-[var(--d-s-4)]">
        <div className="min-w-0">
          <p className="text-[length:var(--d-fs-h2)] font-bold leading-tight text-[var(--d-text)]">{fulfillmentLabel(order)}</p>
          <span className="mt-1 inline-flex items-center gap-1.5 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            {fulfillmentIcon(order)}
            {order.id.slice(0, 8).toUpperCase()}
          </span>
        </div>
        <Badge tone={statusBadgeTone(order.status)}>{orderStatusLabel(order.status)}</Badge>
      </header>

      <div className="px-[var(--d-s-4)] pb-3">
        <p className="line-clamp-2 text-[length:var(--d-fs-sm)] leading-snug text-[var(--d-text-muted)]">
          {order.itemSummary ?? "Không có món"}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--d-line)] bg-[var(--d-surface-2)]/40 px-[var(--d-s-4)] py-2.5">
        <span className="d-num text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{formatVnd(order.total)}</span>
        <span className={cn("inline-flex items-center gap-1 text-[length:var(--d-fs-xs)] font-semibold", overdue ? "text-[var(--d-danger-fg)]" : "text-[var(--d-text-faint)]")}>
          <Clock3 size={13} />
          {min === 0 ? "vừa xong" : `${min} phút`}
          {overdue ? <span className="ml-1 rounded-[var(--d-r-pill)] bg-[var(--d-danger-bg)] px-1.5 py-0.5 text-[length:var(--d-fs-2xs)] uppercase">Quá giờ</span> : null}
        </span>
      </div>

      <button
        type="button"
        onClick={onDetail}
        className="flex h-12 items-center justify-center gap-1.5 border-t border-[var(--d-line)] text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)] transition hover:bg-[var(--d-surface-2)] hover:text-[var(--d-text)]"
      >
        <Eye size={16} /> Xem nhanh
      </button>
    </article>
  );
}

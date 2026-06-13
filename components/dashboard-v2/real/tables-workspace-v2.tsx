"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChefHat, Clock3, Copy, CreditCard, Download, Eye, Grip, MapPin, Move, Plus, Printer, QrCode, RotateCcw, Settings2, TimerReset, Trash2, Users, Utensils, X } from "lucide-react";
import { Button } from "../button";
import { Badge, EmptyState, MetricCard, SwitchControl } from "../primitives";
import { Drawer, Modal } from "../overlay";
import { FilterTabs, Toolbar } from "../workspace-ui";
import { RealtimeStatusBadge } from "../realtime";
import { useDashboardRealtime } from "@/hooks/use-dashboard-realtime";
import { useToast } from "@/components/dashboard/toast-provider";
import { createTableAction, deleteTableAction, rotateTableQrAction, toggleTableQrAction, updateTableAction } from "@/app/dashboard/actions/tables";
import { buildPosterSvgForTable, downloadQrPosterPng, printSvgPosters, qrImageUrl, tableQrUrl } from "@/lib/qr-poster";
import { formatVnd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { OrderDto } from "@/types/domain";
import type { RestaurantTableWithStatus, TableBranchOption } from "@/services/table-service";

type Zone = "all" | string;

type Props = {
  restaurantId: string;
  restaurantSlug: string;
  restaurantName: string;
  dashboardTableCount: number;
  branches: TableBranchOption[];
  tables: RestaurantTableWithStatus[];
};

const STATUS = {
  available: { label: "Trống", tone: "neutral" as const, color: "var(--d-line-strong)", bg: "var(--d-surface)" },
  needs_confirm: { label: "Cần nhận đơn", tone: "orange" as const, color: "var(--d-orange)", bg: "var(--d-accent-soft)" },
  serving: { label: "Đang phục vụ", tone: "ok" as const, color: "var(--d-jade)", bg: "var(--d-primary-soft)" },
  overdue: { label: "Quá giờ", tone: "danger" as const, color: "var(--d-danger-fg)", bg: "var(--d-danger-bg)" },
  awaiting_payment: { label: "Chờ thu", tone: "jade" as const, color: "var(--d-info-fg)", bg: "var(--d-info-bg)" }
} as const;

function zoneLabel(table: RestaurantTableWithStatus) {
  if (table.area) return table.area;
  if (table.seating_zone === "outdoor") return "Ngoài trời";
  if (table.seating_zone === "mixed") return "Khu hỗn hợp";
  return "Trong nhà";
}

export function RealTablesWorkspaceV2({ restaurantId, restaurantSlug, restaurantName, dashboardTableCount, branches, tables }: Props) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const rtState = useDashboardRealtime({
    restaurantId,
    workspace: "tables",
    tables: [
      { table: "orders" },
      { table: "tables" }
    ]
  });
  const [zone, setZone] = useState<Zone>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => tables.find((t) => t.id === selectedId) ?? null, [tables, selectedId]);
  const [edit, setEdit] = useState<RestaurantTableWithStatus | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const initialPositions = useMemo(() => {
    return Object.fromEntries(tables.map((table, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      return [table.id, { x: 16 + col * 22, y: 22 + row * 24 }];
    }));
  }, [tables]);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(initialPositions);

  function saveTable(fd: FormData) {
    startTransition(async () => {
      try {
        await updateTableAction(fd);
        toast.success("Đã lưu thông tin bàn");
        setEdit(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không lưu được thông tin bàn");
      }
    });
  }

  function createTable(fd: FormData) {
    startTransition(async () => {
      try {
        await createTableAction(fd);
        toast.success("Đã thêm bàn mới");
        setCreateOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không thêm được bàn");
      }
    });
  }

  function toggleQr(table: RestaurantTableWithStatus, enabled: boolean) {
    const fd = new FormData();
    fd.set("tableId", table.id);
    fd.set("qrEnabled", String(enabled));
    startTransition(async () => {
      try {
        await toggleTableQrAction(fd);
        toast.success(enabled ? "Đã bật QR cho bàn" : "Đã tắt QR cho bàn");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không đổi được trạng thái QR");
      }
    });
  }

  function rotateQr(tableId: string) {
    if (!window.confirm("Xoay mã QR mới? Mã QR cũ (đã in/dán) sẽ ngừng hoạt động.")) return;
    const fd = new FormData();
    fd.set("tableId", tableId);
    startTransition(async () => {
      try {
        await rotateTableQrAction(fd);
        toast.success("Đã xoay mã QR mới — hãy in lại template cho bàn này");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không xoay được mã QR");
      }
    });
  }

  async function printAllTables() {
    if (tables.length === 0) {
      toast.info("Chưa có bàn nào để in QR");
      return;
    }
    try {
      const posters = await Promise.all(
        tables.map((t) => buildPosterSvgForTable({ restaurantName, restaurantSlug, table: t }))
      );
      printSvgPosters(posters, `QR ${restaurantName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tạo được template QR hàng loạt");
    }
  }

  function deleteTable(tableId: string) {
    if (!window.confirm("Xoá bàn này? Hành động không thể hoàn tác.")) return;
    const fd = new FormData();
    fd.set("tableId", tableId);
    startTransition(async () => {
      try {
        await deleteTableAction(fd);
        toast.success("Đã xoá bàn");
        setEdit(null);
        setSelectedId(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không xoá được bàn");
      }
    });
  }

  const zones = useMemo(() => Array.from(new Set(tables.map(zoneLabel))), [tables]);
  const visible = zone === "all" ? tables : tables.filter((t) => zoneLabel(t) === zone);
  const counts = {
    total: tables.length,
    active: tables.filter((t) => t.status !== "available").length,
    overdue: tables.filter((t) => t.status === "overdue").length,
    payment: tables.filter((t) => t.status === "awaiting_payment").length
  };

  function moveTable(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragId || !editMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(6, Math.min(94, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(10, Math.min(90, ((e.clientY - rect.top) / rect.height) * 100));
    setPositions((p) => ({ ...p, [dragId]: { x, y } }));
  }

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <Toolbar eyebrow="Vận hành" title="Bàn &amp; QR">
        <RealtimeStatusBadge state={rtState} />
        <Button variant={editMode ? "primary" : "secondary"} size="md" onClick={() => setEditMode((v) => !v)}><Move size={15} /> {editMode ? "Lưu sơ đồ" : "Sửa sơ đồ"}</Button>
        <Button variant="secondary" size="md" onClick={() => void printAllTables()}><Printer size={15} /> In QR tất cả</Button>
        <Button variant="primary" size="md" onClick={() => setCreateOpen(true)}><Plus size={15} /> Thêm bàn</Button>
      </Toolbar>

      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        <MetricCard icon={<Users size={18} />} label="Tổng bàn" value={String(dashboardTableCount)} tone="jade" />
        <MetricCard icon={<QrCode size={18} />} label="QR đang bật" value={String(tables.filter((t) => t.qr_enabled).length)} tone="info" />
        <MetricCard icon={<Users size={18} />} label="Đang phục vụ" value={String(counts.active)} tone="orange" />
        <MetricCard icon={<Users size={18} />} label="Quá giờ" value={String(counts.overdue)} tone={counts.overdue > 0 ? "danger" : "neutral"} />
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          active={zone}
          onChange={setZone}
          tabs={[{ key: "all", label: "Tất cả", count: tables.length }, ...zones.map((z) => ({ key: z, label: z, count: tables.filter((t) => zoneLabel(t) === z).length }))]}
        />
      </section>

      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="d-eyebrow">Sơ đồ bàn</p>
            <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{editMode ? "Kéo thả để di chuyển bàn" : "Bấm vào bàn để xem chi tiết"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            {(["available", "needs_confirm", "serving", "overdue", "awaiting_payment"] as const).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS[k].color }} />
                {STATUS[k].label}
              </span>
            ))}
          </div>
        </div>

        <div
          onPointerMove={moveTable}
          onPointerUp={() => setDragId(null)}
          onPointerLeave={() => setDragId(null)}
          className={cn("relative aspect-[16/8] w-full select-none overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)]", "bg-[radial-gradient(circle_at_center,_var(--d-surface)_0%,_var(--d-surface-2)_100%)]")}
        >
          <svg className="absolute inset-0 h-full w-full opacity-40" aria-hidden="true">
            <defs>
              <pattern id="floor-grid-real" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--d-line)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#floor-grid-real)" />
          </svg>

          {visible.map((t) => {
            const pos = positions[t.id] ?? { x: 50, y: 50 };
            const meta = STATUS[t.status];
            const isSelected = selected?.id === t.id;
            const isDragging = dragId === t.id;
            return (
              <div
                key={t.id}
                onPointerDown={(e) => { if (editMode) { e.preventDefault(); setDragId(t.id); } }}
                onClick={() => { if (!editMode && !isDragging) setSelectedId(t.id); }}
                className={cn("absolute -translate-x-1/2 -translate-y-1/2 select-none", editMode ? "cursor-grab active:cursor-grabbing" : "cursor-pointer", isDragging && "z-10 scale-110")}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                <div
                  className={cn("relative flex flex-col gap-0.5 rounded-[var(--d-r-md)] border-2 bg-[var(--d-surface)] px-2.5 py-1.5 shadow-[var(--d-sh-sm)] transition-all", !editMode && "hover:-translate-y-0.5 hover:shadow-[var(--d-sh-md)]", isSelected && "ring-2 ring-offset-2 ring-offset-[var(--d-surface)]")}
                  style={{ minWidth: `${64 + t.capacity * 3}px`, borderColor: meta.color, background: meta.bg, boxShadow: isSelected ? `0 0 0 3px ${meta.color}40, var(--d-sh-md)` : undefined }}
                >
                  <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full ring-2 ring-[var(--d-surface)]" style={{ background: meta.color }} />
                  {editMode ? <span className="absolute -left-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--d-surface)] text-[var(--d-text-muted)] shadow"><Grip size={10} /></span> : null}
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="d-num text-[length:var(--d-fs-h3)] font-bold leading-none text-[var(--d-text)]">{t.name}</span>
                    <span className="d-num text-[length:var(--d-fs-2xs)] font-semibold text-[var(--d-text-muted)]">{t.capacity}c</span>
                  </div>
                  {t.unpaidTotal > 0 ? (
                    <p className="d-num text-[length:var(--d-fs-2xs)] font-bold text-[var(--d-text)]">{t.unpaidTotal.toLocaleString("vi-VN")}₫</p>
                  ) : (
                    <p className="text-[length:var(--d-fs-2xs)] text-[var(--d-text-muted)]">{meta.label}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {editMode ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--d-r-md)] border border-[var(--d-jade)]/30 bg-[var(--d-primary-soft)]/40 px-3 py-2">
            <p className="inline-flex items-center gap-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-primary)]"><MapPin size={13} /> Đang sửa sơ đồ. Vị trí lưu cục bộ trong phiên xem.</p>
            <Button variant="primary" size="sm" onClick={() => { setEditMode(false); toast.success("Đã lưu sơ đồ tạm"); }}>Xong</Button>
          </div>
        ) : null}
      </section>

      {visible.length === 0 ? (
        <EmptyState icon={<Users size={20} />} title="Không có bàn nào ở khu này" description="Đổi khu vực hoặc thêm bàn mới." />
      ) : null}

      <TableDrawer
        table={selected}
        slug={restaurantSlug}
        restaurantId={restaurantId}
        restaurantName={restaurantName}
        branches={branches}
        pending={pending}
        onClose={() => setSelectedId(null)}
        onEdit={() => { if (selected) { setEdit(selected); setSelectedId(null); } }}
        onToggleQr={(enabled) => { if (selected) toggleQr(selected, enabled); }}
        onRotateQr={() => { if (selected) rotateQr(selected.id); }}
        onChanged={() => router.refresh()}
      />
      <TableEditModal
        table={edit}
        onClose={() => setEdit(null)}
        onSave={saveTable}
        onDelete={(id) => deleteTable(id)}
        pending={pending}
      />
      <CreateTableModal
        open={createOpen}
        branches={branches}
        onClose={() => setCreateOpen(false)}
        onCreate={createTable}
        pending={pending}
      />

    </div>
  );
}

function TableDrawer({
  table,
  slug,
  restaurantId,
  restaurantName,
  branches,
  pending,
  onClose,
  onEdit,
  onToggleQr,
  onRotateQr,
  onChanged
}: {
  table: RestaurantTableWithStatus | null;
  slug: string;
  restaurantId: string;
  restaurantName: string;
  branches: TableBranchOption[];
  pending: boolean;
  onClose: () => void;
  onEdit: () => void;
  onToggleQr: (enabled: boolean) => void;
  onRotateQr: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [view, setView] = useState<"orders" | "config">("config");
  const hasActiveOrders = (table?.activeOrderCount ?? 0) > 0 || (table?.unpaidTotal ?? 0) > 0;

  useEffect(() => {
    setView(hasActiveOrders ? "orders" : "config");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table?.id]);

  if (!table) return null;
  const tableData = table;
  const meta = STATUS[tableData.status];
  const publicUrl = tableQrUrl(slug, tableData);
  const previewSrc = qrImageUrl(publicUrl, 360);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Đã sao chép link QR");
    } catch {
      toast.error("Trình duyệt không cho sao chép tự động");
    }
  }

  async function printPoster() {
    if (printing) return;
    setPrinting(true);
    try {
      const svg = await buildPosterSvgForTable({ restaurantName, restaurantSlug: slug, table: tableData });
      printSvgPosters([svg], `QR ${tableData.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tạo được template QR");
    } finally {
      setPrinting(false);
    }
  }

  async function downloadPoster() {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadQrPosterPng({ restaurantName, restaurantSlug: slug, table: tableData });
      toast.success("Đã tải template QR (PNG)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tạo được ảnh QR");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={`Bàn ${table.name}`}
      subtitle={`${zoneLabel(table)} · ${table.capacity} khách tối đa`}
      headerMeta={<Badge tone={meta.tone}>{meta.label}</Badge>}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={printPoster} disabled={printing}>
            <Printer size={15} /> {printing ? "Đang chuẩn bị…" : "In QR template"}
          </Button>
          <Button variant="primary" size="lg" className="flex-[2]" onClick={onEdit}>Sửa thông tin bàn</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-[var(--d-s-4)]">
        {/* Tab: Đơn tại bàn / QR & cấu hình */}
        <div className="grid grid-cols-2 gap-1 rounded-[var(--d-r-pill)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-1">
          <button
            type="button"
            onClick={() => setView("orders")}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--d-r-pill)] text-[length:var(--d-fs-sm)] font-semibold transition",
              view === "orders" ? "bg-[var(--d-jade)] text-[var(--d-on-jade)]" : "text-[var(--d-text-muted)]"
            )}
          >
            <Utensils size={14} /> Đơn tại bàn
            {hasActiveOrders ? <span className="d-num grid h-5 min-w-5 place-items-center rounded-full bg-[var(--d-orange)] px-1 text-[length:var(--d-fs-2xs)] font-bold text-white">{table.activeOrderCount}</span> : null}
          </button>
          <button
            type="button"
            onClick={() => setView("config")}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--d-r-pill)] text-[length:var(--d-fs-sm)] font-semibold transition",
              view === "config" ? "bg-[var(--d-jade)] text-[var(--d-on-jade)]" : "text-[var(--d-text-muted)]"
            )}
          >
            <Settings2 size={14} /> QR &amp; cấu hình
          </button>
        </div>

        {view === "orders" ? (
          <TableOrderOps restaurantId={restaurantId} tableId={table.id} tableName={table.name} onChanged={onChanged} />
        ) : (
        <>
        {/* QR PREVIEW — hero */}
        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
          <div className="flex flex-col gap-[var(--d-s-3)] sm:flex-row sm:items-start sm:gap-[var(--d-s-4)]">
            {/* QR card */}
            <div className="flex flex-col items-center gap-2 rounded-[var(--d-r-md)] border-2 border-[var(--d-jade)]/35 bg-[linear-gradient(180deg,#fffaf1,#fff2df)] p-[var(--d-s-4)] sm:w-[220px]">
              <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-orange-600)]">Scan để gọi món</p>
              <p className="line-clamp-2 text-center text-[length:var(--d-fs-sm)] font-bold text-[var(--d-primary)]">{restaurantName}</p>
              <div className="rounded-[var(--d-r-md)] border border-[var(--d-jade)]/40 bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewSrc}
                  alt={`QR ${table.name}`}
                  width={180}
                  height={180}
                  className="block h-[180px] w-[180px] object-contain"
                  loading="lazy"
                />
              </div>
              <div className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 rounded-[var(--d-r-md)] bg-[var(--d-jade)] px-3 py-2 text-[var(--d-on-jade)]">
                <span className="text-[length:var(--d-fs-2xs)] font-bold uppercase">Bàn</span>
                <span className="d-num text-center text-[length:var(--d-fs-h2)] font-bold leading-none text-[var(--d-orange)]">{table.name.match(/\d+/)?.[0]?.padStart(2, "0") ?? table.name.slice(0, 6).toUpperCase()}</span>
                <span className="text-[length:var(--d-fs-2xs)] font-bold uppercase">Quét</span>
              </div>
            </div>

            {/* Right side actions */}
            <div className="min-w-0 flex-1 grid gap-2">
              <p className="d-eyebrow">URL gọi món</p>
              <code className="block overflow-x-auto rounded-[var(--d-r-sm)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2 font-mono text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text)]">
                {publicUrl}
              </code>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={copyLink}>
                  <Copy size={13} /> Sao chép link
                </Button>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-primary)] transition hover:border-[var(--d-jade)]"
                >
                  <Eye size={13} /> Mở trang khách
                </a>
                <Button variant="secondary" size="sm" onClick={downloadPoster} disabled={downloading}>
                  <Download size={13} /> {downloading ? "Đang tạo…" : "Tải PNG"}
                </Button>
              </div>
              <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
                Template A4 đã thiết kế sẵn theo brand LogiVN — không cần chỉnh thêm. Bấm <span className="font-semibold text-[var(--d-text)]">In QR template</span> để mở popup in 1 trang.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
          <p className="d-eyebrow">Quản lý mã QR</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-3 sm:flex-1">
              <span className="min-w-0">
                <span className="block text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">QR gọi món tại bàn</span>
                <span className="block text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{tableData.qr_enabled ? "Khách quét QR để gọi món" : "Đang tắt — khách không gọi món qua QR được"}</span>
              </span>
              <SwitchControl checked={Boolean(tableData.qr_enabled)} disabled={pending} onChange={(next) => onToggleQr(next)} />
            </div>
            <Button variant="secondary" size="md" onClick={onRotateQr} disabled={pending}>
              <RotateCcw size={14} /> Xoay mã QR mới
            </Button>
          </div>
          <p className="mt-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            Xoay mã khi QR cũ bị lộ/dán sai bàn. Mã cũ sẽ ngừng hoạt động — nhớ in lại template sau khi xoay.
          </p>
        </section>

        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)]/60 p-[var(--d-s-4)]">
          <p className="d-eyebrow">Thông tin bàn</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Mã bàn" value={String(table.id).slice(0, 6).toUpperCase()} />
            <Tile label="Khu vực" value={zoneLabel(table)} />
            <Tile label="Sức chứa" value={`${table.capacity} khách`} />
            <Tile label="Loại bàn" value={table.table_kind ?? "standard"} />
          </div>
        </section>

        {table.unpaidTotal > 0 ? (
          <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-info-bg)] p-[var(--d-s-4)]">
            <p className="d-eyebrow text-[var(--d-info-fg)]">Đang phục vụ</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Tile label="Đơn đang mở" value={String(table.activeOrderCount)} />
              <Tile label="Bill mở" value={String(table.activeBillCount)} />
              <Tile label="Tiền chưa thu" value={`${table.unpaidTotal.toLocaleString("vi-VN")}₫`} />
            </div>
          </section>
        ) : null}

        {branches.length > 0 ? (
          <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
            <p className="d-eyebrow">Chi nhánh</p>
            <p className="mt-1 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">{branches.find((b) => b.id === table.branch_id)?.name ?? "Chưa gán chi nhánh"}</p>
          </section>
        ) : null}
        </>
        )}
      </div>
    </Drawer>
  );
}

function TableOrderOps({
  restaurantId,
  tableId,
  tableName,
  onChanged
}: {
  restaurantId: string;
  tableId: string;
  tableName: string;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [orders, setOrders] = useState<OrderDto[] | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [togglingItemId, setTogglingItemId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/orders?restaurantId=${restaurantId}`, { cache: "no-store" });
      const json = await res.json();
      const all: OrderDto[] = Array.isArray(json?.data) ? json.data : Array.isArray(json?.orders) ? json.orders : [];
      setOrders(
        all.filter(
          (o) =>
            o.status !== "paid" &&
            o.status !== "cancelled" &&
            (o.table?.id === tableId || (Boolean(o.table?.name) && o.table?.name === tableName))
        )
      );
    } catch {
      setOrders([]);
    }
  }, [restaurantId, tableId, tableName]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  async function act(orderId: string, action: "accept" | "complete" | "timer" | "confirm-payment" | "cancel", body?: unknown, successMsg?: string) {
    if (mutatingId) return;
    setMutatingId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/${action}`, {
        method: "POST",
        cache: "no-store",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      if (!res.ok) throw new Error((await res.text().catch(() => "")) || `${res.status}`);
      toast.success(successMsg ?? "Đã cập nhật đơn");
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Thao tác thất bại");
    } finally {
      setMutatingId(null);
    }
  }

  async function toggleItem(orderId: string, itemId: string | undefined, prepared: boolean) {
    if (!itemId || togglingItemId) return;
    setTogglingItemId(itemId);
    // Optimistic: cập nhật ngay trên UI để bếp thao tác nhanh.
    setOrders((prev) =>
      prev
        ? prev.map((o) =>
            o.id === orderId
              ? { ...o, items: o.items.map((it) => (it.id === itemId ? { ...it, preparedAt: prepared ? new Date().toISOString() : null } : it)) }
              : o
          )
        : prev
    );
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/items/${itemId}`, {
        method: "PATCH",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prepared })
      });
      if (!res.ok) throw new Error((await res.text().catch(() => "")) || `${res.status}`);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không cập nhật được món");
      await load();
    } finally {
      setTogglingItemId(null);
    }
  }

  if (orders === null) {
    return <div className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-6)] text-center text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">Đang tải đơn tại bàn…</div>;
  }
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<Utensils size={20} />}
        title="Bàn chưa có đơn đang mở"
        description="Khi khách quét QR gọi món, đơn sẽ hiện ở đây để bạn nhận, ra món và thu tiền."
      />
    );
  }

  return (
    <div className="flex flex-col gap-[var(--d-s-3)]">
      {orders.map((o) => {
        const elapsed = Math.max(0, Math.floor((nowMs - new Date(o.createdAt).getTime()) / 60_000));
        const overdue = elapsed >= 10 && (o.status === "pending" || o.status === "ordering");
        const itemCount = o.items.reduce((s, it) => s + it.quantity, 0);
        const preparedCount = o.items.filter((it) => Boolean(it.preparedAt)).length;
        const allPrepared = o.items.length > 0 && preparedCount === o.items.length;
        const busy = mutatingId === o.id;
        const cooking = o.status === "pending" || o.status === "ordering";
        const waitingPay = o.status === "completed" || o.status === "waiting_payment" || o.status === "waiting_confirm";
        return (
          <article key={o.id} className="overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]">
            <header className="flex items-center justify-between gap-2 border-b border-[var(--d-line)] px-[var(--d-s-4)] py-[var(--d-s-3)]">
              <span className="inline-flex items-center gap-2">
                <Badge tone={o.status === "pending" ? "orange" : o.status === "ordering" ? "info" : waitingPay ? "jade" : "neutral"}>
                  {o.status === "pending" ? "Đơn mới" : o.status === "ordering" ? "Đang làm" : waitingPay ? "Chờ thu" : o.status}
                </Badge>
                <span className="d-num text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{itemCount} món · #{o.id.slice(0, 6).toUpperCase()}</span>
                {cooking && o.items.length > 0 ? (
                  <span className={cn("d-num inline-flex items-center gap-1 rounded-[var(--d-r-pill)] px-1.5 py-0.5 text-[length:var(--d-fs-2xs)] font-bold", allPrepared ? "bg-[var(--d-primary-soft)] text-[var(--d-primary)]" : "bg-[var(--d-surface-2)] text-[var(--d-text-faint)]")}>
                    <Check size={11} /> {preparedCount}/{o.items.length} xong
                  </span>
                ) : null}
              </span>
              <span className={cn("inline-flex items-center gap-1 text-[length:var(--d-fs-xs)] font-semibold", overdue ? "text-[var(--d-danger-fg)]" : "text-[var(--d-text-faint)]")}>
                <Clock3 size={12} /> {elapsed === 0 ? "vừa xong" : `${elapsed}'`}
              </span>
            </header>

            <ul className="divide-y divide-[var(--d-line)]">
              {o.items.map((it, i) => {
                const done = Boolean(it.preparedAt);
                const toggling = togglingItemId === it.id;
                return (
                  <li key={`${it.id ?? it.menuItem?.id ?? "item"}-${i}`} className="flex items-start gap-2.5 px-[var(--d-s-4)] py-2">
                    <span className="d-num grid h-6 min-w-6 flex-none place-items-center rounded-[var(--d-r-sm)] bg-[var(--d-primary-soft)] px-1 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-primary)]">{it.quantity}</span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[length:var(--d-fs-sm)] font-medium", done ? "text-[var(--d-text-faint)] line-through" : "text-[var(--d-text)]")}>{it.menuItem?.name ?? "Món"}</span>
                      {it.modifierSummary ? <span className="block text-[length:var(--d-fs-2xs)] text-[var(--d-text-muted)]">{it.modifierSummary}</span> : null}
                      {it.note ? <span className="mt-0.5 inline-block rounded-[var(--d-r-sm)] bg-[var(--d-accent-soft)] px-1.5 py-0.5 text-[length:var(--d-fs-2xs)] font-semibold text-[var(--d-orange-600)]">⚠ {it.note}</span> : null}
                    </span>
                    {cooking && it.id ? (
                      <button
                        type="button"
                        onClick={() => void toggleItem(o.id, it.id, !done)}
                        disabled={toggling}
                        aria-pressed={done}
                        aria-label={done ? "Bỏ đánh dấu món đã làm" : "Đánh dấu món đã làm xong"}
                        className={cn(
                          "inline-flex h-8 flex-none items-center gap-1 rounded-[var(--d-r-pill)] px-2.5 text-[length:var(--d-fs-2xs)] font-bold transition disabled:opacity-50",
                          done
                            ? "bg-[var(--d-jade)] text-[var(--d-on-jade)]"
                            : "border border-[var(--d-line-strong)] bg-[var(--d-surface)] text-[var(--d-text-muted)] hover:border-[var(--d-jade)] hover:text-[var(--d-primary)]"
                        )}
                      >
                        <Check size={13} /> {done ? "Đã xong" : "Xong"}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center justify-between gap-2 border-t border-[var(--d-line)] bg-[var(--d-surface-2)]/40 px-[var(--d-s-4)] py-2">
              <span className="d-num text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{formatVnd(o.total)}</span>
              <button
                type="button"
                onClick={() => { if (window.confirm("Huỷ đơn này?")) void act(o.id, "cancel", undefined, "Đã huỷ đơn"); }}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-[var(--d-r-pill)] px-2 py-0.5 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)] transition hover:bg-[var(--d-danger-bg)] hover:text-[var(--d-danger-fg)] disabled:opacity-50"
              >
                <X size={12} /> Huỷ
              </button>
            </div>

            <div className="grid gap-1.5 p-[var(--d-s-3)]">
              {o.status === "pending" ? (
                <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={() => void act(o.id, "accept", { minutes: 15 }, "Đã nhận đơn")}>
                  <Utensils size={16} /> Nhận đơn
                </Button>
              ) : null}
              {o.status === "ordering" ? (
                <div className="grid grid-cols-[1fr_auto] gap-1.5">
                  <Button variant="primary" size="lg" disabled={busy} onClick={() => void act(o.id, "complete", undefined, "Đã ra đủ món")}>
                    <Check size={16} /> Ra đủ món
                  </Button>
                  <Button variant="secondary" size="lg" disabled={busy} onClick={() => void act(o.id, "timer", { minutes: 10 }, "Đã cộng 10 phút")}>
                    <TimerReset size={15} /> +10'
                  </Button>
                </div>
              ) : null}
              {waitingPay ? (
                <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={() => void act(o.id, "confirm-payment", undefined, "Đã thu tiền")}>
                  <CreditCard size={16} /> Thu tiền
                </Button>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function TableEditModal({
  table,
  onClose,
  onSave,
  onDelete,
  pending
}: {
  table: RestaurantTableWithStatus | null;
  onClose: () => void;
  onSave: (fd: FormData) => void;
  onDelete: (tableId: string) => void;
  pending: boolean;
}) {
  if (!table) return null;
  return (
    <Modal open onClose={onClose} size="md" title={`Cấu hình Bàn ${table.name}`} subtitle="Bàn & QR">
      <form
        action={(fd) => onSave(fd)}
        className="grid gap-3"
      >
        <input type="hidden" name="tableId" value={table.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Số / tên bàn" name="name" defaultValue={table.name} required />
          <Field label="Sức chứa" name="capacity" type="number" defaultValue={String(table.capacity)} min={1} max={50} />
          <SelectField
            label="Khu vực"
            name="seatingZone"
            defaultValue={table.seating_zone ?? "indoor"}
            options={[
              { v: "indoor", l: "Trong nhà" },
              { v: "outdoor", l: "Ngoài trời" },
              { v: "mixed", l: "Hỗn hợp" }
            ]}
          />
          <SelectField
            label="Loại bàn"
            name="tableKind"
            defaultValue={table.table_kind ?? "standard"}
            options={[
              { v: "standard", l: "Thường" },
              { v: "vip", l: "VIP" },
              { v: "bar", l: "Quầy bar" },
              { v: "community", l: "Bàn chung" }
            ]}
          />
          <Field label="Tầng / nhãn" name="floorLabel" defaultValue={table.floor_label ?? ""} placeholder="Tầng trệt" />
          <Field label="Khu / area" name="area" defaultValue={table.area ?? ""} placeholder="Khu A" />
          <Field label="Ưu tiên đặt bàn" name="reservationPriority" type="number" defaultValue={String(table.reservation_priority ?? 100)} min={1} max={999} />
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <ToggleInline name="isBookable" label="Cho phép đặt trước" defaultChecked={table.is_bookable ?? true} />
          <ToggleInline name="isHidden" label="Ẩn khỏi khách" defaultChecked={table.is_hidden ?? false} />
          <ToggleInline name="isUnderMaintenance" label="Đang bảo trì" defaultChecked={table.is_under_maintenance ?? false} />
        </div>

        <div className="mt-2 flex w-full justify-between gap-2 border-t border-[var(--d-line)] pt-3">
          <Button type="button" variant="danger" size="md" onClick={() => onDelete(table.id)} disabled={pending}>
            <Trash2 size={14} /> Xoá bàn
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
            <Button type="submit" variant="primary" size="md" disabled={pending}>
              {pending ? "Đang lưu…" : "Lưu"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function CreateTableModal({
  open,
  branches,
  onClose,
  onCreate,
  pending
}: {
  open: boolean;
  branches: TableBranchOption[];
  onClose: () => void;
  onCreate: (fd: FormData) => void;
  pending: boolean;
}) {
  if (!open) return null;
  return (
    <Modal open onClose={onClose} size="md" title="Thêm bàn mới" subtitle="Bàn & QR">
      <form action={(fd) => onCreate(fd)} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Số / tên bàn" name="name" required placeholder="VD: Bàn 01" />
          <Field label="Sức chứa" name="capacity" type="number" defaultValue="4" min={1} max={50} />
          <SelectField
            label="Khu vực"
            name="seatingZone"
            defaultValue="indoor"
            options={[
              { v: "indoor", l: "Trong nhà" },
              { v: "outdoor", l: "Ngoài trời" },
              { v: "mixed", l: "Hỗn hợp" }
            ]}
          />
          <SelectField
            label="Loại bàn"
            name="tableKind"
            defaultValue="standard"
            options={[
              { v: "standard", l: "Thường" },
              { v: "vip", l: "VIP" },
              { v: "bar", l: "Quầy bar" },
              { v: "community", l: "Bàn chung" }
            ]}
          />
          <Field label="Tầng / nhãn" name="floorLabel" placeholder="Tầng trệt" />
          <Field label="Khu / area" name="area" placeholder="Khu A" />
          {branches.length > 0 ? (
            <SelectField
              label="Chi nhánh"
              name="branchId"
              defaultValue={branches[0]?.id ?? ""}
              options={branches.map((b) => ({ v: b.id, l: b.name }))}
            />
          ) : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <ToggleInline name="isBookable" label="Cho phép đặt trước" defaultChecked />
          <ToggleInline name="isHidden" label="Ẩn khỏi khách" />
          <ToggleInline name="isUnderMaintenance" label="Đang bảo trì" />
        </div>
        <div className="mt-2 flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            <Plus size={15} /> {pending ? "Đang thêm…" : "Thêm bàn"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
      <p className="text-[length:var(--d-fs-2xs)] font-semibold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</p>
      <p className="mt-1 truncate text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{value}</p>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
  required,
  min,
  max
}: {
  label: string;
  name?: string;
  defaultValue?: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        min={min}
        max={max}
        className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none transition focus:border-[var(--d-jade)] focus:ring-2 focus:ring-[var(--d-jade)]/20"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options
}: {
  label: string;
  name?: string;
  defaultValue?: string;
  options: { v: string; l: string }[];
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
      >
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  );
}

function ToggleInline({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex h-10 items-center justify-between gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">
      <span>{label}</span>
      <input type="checkbox" name={name} value="true" defaultChecked={defaultChecked} className="h-4 w-4 accent-[var(--d-orange)]" />
    </label>
  );
}

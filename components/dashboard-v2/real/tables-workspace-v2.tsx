"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock3, Copy, CreditCard, Download, Eye, Plus, Printer, QrCode, RotateCcw, Settings2, TimerReset, Trash2, Users, Utensils, X } from "lucide-react";
import { Button } from "../button";
import { Badge, EmptyState, MetricCard, SwitchControl } from "../primitives";
import { Drawer, Modal } from "../overlay";
import { FilterTabs, Toolbar } from "../workspace-ui";
import { RealtimeStatusBadge } from "../realtime";
import { useDashboardRealtime } from "@/hooks/use-dashboard-realtime";
import { useToast } from "@/components/dashboard-v2/adapters/dashboard-shared";
import { createTableAction, deleteTableAction, rotateTableQrAction, toggleTableQrAction, updateTableAction } from "@/app/dashboard/actions/tables";
import { readDashboardApiResponse } from "@/lib/dashboard/api-response";
import { getDashboardActionErrorToast, resolveDashboardActionToast, resolveDashboardOrderAction, resolveDashboardPaymentConfirmationBody } from "@/lib/dashboard/order-actions";
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

function floorLabel(table: RestaurantTableWithStatus) {
  const raw = table.floor_label?.trim();
  return raw || "Tầng chính";
}

function groupByFloor(tables: RestaurantTableWithStatus[]) {
  const floors = new Map<string, RestaurantTableWithStatus[]>();
  for (const table of tables) {
    const key = floorLabel(table);
    floors.set(key, [...(floors.get(key) ?? []), table]);
  }
  return Array.from(floors.entries()).map(([floor, floorTables]) => {
    const areaMap = new Map<string, RestaurantTableWithStatus[]>();
    for (const table of floorTables) {
      const area = zoneLabel(table);
      areaMap.set(area, [...(areaMap.get(area) ?? []), table]);
    }
    return {
      floor,
      tables: floorTables,
      areas: Array.from(areaMap.entries()).map(([area, areaTables]) => ({ area, tables: areaTables }))
    };
  });
}

function FloorTab({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-[var(--d-r-pill)] border px-3 text-[length:var(--d-fs-xs)] font-bold transition",
        active
          ? "border-[var(--d-jade)] bg-[var(--d-jade)] text-[var(--d-on-jade)] shadow-[var(--d-sh-sm)]"
          : "border-[var(--d-line)] bg-[var(--d-surface)] text-[var(--d-text-muted)] hover:border-[var(--d-line-strong)] hover:text-[var(--d-text)]"
      )}
    >
      {label}
      <span className={cn("d-num grid h-5 min-w-5 place-items-center rounded-full px-1 text-[length:var(--d-fs-2xs)]", active ? "bg-white/20 text-white" : "bg-[var(--d-surface-2)] text-[var(--d-text-faint)]")}>{count}</span>
    </button>
  );
}

function TableStatusLegend() {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[length:var(--d-fs-2xs)] font-semibold text-[var(--d-text-muted)] sm:flex sm:flex-wrap sm:items-center">
      {(["available", "needs_confirm", "serving", "overdue", "awaiting_payment"] as const).map((key) => (
        <span key={key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS[key].color }} />
          {STATUS[key].label}
        </span>
      ))}
    </div>
  );
}

function FloorPlanSections({
  plans,
  selectedId,
  editMode,
  onSelect,
  onEdit
}: {
  plans: ReturnType<typeof groupByFloor>;
  selectedId: string | null;
  editMode: boolean;
  onSelect: (table: RestaurantTableWithStatus) => void;
  onEdit: (table: RestaurantTableWithStatus) => void;
}) {
  if (plans.length === 0) {
    return (
      <div className="p-[var(--d-s-4)]">
        <EmptyState icon={<Users size={20} />} title="Không có bàn trong sơ đồ này" description="Đổi tầng/khu hoặc thêm bàn mới để bắt đầu vận hành." />
      </div>
    );
  }

  return (
    <div className="grid gap-[var(--d-s-4)] bg-[var(--d-surface-2)]/45 p-[var(--d-s-3)] sm:p-[var(--d-s-4)]">
      {plans.map((plan) => (
        <section key={plan.floor} className="overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--d-line)] px-[var(--d-s-4)] py-3">
            <div className="min-w-0">
              <h2 className="truncate text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{plan.floor}</h2>
              <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{plan.tables.length} bàn · {plan.areas.length} khu</p>
            </div>
            <span className="d-num rounded-[var(--d-r-pill)] bg-[var(--d-primary-soft)] px-2.5 py-1 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-primary)]">
              {plan.tables.filter((table) => table.status !== "available").length} đang dùng
            </span>
          </header>

          <div className="grid gap-3 p-3 sm:p-4">
            {plan.areas.map((area) => (
              <div key={`${plan.floor}-${area.area}`} className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[linear-gradient(180deg,var(--d-surface),var(--d-surface-2))] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{area.area}</p>
                  <span className="d-num text-[length:var(--d-fs-2xs)] font-bold text-[var(--d-text-muted)]">{area.tables.length} bàn</span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(118px,1fr))]">
                  {area.tables.map((table) => (
                    <TableTile
                      key={table.id}
                      table={table}
                      selected={selectedId === table.id}
                      editMode={editMode}
                      onSelect={() => onSelect(table)}
                      onEdit={() => onEdit(table)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TableTile({
  table,
  selected,
  editMode,
  onSelect,
  onEdit
}: {
  table: RestaurantTableWithStatus;
  selected: boolean;
  editMode: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const meta = STATUS[table.status];
  const activeCount = table.activeOrderCount + table.activeReservationCount;
  return (
    <button
      type="button"
      onClick={editMode ? onEdit : onSelect}
      className={cn(
        "relative flex min-h-[88px] min-w-0 flex-col justify-between rounded-[var(--d-r-md)] border-2 p-2 text-left shadow-[var(--d-sh-sm)] transition active:scale-[0.99] sm:min-h-[104px] sm:p-2.5",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--d-jade)]",
        selected && "ring-2 ring-[var(--d-jade)] ring-offset-2 ring-offset-[var(--d-surface)]"
      )}
      style={{ borderColor: meta.color, background: meta.bg }}
      aria-label={`${editMode ? "Sửa" : "Mở"} bàn ${table.name}, ${meta.label}`}
    >
      <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--d-surface)]" style={{ background: meta.color }} />
      {editMode ? (
        <span className="absolute left-2 top-2 rounded-[var(--d-r-pill)] bg-[var(--d-surface)]/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--d-primary)] shadow-[var(--d-sh-sm)]">Sửa</span>
      ) : null}
      <span className="min-w-0 pt-3 sm:pt-4">
        <span className="block truncate text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--d-text-faint)] sm:text-[length:var(--d-fs-2xs)]">Bàn</span>
        <span className="d-num mt-0.5 block truncate text-[18px] font-bold leading-none text-[var(--d-text)] sm:text-[length:var(--d-fs-h2)]">{table.name}</span>
      </span>
      <span className="mt-2 grid gap-1 sm:mt-3">
        <span className="flex items-center justify-between gap-1 text-[10px] font-semibold text-[var(--d-text-muted)] sm:text-[length:var(--d-fs-2xs)]">
          <span>{table.capacity} khách</span>
          <span className="hidden min-[390px]:inline">{table.qr_enabled ? "QR bật" : "QR tắt"}</span>
        </span>
        {table.unpaidTotal > 0 ? (
          <span className="d-num truncate text-[10px] font-bold text-[var(--d-text)] sm:text-[length:var(--d-fs-xs)]">{table.unpaidTotal.toLocaleString("vi-VN")}₫</span>
        ) : activeCount > 0 ? (
          <span className="d-num text-[10px] font-bold text-[var(--d-text)] sm:text-[length:var(--d-fs-xs)]">{activeCount} hoạt động</span>
        ) : (
          <span className="truncate text-[10px] font-semibold text-[var(--d-text-muted)] sm:text-[length:var(--d-fs-xs)]">{meta.label}</span>
        )}
      </span>
    </button>
  );
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
  const [createAreaOpen, setCreateAreaOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [activeFloor, setActiveFloor] = useState("all");

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
        setCreateAreaOpen(false);
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
  const allFloorLabels = useMemo(() => Array.from(new Set(tables.map(floorLabel))), [tables]);
  const zoneFiltered = useMemo(() => (zone === "all" ? tables : tables.filter((t) => zoneLabel(t) === zone)), [tables, zone]);
  const floorTabs = useMemo(() => Array.from(new Set(zoneFiltered.map(floorLabel))).map((floor) => ({ floor, count: zoneFiltered.filter((t) => floorLabel(t) === floor).length })), [zoneFiltered]);
  const resolvedActiveFloor = activeFloor !== "all" && floorTabs.some((tab) => tab.floor === activeFloor) ? activeFloor : "all";
  const visible = resolvedActiveFloor === "all" ? zoneFiltered : zoneFiltered.filter((t) => floorLabel(t) === resolvedActiveFloor);
  const floorPlans = useMemo(() => groupByFloor(visible), [visible]);
  const counts = {
    total: tables.length,
    active: tables.filter((t) => t.status !== "available").length,
    overdue: tables.filter((t) => t.status === "overdue").length,
    payment: tables.filter((t) => t.status === "awaiting_payment").length
  };

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <Toolbar eyebrow="Vận hành" title="Bàn &amp; QR">
        <RealtimeStatusBadge state={rtState} />
        <Button variant={editMode ? "primary" : "secondary"} size="md" onClick={() => setEditMode((v) => !v)}><Settings2 size={15} /> {editMode ? "Đang quản lý" : "Quản lý sơ đồ"}</Button>
        <Button variant="secondary" size="md" onClick={() => setCreateAreaOpen(true)}><Plus size={15} /> Thêm khu/tầng</Button>
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

      <section className="overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]">
        <div className="border-b border-[var(--d-line)] px-[var(--d-s-4)] py-[var(--d-s-4)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="d-eyebrow">Sơ đồ bàn theo tầng</p>
              <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
                {editMode ? "Chọn bàn để mở cấu hình. Mỗi tầng/khu là một sơ đồ riêng để dễ vận hành trên mobile." : "Bấm vào bàn để xem đơn, QR và cấu hình."}
              </p>
            </div>
            <TableStatusLegend />
          </div>

          {floorTabs.length > 1 ? (
            <div className="-mx-[var(--d-s-4)] mt-3 flex gap-2 overflow-x-auto px-[var(--d-s-4)] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <FloorTab active={resolvedActiveFloor === "all"} label="Tất cả tầng" count={zoneFiltered.length} onClick={() => setActiveFloor("all")} />
              {floorTabs.map((floor) => (
                <FloorTab key={floor.floor} active={resolvedActiveFloor === floor.floor} label={floor.floor} count={floor.count} onClick={() => setActiveFloor(floor.floor)} />
              ))}
            </div>
          ) : null}
        </div>

        <FloorPlanSections
          plans={floorPlans}
          selectedId={selectedId}
          editMode={editMode}
          onSelect={(table) => setSelectedId(table.id)}
          onEdit={(table) => {
            setEdit(table);
            setSelectedId(null);
          }}
        />
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
      <CreateAreaModal
        open={createAreaOpen}
        branches={branches}
        existingFloors={allFloorLabels}
        existingAreas={zones}
        onClose={() => setCreateAreaOpen(false)}
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
  const [viewState, setViewState] = useState<{ tableId: string | null; view: "orders" | "config" }>({ tableId: null, view: "config" });
  const hasActiveOrders = (table?.activeOrderCount ?? 0) > 0 || (table?.unpaidTotal ?? 0) > 0;

  if (!table) return null;
  const tableData = table;
  const meta = STATUS[tableData.status];
  const publicUrl = tableQrUrl(slug, tableData);
  const previewSrc = qrImageUrl(publicUrl, 360);
  const view = viewState.tableId === table.id ? viewState.view : hasActiveOrders ? "orders" : "config";
  const setView = (next: "orders" | "config") => setViewState({ tableId: table.id, view: next });

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
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
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
      await readDashboardApiResponse(res, "Thao tác thất bại");
      toast.success(successMsg ? { title: successMsg } : resolveDashboardActionToast(action));
      await load();
      onChanged();
    } catch (e) {
      toast.error(getDashboardActionErrorToast(e));
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
        const actionDecision = resolveDashboardOrderAction(o);
        const paymentAction = actionDecision?.action === "confirm-payment" ? actionDecision : null;
        const waitingPay = Boolean(paymentAction);
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
              {paymentAction ? (
                <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={() => void act(o.id, "confirm-payment", resolveDashboardPaymentConfirmationBody(o), paymentAction.successMessage)}>
                  <CreditCard size={16} /> {paymentAction.label}
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

function CreateAreaModal({
  open,
  branches,
  existingFloors,
  existingAreas,
  onClose,
  onCreate,
  pending
}: {
  open: boolean;
  branches: TableBranchOption[];
  existingFloors: string[];
  existingAreas: string[];
  onClose: () => void;
  onCreate: (fd: FormData) => void;
  pending: boolean;
}) {
  if (!open) return null;
  const nextFloorNumber = Math.max(1, existingFloors.length + 1);
  const nextTableNumber = String(Math.max(1, existingAreas.length + 1)).padStart(2, "0");
  return (
    <Modal open onClose={onClose} size="md" title="Thêm khu / tầng" subtitle="Sơ đồ bàn">
      <form action={(fd) => onCreate(fd)} className="grid gap-3">
        <div className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
          <p className="text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">Tạo khu vận hành mới kèm bàn đầu tiên</p>
          <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            LogiVN nhóm sơ đồ theo tầng và khu. Sau khi tạo, bạn có thể thêm tiếp các bàn khác vào cùng tầng/khu này.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Tầng / sơ đồ</span>
            <input
              name="floorLabel"
              required
              minLength={1}
              maxLength={80}
              defaultValue={`Tầng ${nextFloorNumber}`}
              list="table-floor-suggestions"
              placeholder="VD: Tầng 1"
              className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold outline-none focus:border-[var(--d-jade)]"
            />
            <datalist id="table-floor-suggestions">
              {existingFloors.map((floor) => <option key={floor} value={floor} />)}
            </datalist>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Tên khu trong tầng</span>
            <input
              name="area"
              required
              minLength={1}
              maxLength={80}
              defaultValue="Khu chính"
              list="table-area-suggestions"
              placeholder="VD: Khu cửa sổ"
              className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold outline-none focus:border-[var(--d-jade)]"
            />
            <datalist id="table-area-suggestions">
              {existingAreas.map((area) => <option key={area} value={area} />)}
            </datalist>
          </label>
          <Field label="Bàn đầu tiên" name="name" required defaultValue={`Bàn ${nextTableNumber}`} placeholder="VD: Bàn 01" />
          <Field label="Sức chứa" name="capacity" type="number" defaultValue="4" min={1} max={50} />
          <SelectField
            label="Loại không gian"
            name="seatingZone"
            defaultValue="indoor"
            options={[
              { v: "indoor", l: "Trong nhà" },
              { v: "outdoor", l: "Ngoài trời" },
              { v: "mixed", l: "Hỗn hợp" }
            ]}
          />
          <SelectField
            label="Loại bàn đầu tiên"
            name="tableKind"
            defaultValue="standard"
            options={[
              { v: "standard", l: "Thường" },
              { v: "vip", l: "VIP" },
              { v: "bar", l: "Quầy bar" },
              { v: "community", l: "Bàn chung" }
            ]}
          />
          {branches.length > 0 ? (
            <SelectField
              label="Chi nhánh"
              name="branchId"
              defaultValue={branches[0]?.id ?? ""}
              options={branches.map((b) => ({ v: b.id, l: b.name }))}
            />
          ) : null}
        </div>

        <input type="hidden" name="isBookable" value="true" />
        <input type="hidden" name="isHidden" value="false" />
        <input type="hidden" name="isUnderMaintenance" value="false" />

        <div className="mt-2 flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            <Plus size={15} /> {pending ? "Đang tạo…" : "Tạo khu/tầng"}
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

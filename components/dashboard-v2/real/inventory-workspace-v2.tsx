"use client";

/* RealInventoryWorkspaceV2 — production /dashboard/inventory.
 * Layout v2: Toolbar + KPI + AI banner + FilterTabs + DataTable + Drawer.
 *
 * Tính năng:
 *  - Quản lý nguyên liệu: tạo, sửa nhanh, vô hiệu hoá, nhập kho nhanh
 *  - Quản lý danh mục nguyên liệu
 *  - Cảnh báo tồn kho: refresh AI alerts
 *  - Công thức món: hiển thị recipe lines của ingredient (món nào dùng)
 *  - Movement nhanh: nhập / điều chỉnh
 *  - Drawer "Quản lý nâng cao" embed legacy InventoryWorkspaceV2 cho PO/transfers/OCR
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  BellRing,
  Boxes,
  CalendarClock,
  Check,
  ChefHat,
  ClipboardList,
  FileText,
  FolderPlus,
  PackageCheck,
  Plus,
  Settings2,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trash2,
  Wallet,
  X
} from "lucide-react";
import { FilterTabs, Toolbar, DataTable, type Column } from "../workspace-ui";
import { MetricCard, Badge, EmptyState } from "../primitives";
import { Button } from "../button";
import { Drawer, Modal } from "../overlay";
import { RealtimeStatusBadge } from "../realtime";
import { NextSteps } from "../cross-link";
import { MobileCollapse } from "../mobile-collapse";
import {
  createInventoryCategoryAction,
  createInventoryIngredientAction,
  deactivateInventoryIngredientAction,
  recordInventoryMovementAction,
  refreshInventoryAlertsAction,
  updateInventoryAlertStatusAction,
  updateInventoryIngredientAction
} from "@/app/dashboard/actions";
import { InventoryWorkspaceV2 as LegacyInventoryWorkbench } from "@/components/dashboard/inventory-workspace-v2";
import { useToast } from "@/components/dashboard/toast-provider";
import { useDashboardRealtime } from "@/hooks/use-dashboard-realtime";
import { formatVnd } from "@/lib/money";
import type {
  InventoryAlert,
  InventoryCategory,
  InventoryIngredient,
  InventoryIntelligence,
  InventoryRecipeMenuItem,
  InventoryReorderSuggestion,
  InventorySnapshot,
  InventoryStockBalance,
  InventoryWarehouseCommandCenter
} from "@/services/inventory-service";

type Features = {
  basic: boolean;
  procurement: boolean;
  warehouseAdvanced: boolean;
  alerts: boolean;
  premium: boolean;
  aiOcr: boolean;
};

type Props = {
  restaurantId: string;
  snapshot: InventorySnapshot;
  categories: InventoryCategory[];
  ingredients: InventoryIngredient[];
  recipeMenuItems: InventoryRecipeMenuItem[];
  intelligence: InventoryIntelligence;
  warehouse: InventoryWarehouseCommandCenter;
  inventoryFeatures: Features;
};

type StockTab = "all" | "alert" | "low" | "out";

/* Bảng realtime kho — ref ổn định (tránh re-subscribe mỗi render).
 * Mọi bảng đều có cột restaurant_id nên dùng filter mặc định. */
const INVENTORY_REALTIME_TABLES = [
  { table: "ingredients" },
  { table: "inventory_movements" },
  { table: "inventory_alerts" },
  { table: "inventory_batches" },
  { table: "purchase_orders" },
  { table: "branch_transfers" },
  { table: "stock_balances" },
  { table: "inventory_counts" }
] as const;

function stockState(i: InventoryIngredient): {
  key: "ok" | "low" | "out";
  label: string;
  tone: "ok" | "orange" | "danger";
} {
  if (i.onHandQuantity <= 0) return { key: "out", label: "Hết hàng", tone: "danger" };
  if (i.onHandQuantity < i.minimumQuantity) return { key: "low", label: "Sắp hết", tone: "orange" };
  return { key: "ok", label: "Đủ", tone: "ok" };
}

function daysLeft(i: InventoryIngredient) {
  if (i.minimumQuantity <= 0) return null;
  return Math.max(0, Math.round(i.onHandQuantity / Math.max(1, i.minimumQuantity)));
}

export function RealInventoryWorkspaceV2(props: Props) {
  const { restaurantId, snapshot, categories, ingredients, recipeMenuItems, intelligence, warehouse } = props;
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<StockTab>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [createIngredientOpen, setCreateIngredientOpen] = useState(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingAction, startTransition] = useTransition();
  const refreshRef = useRef<number | null>(null);

  const rtState = useDashboardRealtime({
    restaurantId,
    workspace: "inventory",
    tables: INVENTORY_REALTIME_TABLES
  });

  const counts = useMemo(() => {
    let low = 0;
    let out = 0;
    for (const i of ingredients) {
      const s = stockState(i);
      if (s.key === "low") low += 1;
      if (s.key === "out") out += 1;
    }
    return { all: ingredients.length, low, out, alert: low + out };
  }, [ingredients]);

  const visible = useMemo(() => {
    if (tab === "all") return ingredients;
    if (tab === "alert") return ingredients.filter((i) => stockState(i).key !== "ok");
    return ingredients.filter((i) => stockState(i).key === tab);
  }, [ingredients, tab]);

  const selected = ingredients.find((i) => i.id === selectedId) ?? null;
  const inventoryValue = useMemo(
    () => ingredients.reduce((s, i) => s + i.onHandQuantity * i.referenceUnitCost, 0),
    [ingredients]
  );
  const aiAction = intelligence.actionQueue[0];

  const healthTone: "jade" | "info" | "orange" | "danger" =
    intelligence.healthScore >= 80 ? "jade" : intelligence.healthScore >= 60 ? "info" : intelligence.healthScore >= 40 ? "orange" : "danger";

  // Lô sắp / đã hết hạn — surface để tránh lãng phí (HSD).
  const expiringBatches = useMemo(() => {
    const now = Date.now();
    const horizonMs = 7 * 24 * 60 * 60 * 1000;
    return warehouse.stockBalances
      .filter((b) => {
        if (b.status === "expired") return true;
        if (!b.expirationDate) return false;
        const diff = new Date(b.expirationDate).getTime() - now;
        return Number.isFinite(diff) && diff <= horizonMs && b.onHandQuantity > 0;
      })
      .sort((a, b) => {
        const ta = a.expirationDate ? new Date(a.expirationDate).getTime() : Number.POSITIVE_INFINITY;
        const tb = b.expirationDate ? new Date(b.expirationDate).getTime() : Number.POSITIVE_INFINITY;
        return ta - tb;
      })
      .slice(0, 12);
  }, [warehouse.stockBalances]);

  const openAlerts = useMemo(
    () => warehouse.alerts.filter((a) => a.status === "open" || a.status === "acknowledged").slice(0, 8),
    [warehouse.alerts]
  );

  const recentPurchaseOrders = useMemo(() => warehouse.purchaseOrders.slice(0, 6), [warehouse.purchaseOrders]);

  // Build map: ingredient.id -> menuItems sử dụng nguyên liệu này
  const menuItemsByIngredient = useMemo(() => {
    const map = new Map<string, Array<{ id: string; name: string; categoryName: string; quantity: number; unit: string; cost: number }>>();
    for (const menuItem of recipeMenuItems) {
      for (const line of menuItem.recipeLines) {
        const list = map.get(line.ingredientId) ?? [];
        list.push({
          id: menuItem.id,
          name: menuItem.name,
          categoryName: menuItem.categoryName,
          quantity: line.quantityPerItem,
          unit: line.ingredientUnit,
          cost: line.costPerItem
        });
        map.set(line.ingredientId, list);
      }
    }
    return map;
  }, [recipeMenuItems]);

  async function recordReceive(i: InventoryIngredient, quantity: number) {
    if (pendingId) return;
    setPendingId(i.id);
    try {
      const fd = new FormData();
      fd.set("ingredientId", i.id);
      fd.set("movementType", "receive");
      fd.set("quantity", String(quantity));
      fd.set("reason", "Nhập nhanh từ Dashboard v2");
      await recordInventoryMovementAction(fd);
      toast.success(`Đã nhập ${quantity} ${i.unit} cho ${i.name}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không nhập được kho");
    } finally {
      setPendingId(null);
    }
  }

  // Movement nâng cao: nhập / điều chỉnh / hao hụt / hết hạn / dùng nội bộ.
  async function recordMovement(
    ingredientId: string,
    movementType: string,
    quantity: number,
    reason: string,
    successMsg: string
  ) {
    if (pendingId) return;
    setPendingId(ingredientId);
    try {
      const fd = new FormData();
      fd.set("ingredientId", ingredientId);
      fd.set("movementType", movementType);
      fd.set("quantity", String(quantity));
      fd.set("reason", reason);
      await recordInventoryMovementAction(fd);
      toast.success(successMsg);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không ghi nhận được điều chỉnh kho");
    } finally {
      setPendingId(null);
    }
  }

  // Nhập nhanh theo đề xuất đặt hàng của AI.
  function quickReorderReceive(s: InventoryReorderSuggestion) {
    const qty = s.reorderQuantity > 0 ? s.reorderQuantity : Math.max(s.minimumQuantity, 1);
    void recordMovement(
      s.ingredientId,
      "receive",
      qty,
      "Nhập nhanh theo đề xuất tối ưu kho (AI)",
      `Đã nhập ${qty} ${s.unit} cho ${s.name}`
    );
  }

  // Alert lifecycle inline: ack / resolve / dismiss.
  function changeAlertStatus(alertId: string, status: "acknowledged" | "resolved" | "dismissed", successMsg: string) {
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("alertId", alertId);
        fd.set("status", status);
        await updateInventoryAlertStatusAction(fd);
        toast.success(successMsg);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không cập nhật được cảnh báo");
      }
    });
  }

  async function refreshAlerts() {
    try {
      await refreshInventoryAlertsAction();
      toast.success("Đã làm mới cảnh báo kho");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không làm mới được cảnh báo");
    }
  }

  function saveIngredient(fd: FormData) {
    startTransition(async () => {
      try {
        await updateInventoryIngredientAction(fd);
        toast.success("Đã lưu nguyên liệu");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không lưu được nguyên liệu");
      }
    });
  }

  function deactivateIngredient(id: string) {
    if (!window.confirm("Vô hiệu hoá nguyên liệu này? Sẽ ẩn khỏi danh sách hoạt động nhưng lịch sử kho vẫn giữ.")) return;
    const fd = new FormData();
    fd.set("ingredientId", id);
    startTransition(async () => {
      try {
        await deactivateInventoryIngredientAction(fd);
        toast.success("Đã vô hiệu hoá nguyên liệu");
        setSelectedId(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không vô hiệu hoá được");
      }
    });
  }

  const cols: Column<InventoryIngredient>[] = [
    {
      key: "name",
      header: "Nguyên liệu",
      width: "1.6fr",
      render: (i) => (
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold text-[var(--d-text)]">{i.name}</span>
          <span className="text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">
            {i.categoryName ?? "Chưa phân loại"}
            {i.sku ? ` · ${i.sku}` : ""}
          </span>
        </span>
      )
    },
    {
      key: "stock",
      header: "Tồn / Tối thiểu",
      render: (i) => {
        const st = stockState(i);
        return (
          <span className="d-num text-[var(--d-text-muted)]">
            <span className={st.key !== "ok" ? "font-bold text-[var(--d-danger-fg)]" : "font-bold text-[var(--d-text)]"}>{i.onHandQuantity}</span>
            {" / "}
            {i.minimumQuantity} {i.unit}
          </span>
        );
      }
    },
    {
      key: "days",
      header: "Còn dùng",
      render: (i) => {
        const d = daysLeft(i);
        if (d === null) return <span className="text-[var(--d-text-faint)]">—</span>;
        if (d <= 0) return <span className="d-num font-semibold text-[var(--d-danger-fg)]">Hôm nay</span>;
        return <span className="d-num text-[var(--d-text-muted)]">{d} ngày</span>;
      }
    },
    {
      key: "recipes",
      header: "Dùng cho món",
      render: (i) => {
        const list = menuItemsByIngredient.get(i.id) ?? [];
        if (list.length === 0) return <span className="text-[var(--d-text-faint)]">—</span>;
        return <Badge tone="info">{list.length} món</Badge>;
      }
    },
    {
      key: "cost",
      header: "Giá vốn",
      align: "right",
      render: (i) => <span className="d-num text-[var(--d-text-muted)]">{formatVnd(i.referenceUnitCost)}/{i.unit}</span>
    },
    {
      key: "status",
      header: "Trạng thái",
      align: "right",
      render: (i) => {
        const st = stockState(i);
        return <Badge tone={st.tone}>{st.label}</Badge>;
      }
    }
  ];

  return (
    <div className="flex flex-col gap-[var(--d-s-5)]">
      <Toolbar eyebrow="Kho & giá vốn" title="Kho hàng">
        <RealtimeStatusBadge state={rtState} />
        <Button variant="secondary" size="md" onClick={() => void refreshAlerts()}>
          <Sparkles size={15} /> Quét cảnh báo
        </Button>
        <Button variant="secondary" size="md" onClick={() => setCreateCategoryOpen(true)}>
          <FolderPlus size={15} /> Nhóm nguyên liệu
        </Button>
        <Button variant="primary" size="md" onClick={() => setCreateIngredientOpen(true)}>
          <Plus size={15} /> Thêm nguyên liệu
        </Button>
        <Button variant="ghost" size="md" onClick={() => setAdvancedOpen(true)}>
          <Settings2 size={15} /> Quản lý nâng cao
        </Button>
      </Toolbar>

      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        <MetricCard icon={<Boxes size={18} />} label="Nguyên liệu" value={String(snapshot.ingredientCount)} helper={`${categories.length} nhóm`} tone="jade" />
        <MetricCard icon={<AlertTriangle size={18} />} label="Sắp hết" value={String(counts.low)} helper={snapshot.schemaReady ? "DB sẵn sàng" : "Chưa đủ schema"} tone={counts.low > 0 ? "orange" : "neutral"} />
        <MetricCard icon={<TrendingDown size={18} />} label="Hết hàng" value={String(counts.out)} helper={`${warehouse.openAlertCount} cảnh báo mở`} tone={counts.out > 0 ? "danger" : "neutral"} />
        <MetricCard icon={<FileText size={18} />} label="Giá trị kho" value={formatVnd(inventoryValue)} helper={`${snapshot.recipeReadyItemCount}/${snapshot.menuItemCount} món sẵn`} tone="info" />
      </section>

      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        <MetricCard icon={<ShoppingCart size={18} />} label="PO đang mở" value={String(warehouse.openPurchaseOrderCount)} helper={`${warehouse.purchaseOrderCount} đơn tổng`} tone={warehouse.openPurchaseOrderCount > 0 ? "info" : "neutral"} />
        <MetricCard icon={<CalendarClock size={18} />} label="Lô sắp hết hạn" value={String(warehouse.expiringBatchCount)} helper={`${warehouse.batchCount} lô theo dõi`} tone={warehouse.expiringBatchCount > 0 ? "orange" : "neutral"} />
        <MetricCard icon={<Activity size={18} />} label="Sức khoẻ kho" value={`${Math.round(intelligence.healthScore)}/100`} helper={`Tiêu thụ tuần ${formatVnd(intelligence.weeklyUsageValue)}`} tone={healthTone} />
        <MetricCard icon={<Wallet size={18} />} label="Giá trị nhập dự kiến" value={formatVnd(intelligence.projectedPurchaseValue)} helper={`${intelligence.reorderSuggestions.length} đề xuất đặt hàng`} tone={intelligence.projectedPurchaseValue > 0 ? "jade" : "neutral"} />
      </section>

      {intelligence.aiBrief ? (
        <div className="flex flex-col gap-3 rounded-[var(--d-r-lg)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)]/50 p-[var(--d-s-4)] sm:flex-row sm:items-start">
          <Sparkles size={18} className="flex-none text-[var(--d-orange-600)]" />
          <div className="flex-1">
            <p className="text-[length:var(--d-fs-sm)] text-[var(--d-text)]">
              <span className="font-semibold">AI tóm tắt kho:</span> {intelligence.aiBrief}
            </p>
            {aiAction ? (
              <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
                Ưu tiên: {aiAction.detail || aiAction.title}
              </p>
            ) : null}
          </div>
          <Button variant="secondary" size="sm" onClick={() => setAdvancedOpen(true)}>Mở bảng điều khiển</Button>
        </div>
      ) : null}

      <MobileCollapse title="Phân tích & cảnh báo kho" hint="Đề xuất đặt hàng · lô sắp hết hạn · PO gần đây">
        <InventoryOptimizationPanel
          intelligence={intelligence}
          pendingId={pendingId}
          onQuickReorder={quickReorderReceive}
        />

        <ExpiringBatchesPanel batches={expiringBatches} expiringCount={warehouse.expiringBatchCount} />

        <AlertLifecyclePanel
          alerts={openAlerts}
          totalOpen={warehouse.openAlertCount}
          pending={pendingAction}
          onRefresh={() => void refreshAlerts()}
          onChangeStatus={changeAlertStatus}
        />

        <RecentPurchaseOrdersPanel
          purchaseOrders={recentPurchaseOrders}
          totalOpen={warehouse.openPurchaseOrderCount}
          onManage={() => setAdvancedOpen(true)}
        />
      </MobileCollapse>

      <FilterTabs
        active={tab}
        onChange={(k) => setTab(k as StockTab)}
        tabs={[
          { key: "all", label: "Tất cả", count: counts.all },
          { key: "alert", label: "Cần chú ý", count: counts.alert },
          { key: "low", label: "Sắp hết", count: counts.low },
          { key: "out", label: "Hết", count: counts.out }
        ]}
      />

      <DataTable
        columns={cols}
        rows={visible}
        onRowClick={(i) => setSelectedId(i.id)}
        empty={
          <EmptyState
            icon={<PackageCheck size={20} />}
            title={tab === "all" ? "Chưa có nguyên liệu" : "Không có cảnh báo kho"}
            description={tab === "all" ? "Thêm nguyên liệu để bắt đầu quản lý tồn kho và liên kết công thức món." : "Tất cả nguyên liệu đang ở mức an toàn."}
            action={tab === "all" ? <Button variant="primary" size="md" onClick={() => setCreateIngredientOpen(true)}><Plus size={15} /> Thêm nguyên liệu</Button> : null}
          />
        }
      />

      {selected ? (
        <IngredientDrawer
          item={selected}
          categories={categories}
          menuItems={menuItemsByIngredient.get(selected.id) ?? []}
          pending={pendingId === selected.id || pendingAction}
          onClose={() => setSelectedId(null)}
          onReceive={(qty) => void recordReceive(selected, qty)}
          onAdjust={(movementType, qty, reason, label) => void recordMovement(selected.id, movementType, qty, reason, label)}
          onSave={saveIngredient}
          onDeactivate={() => deactivateIngredient(selected.id)}
        />
      ) : null}

      <Drawer
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        width="lg"
        title="Quản lý kho nâng cao"
        subtitle="Workbench, PO, transfers, OCR"
        contentClassName="px-2 sm:px-3"
      >
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-3)]">
          <LegacyInventoryWorkbench {...props} />
        </div>
      </Drawer>

      <CreateIngredientModal
        open={createIngredientOpen}
        categories={categories}
        onClose={() => setCreateIngredientOpen(false)}
        onCreated={() => {
          setCreateIngredientOpen(false);
          router.refresh();
          toast.success("Đã thêm nguyên liệu mới");
        }}
        onError={(msg) => toast.error(msg)}
      />

      <CreateInventoryCategoryModal
        open={createCategoryOpen}
        onClose={() => setCreateCategoryOpen(false)}
        onCreated={() => {
          setCreateCategoryOpen(false);
          router.refresh();
          toast.success("Đã thêm nhóm nguyên liệu");
        }}
        onError={(msg) => toast.error(msg)}
      />

      <NextSteps
        items={[
          { href: "/dashboard/menu", label: "Menu món", hint: "Liên kết công thức tại từng món", icon: <ChefHat size={14} /> },
          { href: "/dashboard/kitchen", label: "Bếp", hint: "Tiêu thụ thực tế", icon: <PackageCheck size={14} /> },
          { href: "/dashboard/analytics", label: "Báo cáo", hint: "Giá vốn, lãi gộp", icon: <FileText size={14} /> }
        ]}
      />
    </div>
  );
}

function IngredientDrawer({
  item,
  categories,
  menuItems,
  pending,
  onClose,
  onReceive,
  onAdjust,
  onSave,
  onDeactivate
}: {
  item: InventoryIngredient;
  categories: InventoryCategory[];
  menuItems: Array<{ id: string; name: string; categoryName: string; quantity: number; unit: string; cost: number }>;
  pending: boolean;
  onClose: () => void;
  onReceive: (qty: number) => void;
  onAdjust: (movementType: string, qty: number, reason: string, successMsg: string) => void;
  onSave: (fd: FormData) => void;
  onDeactivate: () => void;
}) {
  const st = stockState(item);
  const suggestedQty = Math.max(item.minimumQuantity * 2 - item.onHandQuantity, item.minimumQuantity);
  const formId = `ingredient-edit-${item.id}`;
  const [receiveQty, setReceiveQty] = useState(suggestedQty);
  const [adjustType, setAdjustType] = useState<"waste" | "expired" | "internal_use" | "adjust_decrease">("waste");
  const [adjustQty, setAdjustQty] = useState(0);

  const adjustOptions: Array<{ value: typeof adjustType; label: string }> = [
    { value: "waste", label: "Hao hụt / hỏng" },
    { value: "expired", label: "Hết hạn" },
    { value: "internal_use", label: "Dùng nội bộ" },
    { value: "adjust_decrease", label: "Điều chỉnh giảm" }
  ];

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={item.name}
      subtitle={item.categoryName ?? "Chưa phân loại"}
      headerMeta={
        <>
          <Badge tone={st.tone}>{st.label}</Badge>
          <Badge tone="neutral">
            <span className="d-num">{item.onHandQuantity}</span>
            {" / "}
            <span className="d-num">{item.minimumQuantity}</span> {item.unit}
          </Badge>
          {menuItems.length > 0 ? <Badge tone="info">{menuItems.length} món</Badge> : null}
        </>
      }
      footer={
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="lg" onClick={onDeactivate} disabled={pending}>
            <Trash2 size={14} /> Vô hiệu hoá
          </Button>
          <Button type="submit" form={formId} variant="primary" size="lg" className="flex-1" disabled={pending}>
            {pending ? "Đang lưu…" : "Lưu thay đổi"}
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        action={(fd) => onSave(fd)}
        className="flex flex-col gap-[var(--d-s-4)]"
      >
        <input type="hidden" name="ingredientId" value={item.id} />

        {/* Nhập kho nhanh */}
        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-jade)]/25 bg-[var(--d-primary-soft)]/40 p-[var(--d-s-4)]">
          <p className="d-eyebrow text-[var(--d-primary)]">Nhập kho nhanh</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[length:var(--d-fs-2xs)] font-semibold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Số lượng nhập ({item.unit})</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={receiveQty}
                onChange={(e) => setReceiveQty(Math.max(0, Number(e.target.value) || 0))}
                className="d-num h-10 w-32 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-bold outline-none focus:border-[var(--d-jade)]"
              />
            </label>
            <Button type="button" variant="primary" size="md" onClick={() => onReceive(receiveQty)} disabled={pending || receiveQty <= 0}>
              <PackageCheck size={14} /> Ghi nhận nhập
            </Button>
            <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
              Gợi ý: <button type="button" onClick={() => setReceiveQty(suggestedQty)} className="font-bold text-[var(--d-primary)] underline">{suggestedQty} {item.unit}</button> để duy trì 2× tối thiểu
            </p>
          </div>
        </section>

        {/* Điều chỉnh kho nâng cao */}
        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)]/40 p-[var(--d-s-4)]">
          <p className="d-eyebrow text-[var(--d-orange-600)]">Điều chỉnh kho (xuất / hao hụt)</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[length:var(--d-fs-2xs)] font-semibold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Loại điều chỉnh</span>
              <select
                value={adjustType}
                onChange={(e) => setAdjustType(e.target.value as typeof adjustType)}
                className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold outline-none focus:border-[var(--d-orange)]"
              >
                {adjustOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[length:var(--d-fs-2xs)] font-semibold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Số lượng giảm ({item.unit})</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={adjustQty}
                onChange={(e) => setAdjustQty(Math.max(0, Number(e.target.value) || 0))}
                className="d-num h-10 w-32 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-bold outline-none focus:border-[var(--d-orange)]"
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={pending || adjustQty <= 0}
              onClick={() => {
                const label = adjustOptions.find((o) => o.value === adjustType)?.label ?? "Điều chỉnh";
                onAdjust(adjustType, adjustQty, `${label} từ Dashboard v2`, `Đã ghi nhận ${label.toLowerCase()} ${adjustQty} ${item.unit} cho ${item.name}`);
                setAdjustQty(0);
              }}
            >
              <TrendingDown size={14} /> Ghi nhận giảm
            </Button>
          </div>
          <p className="mt-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            Dùng để trừ tồn khi hàng hỏng, hết hạn, dùng nội bộ hoặc kiểm kê lệch. Lịch sử kho được giữ đầy đủ.
          </p>
        </section>

        {/* Thông tin cơ bản */}
        <section className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Tên nguyên liệu</span>
            <input
              name="name"
              defaultValue={item.name}
              required
              minLength={1}
              maxLength={160}
              className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold outline-none focus:border-[var(--d-jade)]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Danh mục</span>
            <select
              name="categoryId"
              defaultValue={item.categoryId ?? ""}
              className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold outline-none focus:border-[var(--d-jade)]"
            >
              <option value="">Chưa phân loại</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Đơn vị tính</span>
            <input
              name="unit"
              defaultValue={item.unit}
              required
              maxLength={24}
              placeholder="kg / lít / hộp / cái"
              className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Tồn hiện tại</span>
            <input
              name="onHandQuantity"
              type="number"
              min={0}
              step="0.01"
              defaultValue={item.onHandQuantity}
              className="d-num h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-bold outline-none focus:border-[var(--d-jade)]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Tồn tối thiểu</span>
            <input
              name="minimumQuantity"
              type="number"
              min={0}
              step="0.01"
              defaultValue={item.minimumQuantity}
              className="d-num h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-bold outline-none focus:border-[var(--d-jade)]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Giá vốn / {item.unit} (₫)</span>
            <input
              name="referenceUnitCost"
              type="number"
              min={0}
              step={1000}
              defaultValue={item.referenceUnitCost}
              className="d-num h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-bold outline-none focus:border-[var(--d-jade)]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Lead time đặt hàng (ngày)</span>
            <input
              name="reorderLeadDays"
              type="number"
              min={0}
              max={60}
              defaultValue={item.reorderLeadDays ?? 1}
              className="d-num h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-bold outline-none focus:border-[var(--d-jade)]"
            />
          </label>
        </section>

        {/* Vị trí lưu trữ */}
        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
          <p className="d-eyebrow">Vị trí lưu trữ</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Khu vực</span>
              <input
                name="storageArea"
                defaultValue={item.storageArea ?? ""}
                placeholder="VD: Tủ lạnh A, Kệ khô B"
                className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Kệ / mã</span>
              <input
                name="shelfCode"
                defaultValue={item.shelfCode ?? ""}
                placeholder="VD: A-3-2"
                className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
              />
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Ghi chú lưu trữ (tuỳ chọn)</span>
              <input
                name="storageNote"
                defaultValue={item.storageNote ?? ""}
                maxLength={160}
                placeholder="VD: Bảo quản dưới 4°C, hết hạn 7 ngày"
                className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
              />
            </label>
          </div>
        </section>

        {/* Recipe usage */}
        {menuItems.length > 0 ? (
          <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-4)]">
            <p className="d-eyebrow">Dùng cho món ({menuItems.length})</p>
            <div className="mt-3 grid gap-2">
              {menuItems.slice(0, 8).map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{m.name}</span>
                    <span className="block truncate text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{m.categoryName}</span>
                  </span>
                  <span className="d-num shrink-0 text-right text-[length:var(--d-fs-xs)]">
                    <span className="block font-bold text-[var(--d-text)]">{m.quantity} {m.unit}/phần</span>
                    <span className="block text-[var(--d-text-muted)]">{formatVnd(m.cost)}/phần</span>
                  </span>
                </div>
              ))}
              {menuItems.length > 8 ? (
                <p className="text-center text-[length:var(--d-fs-xs)] text-[var(--d-text-faint)]">+ {menuItems.length - 8} món khác</p>
              ) : null}
            </div>
            <p className="mt-3 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
              Quản lý chi tiết công thức (định lượng, % hao hụt) tại từng món trong <a href="/dashboard/menu" className="font-bold text-[var(--d-primary)] underline">Menu món</a>.
            </p>
          </section>
        ) : (
          <section className="rounded-[var(--d-r-lg)] border border-dashed border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-4)] text-center">
            <p className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">Chưa được dùng cho món nào</p>
            <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Mở chi tiết món trong Menu để gắn công thức cho nguyên liệu này.</p>
          </section>
        )}
      </form>
    </Drawer>
  );
}

function CreateIngredientModal({
  open,
  categories,
  onClose,
  onCreated,
  onError
}: {
  open: boolean;
  categories: InventoryCategory[];
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title="Thêm nguyên liệu" subtitle="Kho hàng" size="md">
      <form
        action={async (fd) => {
          if (submitting) return;
          setSubmitting(true);
          try {
            await createInventoryIngredientAction(fd);
            onCreated();
          } catch (e) {
            onError(e instanceof Error ? e.message : "Không thêm được nguyên liệu");
          } finally {
            setSubmitting(false);
          }
        }}
        className="grid gap-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Tên nguyên liệu</span>
            <input
              name="name"
              required
              minLength={1}
              maxLength={160}
              placeholder="VD: Sữa tươi không đường"
              className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Danh mục</span>
            <select
              name="categoryId"
              defaultValue=""
              className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold outline-none focus:border-[var(--d-jade)]"
            >
              <option value="">Chưa phân loại</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Đơn vị tính</span>
            <input
              name="unit"
              defaultValue="kg"
              required
              maxLength={24}
              placeholder="kg / lít / hộp / cái"
              className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Tồn ban đầu</span>
            <input name="onHandQuantity" type="number" min={0} step="0.01" defaultValue={0} className="d-num h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-bold outline-none focus:border-[var(--d-jade)]" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Tồn tối thiểu</span>
            <input name="minimumQuantity" type="number" min={0} step="0.01" defaultValue={5} className="d-num h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-bold outline-none focus:border-[var(--d-jade)]" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Giá vốn (₫)</span>
            <input name="referenceUnitCost" type="number" min={0} step={1000} defaultValue={0} className="d-num h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-bold outline-none focus:border-[var(--d-jade)]" />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Khu vực (tuỳ chọn)</span>
            <input name="storageArea" maxLength={80} placeholder="Tủ lạnh A" className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Kệ / mã (tuỳ chọn)</span>
            <input name="shelfCode" maxLength={80} placeholder="A-3-2" className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Lead time (ngày)</span>
            <input name="reorderLeadDays" type="number" min={0} max={60} defaultValue={1} className="d-num h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-bold outline-none focus:border-[var(--d-jade)]" />
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Ghi chú lưu trữ (tuỳ chọn)</span>
          <input name="storageNote" maxLength={160} placeholder="VD: Bảo quản dưới 4°C" className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" />
        </label>
        <div className="mt-1 flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary" size="md" disabled={submitting}>
            <Plus size={15} /> {submitting ? "Đang tạo…" : "Thêm nguyên liệu"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CreateInventoryCategoryModal({
  open,
  onClose,
  onCreated,
  onError
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title="Thêm nhóm nguyên liệu" subtitle="Kho hàng" size="sm">
      <form
        action={async (fd) => {
          if (submitting) return;
          setSubmitting(true);
          try {
            await createInventoryCategoryAction(fd);
            onCreated();
          } catch (e) {
            onError(e instanceof Error ? e.message : "Không thêm được nhóm");
          } finally {
            setSubmitting(false);
          }
        }}
        className="grid gap-3"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Tên nhóm</span>
          <input
            name="name"
            required
            minLength={1}
            maxLength={120}
            placeholder="VD: Sữa & topping, Đồ khô, Đồ tươi…"
            className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
          />
        </label>
        <div className="flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary" size="md" disabled={submitting}>
            <FolderPlus size={15} /> {submitting ? "Đang tạo…" : "Thêm nhóm"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const urgencyTone: Record<"high" | "medium" | "low", "danger" | "orange" | "info"> = {
  high: "danger",
  medium: "orange",
  low: "info"
};

const urgencyLabel: Record<"high" | "medium" | "low", string> = {
  high: "Khẩn cấp",
  medium: "Nên đặt",
  low: "Theo dõi"
};

function formatExpiry(date: string | null): { label: string; tone: "danger" | "orange" | "neutral" } {
  if (!date) return { label: "Không rõ HSD", tone: "neutral" };
  const diffMs = new Date(date).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return { label: "Không rõ HSD", tone: "neutral" };
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (days < 0) return { label: `Đã hết hạn ${Math.abs(days)} ngày`, tone: "danger" };
  if (days === 0) return { label: "Hết hạn hôm nay", tone: "danger" };
  if (days <= 3) return { label: `Còn ${days} ngày`, tone: "danger" };
  return { label: `Còn ${days} ngày`, tone: "orange" };
}

/* Panel AI tối ưu kho — reorder suggestions + waste + price signals. */
function InventoryOptimizationPanel({
  intelligence,
  pendingId,
  onQuickReorder
}: {
  intelligence: InventoryIntelligence;
  pendingId: string | null;
  onQuickReorder: (s: InventoryReorderSuggestion) => void;
}) {
  const { reorderSuggestions, wasteSignals, priceSignals } = intelligence;
  if (reorderSuggestions.length === 0 && wasteSignals.length === 0 && priceSignals.length === 0) return null;

  return (
    <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-[var(--d-primary)]" />
        <p className="d-eyebrow text-[var(--d-primary)]">AI tối ưu kho</p>
      </div>

      <div className="mt-3 grid gap-[var(--d-s-3)] lg:grid-cols-3">
        {/* Đề xuất đặt hàng */}
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-3)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">Đề xuất đặt hàng</span>
            <Badge tone="jade">{reorderSuggestions.length}</Badge>
          </div>
          <div className="mt-2 grid gap-2">
            {reorderSuggestions.length === 0 ? (
              <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-faint)]">Tồn kho đang đủ, chưa cần đặt thêm.</p>
            ) : (
              reorderSuggestions.slice(0, 6).map((s) => (
                <div key={s.ingredientId} className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{s.name}</span>
                      <span className="block text-[length:var(--d-fs-2xs)] text-[var(--d-text-muted)]">
                        Tồn <span className="d-num">{s.onHandQuantity}</span>/{s.minimumQuantity} {s.unit}
                        {s.daysLeft !== null ? ` · còn ${s.daysLeft} ngày` : ""}
                      </span>
                    </span>
                    <Badge tone={urgencyTone[s.urgency]}>{urgencyLabel[s.urgency]}</Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="d-num text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
                      Đặt <span className="font-bold text-[var(--d-text)]">{s.reorderQuantity} {s.unit}</span> · {formatVnd(s.estimatedCost)}
                    </span>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={pendingId === s.ingredientId}
                      onClick={() => onQuickReorder(s)}
                    >
                      <ArrowDownToLine size={13} /> {pendingId === s.ingredientId ? "Đang nhập…" : "Nhập nhanh"}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tín hiệu lãng phí */}
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-3)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">Tín hiệu lãng phí</span>
            <Badge tone={wasteSignals.length > 0 ? "orange" : "neutral"}>{wasteSignals.length}</Badge>
          </div>
          <div className="mt-2 grid gap-2">
            {wasteSignals.length === 0 ? (
              <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-faint)]">Không có hao hụt đáng kể gần đây.</p>
            ) : (
              wasteSignals.slice(0, 6).map((w) => (
                <div key={w.ingredientId} className="flex items-center justify-between gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{w.name}</span>
                    <span className="block text-[length:var(--d-fs-2xs)] text-[var(--d-text-muted)]">{w.movementCount} lần · {w.wasteQuantity} {w.unit}</span>
                  </span>
                  <span className="d-num shrink-0 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-danger-fg)]">−{formatVnd(w.wasteCost)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Biến động giá */}
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-3)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">Biến động giá nhập</span>
            <Badge tone={priceSignals.length > 0 ? "info" : "neutral"}>{priceSignals.length}</Badge>
          </div>
          <div className="mt-2 grid gap-2">
            {priceSignals.length === 0 ? (
              <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-faint)]">Giá nhập ổn định.</p>
            ) : (
              priceSignals.slice(0, 6).map((p) => {
                const up = p.changePercent >= 0;
                return (
                  <div key={p.ingredientId} className="flex items-center justify-between gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{p.name}</span>
                      <span className="d-num block text-[length:var(--d-fs-2xs)] text-[var(--d-text-muted)]">{formatVnd(p.previousUnitCost)} → {formatVnd(p.latestUnitCost)}</span>
                    </span>
                    <span className={`d-num inline-flex shrink-0 items-center gap-1 text-[length:var(--d-fs-xs)] font-bold ${up ? "text-[var(--d-danger-fg)]" : "text-[var(--d-primary)]"}`}>
                      {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      {up ? "+" : ""}{Math.round(p.changePercent)}%
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* Cảnh báo HSD / lô sắp - đã hết hạn. */
function ExpiringBatchesPanel({
  batches,
  expiringCount
}: {
  batches: InventoryStockBalance[];
  expiringCount: number;
}) {
  if (batches.length === 0 && expiringCount === 0) return null;

  return (
    <section className="rounded-[var(--d-r-lg)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)]/40 p-[var(--d-s-4)]">
      <div className="flex items-center gap-2">
        <CalendarClock size={16} className="text-[var(--d-orange-600)]" />
        <p className="d-eyebrow text-[var(--d-orange-600)]">Cảnh báo hạn sử dụng</p>
        <Badge tone="orange">{expiringCount}</Badge>
      </div>
      {batches.length === 0 ? (
        <p className="mt-3 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Có {expiringCount} lô cần theo dõi HSD. Mở bảng điều khiển để xem chi tiết.</p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {batches.map((b) => {
            const exp = b.status === "expired" ? { label: "Đã hết hạn", tone: "danger" as const } : formatExpiry(b.expirationDate);
            return (
              <div key={b.id} className="flex items-center justify-between gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{b.ingredientName}</span>
                  <span className="block truncate text-[length:var(--d-fs-2xs)] text-[var(--d-text-muted)]">
                    {b.batchCode ? `Lô ${b.batchCode}` : "Không mã lô"}
                    {b.locationName ? ` · ${b.locationName}` : ""}
                    {" · "}<span className="d-num">{b.onHandQuantity}</span> {b.ingredientUnit}
                  </span>
                </span>
                <Badge tone={exp.tone === "neutral" ? "neutral" : exp.tone}>{exp.label}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* Alert lifecycle inline — ack / resolve / dismiss. */
function AlertLifecyclePanel({
  alerts,
  totalOpen,
  pending,
  onRefresh,
  onChangeStatus
}: {
  alerts: InventoryAlert[];
  totalOpen: number;
  pending: boolean;
  onRefresh: () => void;
  onChangeStatus: (alertId: string, status: "acknowledged" | "resolved" | "dismissed", successMsg: string) => void;
}) {
  if (alerts.length === 0 && totalOpen === 0) return null;

  const severityTone: Record<InventoryAlert["severity"], "danger" | "orange" | "info" | "neutral"> = {
    critical: "danger",
    high: "danger",
    medium: "orange",
    low: "info"
  };

  return (
    <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BellRing size={16} className="text-[var(--d-orange-600)]" />
          <p className="d-eyebrow text-[var(--d-orange-600)]">Cảnh báo kho</p>
          <Badge tone={totalOpen > 0 ? "orange" : "neutral"}>{totalOpen} mở</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          <Sparkles size={13} /> Quét lại
        </Button>
      </div>
      {alerts.length === 0 ? (
        <p className="mt-3 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Không có cảnh báo cần xử lý ngay.</p>
      ) : (
        <div className="mt-3 grid gap-2">
          {alerts.map((a) => (
            <div key={a.id} className="flex flex-col gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-2.5 sm:flex-row sm:items-center">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <Badge tone={severityTone[a.severity]}>{a.severity}</Badge>
                  <span className="truncate text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{a.title}</span>
                </span>
                {a.detail || a.ingredientName ? (
                  <span className="mt-0.5 block truncate text-[length:var(--d-fs-2xs)] text-[var(--d-text-muted)]">
                    {a.ingredientName ? `${a.ingredientName} · ` : ""}{a.detail ?? ""}
                  </span>
                ) : null}
              </span>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {a.status === "open" ? (
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => onChangeStatus(a.id, "acknowledged", "Đã tiếp nhận cảnh báo")}>
                    <Check size={13} /> Tiếp nhận
                  </Button>
                ) : null}
                <Button variant="secondary" size="sm" disabled={pending} onClick={() => onChangeStatus(a.id, "resolved", "Đã xử lý cảnh báo")}>
                  <Check size={13} /> Đã xử lý
                </Button>
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => onChangeStatus(a.id, "dismissed", "Đã bỏ qua cảnh báo")}>
                  <X size={13} /> Bỏ qua
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* Danh sách PO gần đây (read-friendly) — quản lý chi tiết trong Drawer legacy. */
function RecentPurchaseOrdersPanel({
  purchaseOrders,
  totalOpen,
  onManage
}: {
  purchaseOrders: InventoryWarehouseCommandCenter["purchaseOrders"];
  totalOpen: number;
  onManage: () => void;
}) {
  if (purchaseOrders.length === 0 && totalOpen === 0) return null;

  const statusTone: Record<string, "jade" | "orange" | "info" | "neutral" | "danger"> = {
    draft: "neutral",
    submitted: "info",
    ordered: "info",
    partially_received: "orange",
    received: "jade",
    cancelled: "danger"
  };
  const statusLabel: Record<string, string> = {
    draft: "Nháp",
    submitted: "Đã gửi",
    ordered: "Đã đặt",
    partially_received: "Nhận một phần",
    received: "Đã nhận",
    cancelled: "Đã huỷ"
  };

  return (
    <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList size={16} className="text-[var(--d-primary)]" />
          <p className="d-eyebrow text-[var(--d-primary)]">Đơn đặt hàng gần đây</p>
          <Badge tone={totalOpen > 0 ? "info" : "neutral"}>{totalOpen} đang mở</Badge>
        </div>
        <Button variant="secondary" size="sm" onClick={onManage}>
          <ShoppingCart size={13} /> Quản lý PO
        </Button>
      </div>
      {purchaseOrders.length === 0 ? (
        <p className="mt-3 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Chưa có đơn đặt hàng. Tạo PO trong bảng điều khiển nâng cao.</p>
      ) : (
        <div className="mt-3 grid gap-2">
          {purchaseOrders.map((po) => (
            <div key={po.id} className="flex items-center justify-between gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-2.5">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{po.poNumber}</span>
                  <Badge tone={statusTone[po.status] ?? "neutral"}>{statusLabel[po.status] ?? po.status}</Badge>
                </span>
                <span className="block truncate text-[length:var(--d-fs-2xs)] text-[var(--d-text-muted)]">
                  {po.supplierName ?? "Chưa gán NCC"}
                  {po.expectedDeliveryAt ? ` · giao ${formatExpiry(po.expectedDeliveryAt).label.toLowerCase()}` : ""}
                  {` · ${po.lineCount} dòng`}
                </span>
              </span>
              <span className="d-num shrink-0 text-right text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{formatVnd(po.totalAmount)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

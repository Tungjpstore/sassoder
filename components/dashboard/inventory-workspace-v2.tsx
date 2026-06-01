"use client";

import {
  AlertTriangle,
  ArrowDownUp,
  AudioLines,
  BadgePercent,
  Bell,
  Boxes,
  BrainCircuit,
  Building2,
  CalendarClock,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileJson,
  FileText,
  GitBranch,
  Layers3,
  MapPin,
  PackageCheck,
  PackagePlus,
  Pencil,
  RadioTower,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Trash2,
  Truck,
  Upload,
  Wand2,
  Warehouse,
  X,
  type LucideIcon
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent, type ReactNode, type RefObject } from "react";
import {
  applyInventoryCountAction,
  createInventoryCategoryAction,
  createInventoryIngredientAction,
  createInventoryPurchaseOrderAction,
  createInventorySupplierAction,
  createInventoryTransferAction,
  deactivateInventoryIngredientAction,
  deleteInventoryRecipeLineAction,
  importInventoryIntakeAction,
  processInventoryTransferAction,
  receiveInventoryPurchaseOrderAction,
  recordInventoryMovementAction,
  refreshInventoryAlertsAction,
  updateInventoryAlertStatusAction,
  updateInventoryIngredientAction,
  upsertInventoryRecipeLineAction
} from "@/app/dashboard/actions";
import { useToast } from "@/components/dashboard/toast-provider";
import { DashboardDrawer } from "@/components/dashboard/shared-drawer";
import { Badge } from "@/components/ui/badge";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { buildInventoryAuditReport, type InventoryAuditReport } from "@/lib/inventory-audit-engine";
import { buildInventoryAnalytics, type InventoryAnalytics } from "@/lib/inventory-analytics-engine";
import { buildInventoryBranchBalancingReport, type InventoryBranchBalancingReport } from "@/lib/inventory-branch-balancer-engine";
import { buildInventoryPurchasePlan, type InventoryPurchasePlan, type PurchasePlanLine } from "@/lib/inventory-purchase-planner-engine";
import { formatVnd } from "@/lib/money";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type {
  InventoryActionPriority,
  InventoryCategory,
  InventoryIngredient,
  InventoryIntelligence,
  InventoryPurchaseOrder,
  InventoryRecipeMenuItem,
  InventorySnapshot,
  InventoryStockBalance,
  InventoryStockBalanceStatus,
  InventoryTransfer,
  InventoryWarehouseCommandCenter
} from "@/services/inventory-service";
import type { InventoryMovementType } from "@/types/domain";

type IntakeMode = "text" | "file" | "voice" | "ocr";
type WorkbenchTab = "intake" | "ingredients" | "stock" | "waste" | "counting" | "transfers" | "balancing" | "purchasing" | "recipes" | "alerts" | "analytics" | "audit" | "ledger";
type DrawerState = { mode: "create" } | { mode: "edit"; ingredient: InventoryIngredient } | null;
type ManualMovementType = Extract<InventoryMovementType, "receive" | "adjust_increase" | "adjust_decrease" | "waste" | "expired" | "internal_use" | "supplier_return" | "rollback">;
type LossMovementType = Extract<InventoryMovementType, "waste" | "expired" | "internal_use" | "supplier_return" | "adjust_decrease">;
type RealtimeState = "connecting" | "connected" | "error";

type IntakeDraftRow = {
  name: string;
  unit: string;
  quantity: number;
  minimumQuantity: number;
  referenceUnitCost: number;
  categoryName?: string;
};

type CountDraftLine = {
  ingredientId: string;
  name: string;
  unit: string;
  locationId: string;
  locationName: string;
  expectedQuantity: number;
  countedQuantity: number;
  note?: string;
};

type TransferDraftLine = {
  ingredientId: string;
  name: string;
  unit: string;
  quantity: number;
  note?: string;
};

type CountDraftSnapshot = {
  locationId?: string;
  lines?: CountDraftLine[];
};

type TransferDraftSnapshot = {
  fromLocationId?: string;
  toLocationId?: string;
  note?: string;
  lines?: TransferDraftLine[];
};

const COUNT_DRAFT_KEY = "logivn:inventory:count-draft:v1";
const TRANSFER_DRAFT_KEY = "logivn:inventory:transfer-draft:v1";

type InventoryCostInsights = {
  recipeReadyCount: number;
  riskyItems: InventoryRecipeMenuItem[];
  watchItems: number;
  totalRecipeCost: number;
  totalGrossProfit: number;
  averageCostPercent: number;
};

type InventoryStockRiskInsights = {
  lowOrOutCount: number;
  expiredCount: number;
  expiringCount: number;
  incomingCount: number;
  reservedValue: number;
  incomingValue: number;
  riskValue: number;
  riskyRows: InventoryStockBalance[];
};

type PurchaseDraftLine = {
  ingredientId: string;
  name: string;
  unit: string;
  orderQuantity: number;
  orderUnit: string;
  unitCost: number;
  expirationDate?: string;
  batchCode?: string;
  note?: string;
};

type PurchaseReceiptDraftLine = {
  purchaseOrderLineId: string;
  receivedQuantity: string;
  unitCost: string;
  expirationDate: string;
  batchCode: string;
  note: string;
};

type SubmitButtonProps = ButtonProps & {
  pendingLabel?: ReactNode;
};

type WorkbenchNavItem = {
  tab: WorkbenchTab;
  label: string;
  icon: LucideIcon;
};

type WorkbenchNavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  primaryTab: WorkbenchTab;
  tabs: WorkbenchNavItem[];
};

type InventoryQuickAction = {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: "green" | "yellow" | "red" | "blue";
  onClick: () => void;
};

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error?: string };

type InventoryOcrResponse = {
  text?: string;
  data?: {
    rows?: Array<IntakeDraftRow & { categoryName?: string | null }>;
  };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const movementTypes: Array<{ value: ManualMovementType; label: string }> = [
  { value: "receive", label: "Nhập kho" },
  { value: "adjust_increase", label: "Điều chỉnh tăng" },
  { value: "adjust_decrease", label: "Điều chỉnh giảm" },
  { value: "waste", label: "Hao hụt" },
  { value: "expired", label: "Hết hạn" },
  { value: "internal_use", label: "Dùng nội bộ" },
  { value: "supplier_return", label: "Trả NCC" },
  { value: "rollback", label: "Hoàn kho" }
];

const lossMovementTypes: Array<{ value: LossMovementType; label: string; hint: string }> = [
  { value: "waste", label: "Hư hỏng / đổ bỏ", hint: "Ghi nhận nguyên liệu hỏng, rơi vãi hoặc pha chế lỗi." },
  { value: "expired", label: "Hết hạn", hint: "Loại khỏi tồn kho vì quá HSD hoặc không còn an toàn." },
  { value: "supplier_return", label: "Trả nhà cung cấp", hint: "Xuất giảm do trả lại NCC, giữ audit theo lô." },
  { value: "internal_use", label: "Dùng nội bộ", hint: "Dùng cho training, R&D, sampling hoặc phục vụ nội bộ." },
  { value: "adjust_decrease", label: "Mất lệch / điều chỉnh giảm", hint: "Dùng khi phát hiện lệch tồn nhưng chưa qua phiên kiểm kê." }
];

const defaultWorkbenchNavGroup: WorkbenchNavGroup = {
  id: "intake",
  label: "Nhập & mua",
  icon: PackagePlus,
  primaryTab: "intake",
  tabs: [
    { tab: "intake", label: "AI nhập kho", icon: Sparkles },
    { tab: "purchasing", label: "NCC & PO", icon: Truck }
  ]
};

const workbenchNavGroups: WorkbenchNavGroup[] = [
  defaultWorkbenchNavGroup,
  {
    id: "stock",
    label: "Tồn kho",
    icon: Warehouse,
    primaryTab: "stock",
    tabs: [
      { tab: "stock", label: "Stock board", icon: Warehouse },
      { tab: "ingredients", label: "Nguyên liệu", icon: Boxes }
    ]
  },
  {
    id: "risk",
    label: "Cảnh báo/HSD",
    icon: Bell,
    primaryTab: "alerts",
    tabs: [
      { tab: "alerts", label: "Cảnh báo", icon: Bell },
      { tab: "waste", label: "Hao hụt & HSD", icon: Trash2 }
    ]
  },
  {
    id: "counting",
    label: "Kiểm kê",
    icon: ClipboardList,
    primaryTab: "counting",
    tabs: [{ tab: "counting", label: "Kiểm kê", icon: ClipboardList }]
  },
  {
    id: "transfers",
    label: "Điều chuyển",
    icon: ArrowDownUp,
    primaryTab: "transfers",
    tabs: [
      { tab: "transfers", label: "Điều chuyển", icon: ArrowDownUp },
      { tab: "balancing", label: "Cân bằng kho", icon: GitBranch }
    ]
  },
  {
    id: "cost",
    label: "Giá vốn món",
    icon: ClipboardCheck,
    primaryTab: "recipes",
    tabs: [{ tab: "recipes", label: "Định mức món", icon: ClipboardCheck }]
  }
];

function formatQuantity(value: number, unit: string) {
  const localizedUnit = unit === "cai" ? "cái" : unit;
  return [Number(value.toFixed(3)).toLocaleString("vi-VN"), localizedUnit].filter(Boolean).join(" ");
}

function ingredientMatchesQuery(ingredient: InventoryIngredient, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [ingredient.name, ingredient.sku, ingredient.barcode, ingredient.categoryName]
    .filter(Boolean)
    .some((value) => value?.toLowerCase().includes(normalized));
}

function readInventoryDraft<T>(key: string) {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T) : null;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

function writeInventoryDraft(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Offline draft persistence is a convenience layer; submitted forms remain the source of truth.
  }
}

function formatPercent(value: number) {
  return `${Number(value.toFixed(0)).toLocaleString("vi-VN")}%`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatSyncClock(value: Date | null) {
  if (!value) return "Đang đồng bộ";
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function daysUntilDate(value: string | null) {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${value}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function expirationCopy(value: string | null) {
  const days = daysUntilDate(value);
  if (days === null) return "Không HSD";
  if (days < 0) return `Quá hạn ${Math.abs(days)} ngày`;
  if (days === 0) return "Hết hạn hôm nay";
  return `Còn ${days} ngày`;
}

function movementLabel(type: InventoryMovementType) {
  const labels: Record<InventoryMovementType, string> = {
    receive: "Nhập kho",
    deduct_sale: "Trừ theo đơn",
    adjust_increase: "Điều chỉnh tăng",
    adjust_decrease: "Điều chỉnh giảm",
    waste: "Hao hụt",
    rollback: "Hoàn kho",
    transfer_in: "Chuyển vào",
    transfer_out: "Chuyển ra",
    expired: "Hết hạn",
    internal_use: "Dùng nội bộ",
    supplier_return: "Trả nhà cung cấp",
    reserve: "Giữ hàng",
    release_reserve: "Xả giữ hàng"
  };
  return labels[type];
}

function realtimeLabel(status: RealtimeState) {
  if (status === "connected") return "Kho live";
  if (status === "error") return "Live gián đoạn";
  return "Đang nối live";
}

function realtimeTone(status: RealtimeState): "green" | "yellow" | "red" {
  if (status === "connected") return "green";
  if (status === "error") return "red";
  return "yellow";
}

function movementTone(type: InventoryMovementType): "green" | "yellow" | "blue" | "red" {
  if (type === "receive" || type === "adjust_increase" || type === "rollback" || type === "transfer_in" || type === "release_reserve") {
    return "green";
  }
  if (type === "waste" || type === "adjust_decrease" || type === "expired" || type === "supplier_return" || type === "transfer_out") {
    return "red";
  }
  if (type === "reserve" || type === "internal_use") return "yellow";
  return "blue";
}

function priorityTone(priority: InventoryActionPriority): "green" | "yellow" | "red" {
  if (priority === "high") return "red";
  if (priority === "medium") return "yellow";
  return "green";
}

function priorityText(priority: InventoryActionPriority) {
  if (priority === "high") return "Gấp";
  if (priority === "medium") return "Quan trọng";
  return "Theo dõi";
}

function auditScoreTone(score: number): "green" | "yellow" | "red" {
  if (score >= 85) return "green";
  if (score >= 65) return "yellow";
  return "red";
}

function auditSeverityTone(severity: InventoryAuditReport["controls"][number]["severity"]): "green" | "yellow" | "red" | "blue" {
  return severity;
}

function stockStatusLabel(status: InventoryStockBalanceStatus) {
  const labels: Record<InventoryStockBalanceStatus, string> = {
    available: "Đủ bán",
    low: "Sắp hết",
    out_of_stock: "Hết hàng",
    expired: "Hết hạn",
    pending_import: "Chờ nhập"
  };
  return labels[status];
}

function stockStatusTone(status: InventoryStockBalanceStatus): "green" | "yellow" | "red" | "blue" {
  if (status === "available") return "green";
  if (status === "pending_import") return "blue";
  if (status === "low") return "yellow";
  return "red";
}

function purchaseOrderStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Nháp",
    pending: "Chờ duyệt",
    approved: "Đã duyệt",
    ordered: "Đã đặt",
    partially_delivered: "Giao một phần",
    delivered: "Đã nhận",
    cancelled: "Đã hủy"
  };
  return labels[status] ?? status;
}

function purchaseOrderTone(status: string): "green" | "yellow" | "red" | "blue" | "neutral" {
  if (status === "delivered") return "green";
  if (status === "cancelled") return "red";
  if (status === "draft") return "neutral";
  if (status === "partially_delivered") return "yellow";
  return "blue";
}

function transferStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Nháp",
    requested: "Đã yêu cầu",
    approved: "Đã duyệt",
    dispatched: "Đang chuyển",
    received: "Đã nhận",
    cancelled: "Đã hủy"
  };
  return labels[status] ?? status;
}

function countStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Nháp",
    submitted: "Chờ áp dụng",
    applied: "Đã áp dụng",
    cancelled: "Đã hủy"
  };
  return labels[status] ?? status;
}

function workflowStatusTone(status: string): "green" | "yellow" | "red" | "blue" | "neutral" {
  if (status === "applied" || status === "received" || status === "delivered") return "green";
  if (status === "cancelled" || status === "dismissed") return "red";
  if (status === "draft") return "neutral";
  if (status === "submitted" || status === "dispatched" || status === "partially_delivered") return "yellow";
  return "blue";
}

function alertTone(severity: string): "green" | "yellow" | "red" | "blue" {
  if (severity === "critical" || severity === "high") return "red";
  if (severity === "medium") return "yellow";
  if (severity === "low") return "blue";
  return "green";
}

function alertSeverityLabel(severity: string) {
  const labels: Record<string, string> = {
    critical: "Khẩn cấp",
    high: "Cao",
    medium: "Vừa",
    low: "Theo dõi"
  };
  return labels[severity] ?? severity;
}

function alertTypeLabel(type: string) {
  const labels: Record<string, string> = {
    low_stock: "Sắp hết",
    out_of_stock: "Hết hàng",
    expiring_soon: "Sắp HSD",
    expired: "Quá HSD",
    abnormal_usage: "Dùng bất thường",
    waste_spike: "Hao hụt tăng",
    missing_inventory: "Thiếu balance",
    supplier_delay: "NCC trễ",
    price_spike: "Tăng giá",
    recipe_gap: "Thiếu định mức"
  };
  return labels[type] ?? type;
}

function alertStatusLabel(status: string) {
  const labels: Record<string, string> = {
    open: "Mở",
    acknowledged: "Đã xem",
    resolved: "Xong",
    dismissed: "Bỏ qua"
  };
  return labels[status] ?? status;
}

function costStatusLabel(status: InventoryRecipeMenuItem["costStatus"]) {
  const labels: Record<InventoryRecipeMenuItem["costStatus"], string> = {
    healthy: "Margin tốt",
    watch: "Theo dõi cost",
    high: "Cost cao",
    critical: "Rủi ro margin"
  };
  return labels[status];
}

function costStatusTone(status: InventoryRecipeMenuItem["costStatus"]): "green" | "yellow" | "red" {
  if (status === "healthy") return "green";
  if (status === "watch") return "yellow";
  return "red";
}

function alertPriorityScore(alert: { severity: string; alertType: string; detectedAt: string }) {
  const severityScore: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const typeScore: Record<string, number> = {
    out_of_stock: 9,
    expired: 8,
    supplier_delay: 7,
    waste_spike: 6,
    abnormal_usage: 5,
    low_stock: 4,
    expiring_soon: 3,
    missing_inventory: 2,
    price_spike: 1,
    recipe_gap: 0
  };
  return (severityScore[alert.severity] ?? 0) * 100 + (typeScore[alert.alertType] ?? 0);
}

function locationLabel(ingredient: InventoryIngredient) {
  const parts = [ingredient.storageArea, ingredient.shelfCode].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Chưa định vị";
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const cleaned = value.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return 0;
  const lastSeparator = Math.max(cleaned.lastIndexOf(","), cleaned.lastIndexOf("."));
  if (lastSeparator > -1) {
    const integerPart = cleaned.slice(0, lastSeparator).replace(/[.,]/g, "");
    const decimalPart = cleaned.slice(lastSeparator + 1);
    const normalized = decimalPart.length === 3 && integerPart ? `${integerPart}${decimalPart}` : `${integerPart}.${decimalPart}`;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeUnit(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll("lít", "l")
    .replaceAll("lit", "l")
    .replaceAll("gói", "gói")
    .replaceAll("hộp", "hộp")
    .replaceAll("cai", "cái");
  const match = normalized.match(/\b(kg|g|gram|ml|l|chai|lon|gói|hộp|cái|thùng|bao|phần|suất|unit)\b/);
  return match?.[1] ?? (normalized.replace(/[^a-zA-Z0-9_%/ .-]/g, "").slice(0, 24) || "unit");
}

function pickText(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function rowFromObject(source: Record<string, unknown>): IntakeDraftRow | null {
  const name = pickText(source, ["name", "ten", "ingredient", "nguyenLieu", "nguyen_lieu"]);
  if (!name) return null;
  return {
    name,
    unit: normalizeUnit(pickText(source, ["unit", "donVi", "don_vi", "uom"]) || "unit"),
    quantity: parseNumber(source.quantity ?? source.qty ?? source.soLuong ?? source.so_luong ?? source.onHandQuantity),
    minimumQuantity: parseNumber(source.minimumQuantity ?? source.min ?? source.toiThieu ?? source.toi_thieu),
    referenceUnitCost: Math.round(parseNumber(source.referenceUnitCost ?? source.unitCost ?? source.giaVon ?? source.gia_von ?? source.cost)),
    categoryName: pickText(source, ["categoryName", "category", "nhom", "nhomHang", "nhom_hang"]) || undefined
  };
}

function parseTextLine(line: string): IntakeDraftRow | null {
  const cleaned = line.trim();
  if (!cleaned || /^(name|ten|nguyen|ingredient)[,\t|;]/i.test(cleaned)) return null;
  const parts = cleaned.split(/[,\t|;]/).map((part) => part.trim()).filter(Boolean);
  const numbers = cleaned.match(/\d[\d.,]*/g)?.map(parseNumber).filter((value) => value > 0) ?? [];
  const categoryMatch = cleaned.match(/(?:nhóm|nhom|category)\s*:?\s*([^,|;]+)/i);
  const unit = normalizeUnit(parts.find((part) => /\b(kg|g|gram|ml|l|lit|lít|chai|lon|goi|gói|hop|hộp|cai|cái)\b/i.test(part)) ?? cleaned);
  const name = (parts[0] ?? cleaned.replace(/\d[\d.,]*/g, "").trim()).replace(/(?:nhóm|nhom|category)\s*:?.*$/i, "").trim();
  if (!name || numbers.length === 0) return null;
  return {
    name,
    unit,
    quantity: numbers[0] ?? 0,
    minimumQuantity: /min|tối thiểu|toi thieu/i.test(cleaned) ? numbers[1] ?? 0 : 0,
    referenceUnitCost: Math.round(/giá|gia|cost|vnd|đ/i.test(cleaned) ? numbers[numbers.length - 1] ?? 0 : numbers[1] ?? 0),
    categoryName: categoryMatch?.[1]?.trim()
  };
}

function parseInventoryDraft(raw: string): IntakeDraftRow[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const rows = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { items?: unknown[] }).items)
        ? (parsed as { items: unknown[] }).items
        : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { rows?: unknown[] }).rows)
          ? (parsed as { rows: unknown[] }).rows
          : [];
    return rows
      .map((row) => (typeof row === "object" && row !== null ? rowFromObject(row as Record<string, unknown>) : null))
      .filter((row): row is IntakeDraftRow => Boolean(row));
  } catch {
    return trimmed
      .split(/\r?\n/)
      .map(parseTextLine)
      .filter((row): row is IntakeDraftRow => Boolean(row));
  }
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Không đọc được file ảnh nhập kho."));
    reader.readAsDataURL(file);
  });
}

export function InventoryWorkspaceV2({
  restaurantId,
  snapshot,
  categories,
  ingredients,
  recipeMenuItems,
  intelligence,
  warehouse
}: {
  restaurantId: string;
  snapshot: InventorySnapshot;
  categories: InventoryCategory[];
  ingredients: InventoryIngredient[];
  recipeMenuItems: InventoryRecipeMenuItem[];
  intelligence: InventoryIntelligence;
  warehouse: InventoryWarehouseCommandCenter;
}) {
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("intake");
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("text");
  const [rawIntake, setRawIntake] = useState("");
  const [draftRows, setDraftRows] = useState<IntakeDraftRow[]>([]);
  const [parserMessage, setParserMessage] = useState("0 dòng nháp.");
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [aiOcrLoading, setAiOcrLoading] = useState(false);
  const [aiOcrError, setAiOcrError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [showOperationalDetails, setShowOperationalDetails] = useState(false);
  const [showAdvancedInsights, setShowAdvancedInsights] = useState(false);
  const [isParsing, startTransition] = useTransition();
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("connecting");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(() => new Date());
  const [importState, importAction, importPending] = useActionState(importInventoryIntakeAction, undefined);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const watchedTables = [
      "ingredients",
      "ingredient_categories",
      "menu_item_recipes",
      "inventory_movements",
      "stock_balances",
      "inventory_batches",
      "inventory_alerts",
      "inventory_counts",
      "inventory_count_lines",
      "purchase_orders",
      "purchase_order_lines",
      "branch_transfers",
      "branch_transfer_lines",
      "suppliers"
    ];

    const scheduleRefresh = () => {
      setRealtimeState("connected");
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        startRefreshTransition(() => {
          router.refresh();
          setLastSyncedAt(new Date());
        });
      }, 320);
    };

    const channel = watchedTables.reduce(
      (currentChannel, table) =>
        currentChannel.on("postgres_changes", { event: "*", schema: "public", table, filter: `restaurant_id=eq.${restaurantId}` }, scheduleRefresh),
      supabase.channel(`inventory-workspace:${restaurantId}`)
    );

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setRealtimeState("connected");
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtimeState("error");
    });

    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, router]);

  useEffect(() => {
    if (importState?.success) toast.success(importState.success);
    if (importState?.error) toast.error(importState.error);
  }, [importState?.error, importState?.success, toast]);

  const refreshInventory = () => {
    startRefreshTransition(() => {
      router.refresh();
      setLastSyncedAt(new Date());
    });
  };

  const rowsJson = useMemo(() => JSON.stringify(draftRows), [draftRows]);
  const filteredIngredients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return ingredients;
    return ingredients.filter((ingredient) =>
      [ingredient.name, ingredient.categoryName, ingredient.storageArea, ingredient.shelfCode, ingredient.storageNote]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedQuery))
    );
  }, [ingredients, query]);
  const recipeBacklog = useMemo(() => recipeMenuItems.filter((item) => item.recipeLines.length === 0), [recipeMenuItems]);
  const costInsights = useMemo(() => {
    const recipeReadyItems = recipeMenuItems.filter((item) => item.recipeLines.length > 0);
    const riskyItems = recipeReadyItems
      .filter((item) => item.costStatus === "high" || item.costStatus === "critical")
      .sort((left, right) => right.recipeCostPercent - left.recipeCostPercent || right.totalRecipeCost - left.totalRecipeCost);
    const watchItems = recipeReadyItems.filter((item) => item.costStatus === "watch").length;
    const totalRecipeCost = recipeReadyItems.reduce((sum, item) => sum + item.totalRecipeCost, 0);
    const totalGrossProfit = recipeReadyItems.reduce((sum, item) => sum + item.grossProfit, 0);
    const averageCostPercent =
      recipeReadyItems.length > 0
        ? recipeReadyItems.reduce((sum, item) => sum + item.recipeCostPercent, 0) / recipeReadyItems.length
        : 0;

    return {
      recipeReadyCount: recipeReadyItems.length,
      riskyItems,
      watchItems,
      totalRecipeCost,
      totalGrossProfit,
      averageCostPercent
    };
  }, [recipeMenuItems]);
  const stockRiskInsights = useMemo(() => {
    const expiringRows = warehouse.stockBalances.filter((row) => {
      const days = daysUntilDate(row.expirationDate);
      return days !== null && days <= 7 && row.availableQuantity > 0;
    });
    const riskyRows = warehouse.stockBalances
      .filter((row) => row.status !== "available" || expiringRows.some((expiringRow) => expiringRow.id === row.id))
      .sort((left, right) => {
        const rank = { expired: 5, out_of_stock: 4, low: 3, pending_import: 2, available: 1 } satisfies Record<InventoryStockBalanceStatus, number>;
        return rank[right.status] - rank[left.status] || right.availableQuantity * right.referenceUnitCost - left.availableQuantity * left.referenceUnitCost;
      })
      .slice(0, 6);
    const lowOrOutRows = warehouse.stockBalances.filter((row) => row.status === "low" || row.status === "out_of_stock");
    const expiredRows = warehouse.stockBalances.filter((row) => row.status === "expired");
    const incomingRows = warehouse.stockBalances.filter((row) => row.incomingQuantity > 0);

    return {
      lowOrOutCount: lowOrOutRows.length,
      expiredCount: expiredRows.length,
      expiringCount: expiringRows.length,
      incomingCount: incomingRows.length,
      reservedValue: warehouse.stockBalances.reduce((sum, row) => sum + Math.round(row.reservedQuantity * row.referenceUnitCost), 0),
      incomingValue: incomingRows.reduce((sum, row) => sum + Math.round(row.incomingQuantity * row.referenceUnitCost), 0),
      riskValue: [...new Map([...lowOrOutRows, ...expiredRows, ...expiringRows].map((row) => [row.id, row])).values()].reduce(
        (sum, row) => sum + Math.round(Math.max(row.availableQuantity, row.onHandQuantity) * row.referenceUnitCost),
        0
      ),
      riskyRows
    };
  }, [warehouse.stockBalances]);
  const inventoryAnalytics = useMemo(
    () =>
      buildInventoryAnalytics({
        stockBalances: warehouse.stockBalances.map((row) => ({
          id: row.id,
          ingredientName: row.ingredientName,
          ingredientUnit: row.ingredientUnit,
          locationName: row.locationName,
          branchName: row.branchName,
          batchCode: row.batchCode,
          expirationDate: row.expirationDate,
          onHandQuantity: row.onHandQuantity,
          availableQuantity: row.availableQuantity,
          reservedQuantity: row.reservedQuantity,
          incomingQuantity: row.incomingQuantity,
          referenceUnitCost: row.referenceUnitCost,
          status: row.status
        })),
        purchaseOrders: warehouse.purchaseOrders.map((order) => ({
          id: order.id,
          status: order.status,
          supplierName: order.supplierName,
          totalAmount: order.totalAmount,
          expectedDeliveryAt: order.expectedDeliveryAt,
          lineCount: order.lineCount
        })),
        countSessions: warehouse.countSessions.map((session) => ({
          id: session.id,
          title: session.title,
          status: session.status,
          locationName: session.locationName,
          lineCount: session.lineCount,
          totalAbsVariance: session.totalAbsVariance,
          totalVarianceValue: session.totalVarianceValue
        })),
        recipeItems: recipeMenuItems.map((item) => ({
          id: item.id,
          name: item.name,
          categoryName: item.categoryName,
          price: item.price,
          recipeLineCount: item.recipeLines.length,
          recipeCostPercent: item.recipeCostPercent,
          grossProfit: item.grossProfit,
          grossMarginPercent: item.grossMarginPercent,
          costStatus: item.costStatus
        })),
        alerts: warehouse.alerts.map((alert) => ({
          id: alert.id,
          alertType: alert.alertType,
          severity: alert.severity,
          status: alert.status
        }))
      }),
    [recipeMenuItems, warehouse.alerts, warehouse.countSessions, warehouse.purchaseOrders, warehouse.stockBalances]
  );
  const purchasePlan = useMemo(
    () =>
      buildInventoryPurchasePlan({
        reorderSuggestions: intelligence.reorderSuggestions.map((item) => ({
          ingredientId: item.ingredientId,
          name: item.name,
          unit: item.unit,
          onHandQuantity: item.onHandQuantity,
          minimumQuantity: item.minimumQuantity,
          dailyUsage: item.dailyUsage,
          daysLeft: item.daysLeft,
          reorderQuantity: item.reorderQuantity,
          estimatedCost: item.estimatedCost,
          urgency: item.urgency
        })),
        suppliers: warehouse.suppliers.map((supplier) => ({
          id: supplier.id,
          name: supplier.name,
          defaultLeadDays: supplier.defaultLeadDays,
          isPreferred: supplier.isPreferred,
          productCount: supplier.productCount
        })),
        purchaseOrders: warehouse.purchaseOrders.map((order) => ({
          id: order.id,
          status: order.status,
          supplierName: order.supplierName,
          totalAmount: order.totalAmount,
          expectedDeliveryAt: order.expectedDeliveryAt,
          lineCount: order.lineCount
        }))
      }),
    [intelligence.reorderSuggestions, warehouse.purchaseOrders, warehouse.suppliers]
  );
  const auditReport = useMemo(
    () =>
      buildInventoryAuditReport({
        movements: snapshot.recentMovements.map((movement) => ({
          id: movement.id,
          movementType: movement.movementType,
          quantityDelta: movement.quantityDelta,
          unitCost: movement.unitCost,
          sourceType: movement.sourceType,
          reason: movement.reason,
          createdAt: movement.createdAt,
          ingredientName: movement.ingredientName,
          ingredientUnit: movement.ingredientUnit
        })),
        countSessions: warehouse.countSessions.map((session) => ({
          id: session.id,
          title: session.title,
          status: session.status,
          locationName: session.locationName,
          lineCount: session.lineCount,
          adjustedLineCount: session.adjustedLineCount,
          totalAbsVariance: session.totalAbsVariance,
          totalVarianceValue: session.totalVarianceValue
        })),
        alerts: warehouse.alerts.map((alert) => ({
          id: alert.id,
          alertType: alert.alertType,
          severity: alert.severity,
          status: alert.status,
          title: alert.title
        }))
      }),
    [snapshot.recentMovements, warehouse.alerts, warehouse.countSessions]
  );
  const branchBalancingReport = useMemo(
    () =>
      buildInventoryBranchBalancingReport({
        locations: warehouse.locations.map((location) => ({
          id: location.id,
          branchName: location.branchName,
          name: location.name,
          locationType: location.locationType,
          isPrimary: location.isPrimary
        })),
        stockBalances: warehouse.stockBalances.map((row) => ({
          id: row.id,
          ingredientId: row.ingredientId,
          ingredientName: row.ingredientName,
          ingredientUnit: row.ingredientUnit,
          locationId: row.locationId,
          branchName: row.branchName,
          locationName: row.locationName,
          batchCode: row.batchCode,
          expirationDate: row.expirationDate,
          availableQuantity: row.availableQuantity,
          reservedQuantity: row.reservedQuantity,
          incomingQuantity: row.incomingQuantity,
          minimumQuantity: row.minimumQuantity,
          referenceUnitCost: row.referenceUnitCost,
          status: row.status
        })),
        transfers: warehouse.transfers.map((transfer) => ({
          id: transfer.id,
          status: transfer.status,
          fromLocationId: transfer.fromLocationId,
          toLocationId: transfer.toLocationId,
          lineCount: transfer.lineCount,
          totalQuantity: transfer.totalQuantity
        }))
      }),
    [warehouse.locations, warehouse.stockBalances, warehouse.transfers]
  );
  const reorderSuggestions = intelligence.reorderSuggestions.slice(0, 6);
  const urgentActions = intelligence.actionQueue.slice(0, 3);
  const importTotalValue = draftRows.reduce((total, row) => total + row.quantity * row.referenceUnitCost, 0);
  const activeWorkbenchGroup = workbenchNavGroups.find((group) => group.tabs.some((item) => item.tab === activeTab)) ?? defaultWorkbenchNavGroup;
  const controlSignalCount =
    reorderSuggestions.length +
    costInsights.riskyItems.length +
    inventoryAnalytics.actionQueue.length +
    auditReport.riskyMovements.length +
    branchBalancingReport.transferSuggestions.length;
  const stockSignalCount = stockRiskInsights.lowOrOutCount + stockRiskInsights.expiredCount + stockRiskInsights.expiringCount + warehouse.openAlertCount;
  const operationalSignalCount = urgentActions.length + stockSignalCount + controlSignalCount;
  const quickActions: InventoryQuickAction[] = [
    {
      label: "Nhập kho",
      value: `${draftRows.length.toLocaleString("vi-VN")} dòng nháp`,
      icon: PackagePlus,
      tone: draftRows.length > 0 ? "green" : "blue",
      onClick: () => setActiveTab("intake")
    },
    {
      label: "Thêm nguyên liệu",
      value: `${ingredients.length.toLocaleString("vi-VN")} đang dùng`,
      icon: Boxes,
      tone: "green",
      onClick: () => setDrawer({ mode: "create" })
    },
    {
      label: "Kiểm kê",
      value: `${warehouse.countSessionCount.toLocaleString("vi-VN")} phiên`,
      icon: ClipboardList,
      tone: warehouse.countSessionCount > 0 ? "blue" : "green",
      onClick: () => setActiveTab("counting")
    },
    {
      label: "Đặt hàng",
      value: `${intelligence.reorderSuggestions.length.toLocaleString("vi-VN")} gợi ý`,
      icon: Truck,
      tone: intelligence.reorderSuggestions.length > 0 ? "yellow" : "green",
      onClick: () => setActiveTab("purchasing")
    },
    {
      label: "Điều chuyển",
      value: `${warehouse.transferCount.toLocaleString("vi-VN")} phiếu`,
      icon: ArrowDownUp,
      tone: warehouse.transferCount > 0 ? "blue" : "green",
      onClick: () => setActiveTab("transfers")
    },
    {
      label: "Cảnh báo",
      value: `${warehouse.openAlertCount.toLocaleString("vi-VN")} mở`,
      icon: Bell,
      tone: warehouse.openAlertCount > 0 ? "red" : "green",
      onClick: () => setActiveTab("alerts")
    }
  ];
  const healthSegments = [
    {
      label: "An toàn",
      count: Math.max(0, snapshot.activeIngredientCount - intelligence.reorderSuggestions.length),
      percent: snapshot.activeIngredientCount > 0 ? ((snapshot.activeIngredientCount - intelligence.reorderSuggestions.length) / snapshot.activeIngredientCount) * 100 : 100,
      tone: "green" as const
    },
    {
      label: "Sắp chạm ngưỡng",
      count: intelligence.reorderSuggestions.filter((item) => item.urgency === "medium").length,
      percent: snapshot.activeIngredientCount > 0 ? (intelligence.reorderSuggestions.filter((item) => item.urgency === "medium").length / snapshot.activeIngredientCount) * 100 : 0,
      tone: "yellow" as const
    },
    {
      label: "Cần mua",
      count: intelligence.reorderSuggestions.filter((item) => item.urgency === "high").length,
      percent: snapshot.activeIngredientCount > 0 ? (intelligence.reorderSuggestions.filter((item) => item.urgency === "high").length / snapshot.activeIngredientCount) * 100 : 0,
      tone: "red" as const
    },
    {
      label: "Chưa có định mức",
      count: recipeBacklog.length,
      percent: snapshot.menuItemCount > 0 ? (recipeBacklog.length / snapshot.menuItemCount) * 100 : 0,
      tone: "blue" as const
    }
  ];

  const runParser = (value = rawIntake) => {
    startTransition(() => {
      const rows = parseInventoryDraft(value);
      setDraftRows(rows);
      setParserMessage(
        rows.length > 0
          ? `Đã nhận diện ${rows.length} dòng nhập kho. Kiểm tra bảng nháp rồi xác nhận nhập.`
          : "Chưa nhận diện được dòng hợp lệ. Hãy nhập mỗi nguyên liệu một dòng hoặc dùng JSON/CSV rõ cột."
      );
    });
  };

  const runInventoryAiOcr = async ({ imageFile, rawText }: { imageFile?: File; rawText?: string }) => {
    const trimmedText = rawText?.trim();
    if (!imageFile && !trimmedText) {
      setParserMessage("Hãy dán nội dung thật hoặc tải ảnh hóa đơn trước khi gọi AI đọc nâng cao.");
      return;
    }
    setAiOcrLoading(true);
    setAiOcrError(null);
    setParserMessage(imageFile ? "AI đang đọc ảnh hóa đơn..." : "AI đang phân tích nội dung nhập kho...");

    try {
      const imageBase64 = imageFile ? await fileToBase64(imageFile) : undefined;
      const response = await fetch("/api/admin/ai/inventory-ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64, rawText: trimmedText || undefined })
      });
      const result = (await response.json().catch(() => null)) as ApiResponse<InventoryOcrResponse> | null;
      if (!result || !result.ok) throw new Error(result?.error || "AI chưa đọc được dữ liệu nhập kho.");
      const rows = result.data.data?.rows?.map((row) => ({ ...row, categoryName: row.categoryName || undefined })) ?? [];
      setDraftRows(rows);
      setRawIntake(
        imageFile
          ? rows.map((row) => `${row.name}, ${row.unit}, ${row.quantity}, min ${row.minimumQuantity}, giá ${row.referenceUnitCost}, nhóm ${row.categoryName || ""}`).join("\n")
          : trimmedText || ""
      );
      setParserMessage(result.data.text || `AI đã nhận diện ${rows.length} dòng nhập kho.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không đọc được nhập kho bằng AI.";
      setAiOcrError(message);
      setParserMessage(message);
    } finally {
      setAiOcrLoading(false);
    }
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIntakeMode(file.type.startsWith("image/") ? "ocr" : "file");
    if (file.type.startsWith("image/")) {
      await runInventoryAiOcr({ imageFile: file });
      return;
    }
    const content = await file.text();
    setRawIntake(content);
    runParser(content);
  };

  const startVoiceInput = () => {
    if (typeof window === "undefined") return;
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setParserMessage("Trình duyệt này chưa hỗ trợ nhập giọng nói. Bạn vẫn có thể dán text hoặc tải file.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "vi-VN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim();
      const nextValue = `${rawIntake}\n${transcript}`.trim();
      setRawIntake(nextValue);
      runParser(nextValue);
    };
    recognition.onerror = () => setParserMessage("Không nghe được rõ. Thử nói từng dòng: tên, đơn vị, số lượng, giá.");
    recognition.onend = () => setIsListening(false);
    setIsListening(true);
    recognition.start();
  };

  if (!snapshot.schemaReady) {
    return (
      <section className="rounded-3xl border border-yellow-200 bg-yellow-50 p-6">
        <Badge tone="yellow">Inventory schema</Badge>
        <h1 className="mt-3 text-2xl font-bold text-[var(--foreground)]">Kho hàng chưa sẵn sàng để vận hành.</h1>
        <p className="mt-2 text-sm font-medium text-[var(--muted-foreground)]">Cần chạy migration inventory trước khi bật quản lý kho.</p>
      </section>
    );
  }

  return (
    <div className="inventory-redesign dashboard-operations-stack space-y-5">
      <InventoryPageHeader
        query={query}
        onQueryChange={setQuery}
        realtimeState={realtimeState}
        lastSyncedAt={lastSyncedAt}
        isRefreshing={isRefreshing}
        onRefresh={refreshInventory}
        actions={quickActions}
      />

      <section className="inventory-summary-grid grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={PackageCheck}
          label="Tồn khả dụng"
          value={formatVnd(inventoryAnalytics.workingCapital.availableValue)}
          caption="Có thể dùng ngay theo tồn hiện tại."
          tone="green"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Rủi ro tồn"
          value={stockRiskInsights.riskyRows.length.toLocaleString("vi-VN")}
          caption={`${formatVnd(stockRiskInsights.riskValue)} cần theo dõi.`}
          tone={stockRiskInsights.riskyRows.length > 0 ? "yellow" : "green"}
        />
        <SummaryCard
          icon={Bell}
          label="Cảnh báo mở"
          value={warehouse.openAlertCount.toLocaleString("vi-VN")}
          caption={`${snapshot.lowStockCount.toLocaleString("vi-VN")} SKU thấp/hết.`}
          tone={warehouse.openAlertCount > 0 ? "red" : "green"}
        />
        <SummaryCard
          icon={Truck}
          label="Đang mua / về"
          value={`${warehouse.openPurchaseOrderCount.toLocaleString("vi-VN")} / ${stockRiskInsights.incomingCount.toLocaleString("vi-VN")}`}
          caption="PO mở / dòng incoming."
          tone={warehouse.openPurchaseOrderCount > 0 || stockRiskInsights.incomingCount > 0 ? "blue" : "green"}
        />
      </section>

      <section className="dashboard-workbench-surface rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
        <div className="dashboard-segmented-scroll flex flex-nowrap gap-2 overflow-x-auto border-b border-[var(--border)] pb-3" role="tablist" aria-label="Nhóm nghiệp vụ kho">
          {workbenchNavGroups.map((group) => (
            <WorkbenchButton
              key={group.id}
              active={group.id === activeWorkbenchGroup.id}
              icon={group.icon}
              label={group.label}
              tabId={`inventory-tab-${group.id}`}
              panelId="inventory-workbench-panel"
              onClick={() => setActiveTab(group.primaryTab)}
            />
          ))}
        </div>

        {activeWorkbenchGroup.tabs.length > 1 ? (
          <div className="dashboard-segmented-scroll mt-3 flex flex-nowrap gap-2 overflow-x-auto rounded-2xl bg-[var(--soft-surface)] p-2" role="tablist" aria-label={`${activeWorkbenchGroup.label} chi tiết`}>
            {activeWorkbenchGroup.tabs.map((item) => (
              <WorkbenchSubnavButton
                key={item.tab}
                active={activeTab === item.tab}
                icon={item.icon}
                label={item.label}
                tabId={`inventory-tab-${item.tab}`}
                panelId="inventory-workbench-panel"
                onClick={() => setActiveTab(item.tab)}
              />
            ))}
          </div>
        ) : null}

        <div id="inventory-workbench-panel" role="tabpanel" aria-live="polite" className="pt-4">
          {activeTab === "intake" ? (
            <AiInventoryIntake
              fileInputRef={fileInputRef}
              intakeMode={intakeMode}
              setIntakeMode={setIntakeMode}
              rawIntake={rawIntake}
              setRawIntake={setRawIntake}
              draftRows={draftRows}
              parserMessage={parserMessage}
              aiOcrError={aiOcrError}
              aiOcrLoading={aiOcrLoading}
              isListening={isListening}
              isParsing={isParsing}
              importTotalValue={importTotalValue}
              rowsJson={rowsJson}
              importAction={importAction}
              importPending={importPending}
              importState={importState}
              onParse={() => runParser()}
              onFileUpload={handleFileUpload}
              onAdvancedRead={() => runInventoryAiOcr({ rawText: rawIntake })}
              onVoice={startVoiceInput}
            />
          ) : null}

          {activeTab === "ingredients" ? (
            <IngredientTable
              ingredients={filteredIngredients}
              categories={categories}
              query={query}
              onQueryChange={setQuery}
              onCreate={() => setDrawer({ mode: "create" })}
              onEdit={(ingredient) => setDrawer({ mode: "edit", ingredient })}
            />
          ) : null}

          {activeTab === "stock" ? <WarehouseStockBoard warehouse={warehouse} ingredients={ingredients} /> : null}

          {activeTab === "waste" ? <WasteExpirationDesk warehouse={warehouse} ingredients={ingredients} intelligence={intelligence} /> : null}

          {activeTab === "counting" ? <InventoryCountingDesk warehouse={warehouse} ingredients={ingredients} /> : null}

          {activeTab === "transfers" ? <InventoryTransferDesk warehouse={warehouse} ingredients={ingredients} /> : null}

          {activeTab === "balancing" ? <BranchBalancingDesk report={branchBalancingReport} /> : null}

          {activeTab === "purchasing" ? <SupplierPurchaseDesk warehouse={warehouse} ingredients={ingredients} purchasePlan={purchasePlan} /> : null}

          {activeTab === "recipes" ? (
            <RecipesAndCategories categories={categories} ingredients={ingredients} recipeMenuItems={recipeMenuItems} recipeBacklog={recipeBacklog} />
          ) : null}

          {activeTab === "alerts" ? <InventoryAlertDesk warehouse={warehouse} /> : null}

          {activeTab === "analytics" ? <InventoryAnalyticsDesk analytics={inventoryAnalytics} /> : null}

          {activeTab === "audit" ? <InventoryAuditDesk report={auditReport} snapshot={snapshot} /> : null}

          {activeTab === "ledger" ? <InventoryLedger snapshot={snapshot} /> : null}
        </div>
      </section>

      <InventoryOperationalDetails
        open={showOperationalDetails}
        onToggle={() => setShowOperationalDetails((current) => !current)}
        signalCount={operationalSignalCount}
        urgentCount={urgentActions.length}
        stockSignalCount={stockSignalCount}
        controlSignalCount={controlSignalCount}
      >
        <WarehouseOperationsStrip warehouse={warehouse} />

        <StockRiskCockpit insights={stockRiskInsights} />

        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="dashboard-eyebrow">Ưu tiên hành động hôm nay</p>
                <h2 className="dashboard-section-title mt-1">Hành động hôm nay</h2>
              </div>
              <Badge tone={urgentActions.length > 0 ? "yellow" : "green"}>{urgentActions.length} việc cần xử lý</Badge>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {urgentActions.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="Không có việc gấp" description="Kho đang ổn, không có cảnh báo cần xử lý ngay." />
              ) : (
                urgentActions.map((item) => (
                  <ActionCard key={item.id} priority={item.priority} title={item.title} detail={item.detail} value={item.valueLabel} />
                ))
              )}
            </div>
          </div>
          <InventoryHealthBreakdown segments={healthSegments} />
        </section>

        <InventoryAdvancedInsightsHub
          open={showAdvancedInsights}
          onToggle={() => setShowAdvancedInsights((current) => !current)}
          reorderSuggestions={reorderSuggestions}
          ingredients={ingredients}
          costInsights={costInsights}
          recipeBacklog={recipeBacklog}
          inventoryAnalytics={inventoryAnalytics}
          auditReport={auditReport}
          branchBalancingReport={branchBalancingReport}
          purchasePlan={purchasePlan}
          stockRiskInsights={stockRiskInsights}
        />
      </InventoryOperationalDetails>

      {drawer ? <IngredientDrawer drawer={drawer} categories={categories} onClose={() => setDrawer(null)} /> : null}
    </div>
  );
}

function InventoryPageHeader({
  query,
  onQueryChange,
  realtimeState,
  lastSyncedAt,
  isRefreshing,
  onRefresh,
  actions
}: {
  query: string;
  onQueryChange: (value: string) => void;
  realtimeState: RealtimeState;
  lastSyncedAt: Date | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  actions: InventoryQuickAction[];
}) {
  return (
    <section className="inventory-page-header rounded-3xl border border-[var(--border)] bg-[linear-gradient(135deg,#fffaf2_0%,#f7fbf6_54%,#eef6ff_100%)] p-4 shadow-[0_18px_60px_rgba(15,77,58,0.06)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="dashboard-page-title">Kho hàng</h1>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-white/80 px-3 py-2 text-xs font-black text-[var(--muted-foreground)] shadow-sm">
            <Badge tone={realtimeTone(realtimeState)}>
              <span className="inline-flex items-center gap-1.5">
                <RadioTower className="h-3.5 w-3.5" />
                {realtimeLabel(realtimeState)}
              </span>
            </Badge>
            <span>Sync {formatSyncClock(lastSyncedAt)}</span>
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="inline-grid h-12 w-12 place-items-center rounded-xl text-[var(--primary)] transition hover:bg-[var(--primary-soft)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
              aria-label="Làm mới kho"
              title="Làm mới kho"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
          <label className="relative min-w-0 sm:w-96">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              aria-label="Tìm nguyên liệu, nhóm hoặc vị trí kho"
              className="h-12 rounded-2xl bg-white pl-9"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Tìm nguyên liệu, nhóm, vị trí..."
            />
          </label>
        </div>
      </div>
      <div className="dashboard-segmented-scroll mt-4 flex flex-nowrap gap-2 overflow-x-auto" role="toolbar" aria-label="Lệnh nhanh kho">
        {actions.map((action) => {
          const Icon = action.icon;

          return (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={`inline-flex h-12 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${quickActionToneClass(action.tone)}`}
            >
              <Icon className="h-4 w-4" />
              <span>{action.label}</span>
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-black opacity-80">{action.value}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SubmitButton({ children, disabled, pendingLabel = "Đang xử lý...", ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending ? (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  caption,
  tone,
  circularScore
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  caption: string;
  tone: "green" | "yellow" | "red" | "blue";
  circularScore?: number;
}) {
  const colorClass =
    tone === "green" ? "text-emerald-700 bg-emerald-50" : tone === "yellow" ? "text-amber-700 bg-amber-50" : tone === "red" ? "text-red-700 bg-red-50" : "text-blue-700 bg-blue-50";
  return (
    <article className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-2xl ${colorClass}`}>
          <Icon className="h-5 w-5" />
        </span>
        {typeof circularScore === "number" ? <ScoreRing score={circularScore} /> : null}
      </div>
      <p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-[var(--muted-foreground)]">{label}</p>
      <p className="metric-number mt-1 text-2xl font-black text-[var(--foreground)]">{value}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--muted-foreground)]">{caption}</p>
    </article>
  );
}

function ScoreRing({ score }: { score: number }) {
  return (
    <div
      className="grid h-14 w-14 place-items-center rounded-full"
      style={{ background: `conic-gradient(#10b981 ${Math.max(0, Math.min(100, score))}%, #e5e7eb 0)` }}
    >
      <div className="grid h-10 w-10 place-items-center rounded-full bg-white text-[11px] font-black text-emerald-700">{score}</div>
    </div>
  );
}

function InventoryOperationalDetails({
  open,
  onToggle,
  signalCount,
  urgentCount,
  stockSignalCount,
  controlSignalCount,
  children
}: {
  open: boolean;
  onToggle: () => void;
  signalCount: number;
  urgentCount: number;
  stockSignalCount: number;
  controlSignalCount: number;
  children: ReactNode;
}) {
  const detailsId = "inventory-operational-details";

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="dashboard-eyebrow">Chi tiết quản trị</p>
          <h2 className="dashboard-section-title mt-1">Tín hiệu ẩn</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={signalCount > 0 ? "yellow" : "green"}>{signalCount.toLocaleString("vi-VN")} tín hiệu</Badge>
          <Badge tone={urgentCount > 0 ? "red" : "green"}>{urgentCount.toLocaleString("vi-VN")} việc gấp</Badge>
          <Badge tone={stockSignalCount > 0 ? "yellow" : "green"}>{stockSignalCount.toLocaleString("vi-VN")} tồn kho</Badge>
          <Badge tone={controlSignalCount > 0 ? "blue" : "green"}>{controlSignalCount.toLocaleString("vi-VN")} kiểm soát</Badge>
          <Button type="button" variant={open ? "primary" : "secondary"} onClick={onToggle} aria-expanded={open} aria-controls={detailsId} className="h-12 rounded-2xl">
            {open ? <X className="h-4 w-4" /> : <Layers3 className="h-4 w-4" />}
            {open ? "Thu gọn" : "Mở chi tiết"}
          </Button>
        </div>
      </div>
      {open ? <div id={detailsId} className="mt-4 grid gap-4">{children}</div> : null}
    </section>
  );
}

function InventoryAdvancedInsightsHub({
  open,
  onToggle,
  reorderSuggestions,
  ingredients,
  costInsights,
  recipeBacklog,
  inventoryAnalytics,
  auditReport,
  branchBalancingReport,
  purchasePlan,
  stockRiskInsights
}: {
  open: boolean;
  onToggle: () => void;
  reorderSuggestions: InventoryIntelligence["reorderSuggestions"];
  ingredients: InventoryIngredient[];
  costInsights: InventoryCostInsights;
  recipeBacklog: InventoryRecipeMenuItem[];
  inventoryAnalytics: InventoryAnalytics;
  auditReport: InventoryAuditReport;
  branchBalancingReport: InventoryBranchBalancingReport;
  purchasePlan: InventoryPurchasePlan;
  stockRiskInsights: InventoryStockRiskInsights;
}) {
  const insightsId = "inventory-advanced-insights";
  const insightCount =
    reorderSuggestions.length +
    costInsights.riskyItems.length +
    inventoryAnalytics.actionQueue.length +
    auditReport.riskyMovements.length +
    branchBalancingReport.transferSuggestions.length;

  return (
    <>
      <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="dashboard-eyebrow">Phân tích nâng cao</p>
            <h2 className="dashboard-section-title mt-1">Tín hiệu kiểm soát</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={insightCount > 0 ? "yellow" : "green"}>{insightCount.toLocaleString("vi-VN")} tín hiệu</Badge>
            <Button type="button" variant={open ? "primary" : "secondary"} onClick={onToggle} aria-expanded={open} aria-controls={insightsId} className="h-12 rounded-2xl">
              {open ? <X className="h-4 w-4" /> : <Layers3 className="h-4 w-4" />}
              {open ? "Thu gọn" : "Mở phân tích"}
            </Button>
          </div>
        </div>
      </section>

      {open ? (
        <div id={insightsId} className="grid gap-5">
          <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="dashboard-eyebrow">Gợi ý đặt hàng</p>
                <h2 className="dashboard-section-title mt-1">Bảng gợi ý đặt hàng thông minh</h2>
              </div>
              <Badge tone={reorderSuggestions.length > 0 ? "yellow" : "green"}>{reorderSuggestions.length} SKU</Badge>
            </div>
            <SmartReorderTable suggestions={reorderSuggestions} ingredients={ingredients} />
          </section>

          <CostControlPanel insights={costInsights} recipeBacklog={recipeBacklog} />
          <InventoryAnalyticsCommandCenter analytics={inventoryAnalytics} />
          <AuditControlPanel report={auditReport} />
          <BranchBalancingCommandCenter report={branchBalancingReport} />
          <InventoryCloseControlCenter
            analytics={inventoryAnalytics}
            auditReport={auditReport}
            purchasePlan={purchasePlan}
            stockRiskInsights={stockRiskInsights}
          />
        </div>
      ) : null}
    </>
  );
}

function WarehouseOperationsStrip({ warehouse }: { warehouse: InventoryWarehouseCommandCenter }) {
  const tiles: Array<{ icon: LucideIcon; label: string; value: number; tone: "green" | "yellow" | "blue" | "red" }> = [
    { icon: Warehouse, label: "Vị trí kho", value: warehouse.schemaReady ? warehouse.locationCount : 0, tone: "blue" as const },
    { icon: Building2, label: "Nhà cung cấp", value: warehouse.schemaReady ? warehouse.supplierCount : 0, tone: "green" as const },
    { icon: ClipboardList, label: "PO mở", value: warehouse.schemaReady ? warehouse.openPurchaseOrderCount : 0, tone: warehouse.openPurchaseOrderCount > 0 ? "yellow" : "green" },
    { icon: ClipboardCheck, label: "Kiểm kê", value: warehouse.schemaReady ? warehouse.countSessionCount : 0, tone: warehouse.countSessionCount > 0 ? "blue" : "green" },
    { icon: GitBranch, label: "Điều chuyển", value: warehouse.schemaReady ? warehouse.transferCount : 0, tone: warehouse.transferCount > 0 ? "blue" : "green" },
    { icon: CalendarClock, label: "Lô sắp hết hạn", value: warehouse.schemaReady ? warehouse.expiringBatchCount : 0, tone: warehouse.expiringBatchCount > 0 ? "red" : "green" },
    { icon: Bell, label: "Alert mở", value: warehouse.schemaReady ? warehouse.openAlertCount : 0, tone: warehouse.openAlertCount > 0 ? "red" : "green" }
  ];

  return (
    <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
      {tiles.map((tile) => (
        <article key={tile.label} className="rounded-2xl border border-[var(--border)] bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
              <tile.icon className="h-4 w-4" />
            </span>
            <Badge tone={warehouse.schemaReady ? tile.tone : "neutral"}>{warehouse.schemaReady ? "V2" : "Chưa chạy"}</Badge>
          </div>
          <p className="metric-number mt-3 text-xl font-black text-[var(--foreground)]">{tile.value.toLocaleString("vi-VN")}</p>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{tile.label}</p>
        </article>
      ))}
    </section>
  );
}

function ActionCard({ priority, title, detail, value }: { priority: InventoryActionPriority; title: string; detail: string; value: string }) {
  const urgent = priority === "high";
  return (
    <article className={`rounded-3xl border p-4 ${urgent ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-12 w-12 place-items-center rounded-2xl ${urgent ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
          <AlertTriangle className="h-5 w-5" />
        </span>
        <Badge tone={priorityTone(priority)}>{priorityText(priority)}</Badge>
      </div>
      <h3 className="mt-3 text-lg font-black text-[var(--foreground)]">{title}</h3>
      <p className="mt-1 line-clamp-2 text-sm font-semibold text-[var(--muted-foreground)]">{detail}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="metric-number font-black text-[var(--foreground)]">{value}</span>
        <div className="flex gap-2">
          <Button type="button" size="sm" className="rounded-xl">Tạo đơn mua</Button>
          <Button type="button" size="sm" variant="ghost" className="rounded-xl">Chi tiết</Button>
        </div>
      </div>
    </article>
  );
}

function InventoryAnalyticsCommandCenter({ analytics }: { analytics: InventoryAnalytics }) {
  const riskTone = analytics.riskScore >= 80 ? "green" : analytics.riskScore >= 60 ? "yellow" : "red";

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Inventory analytics</p>
          <h2 className="mt-1 text-xl font-black text-[var(--foreground)]">Kho hôm nay</h2>
        </div>
        <Badge tone={riskTone}>Risk score {analytics.riskScore}/100</Badge>
      </div>
      <div className="grid gap-3 xl:grid-cols-[0.86fr_1.14fr]">
        <div className="grid gap-2 sm:grid-cols-2">
          <MiniMetric label="Tồn khả dụng" value={formatVnd(analytics.workingCapital.availableValue)} />
          <MiniMetric label="Rủi ro tồn" value={formatVnd(analytics.workingCapital.riskValue)} />
          <MiniMetric label="PO đang mở" value={formatVnd(analytics.purchasing.openPurchaseValue)} />
          <MiniMetric label="Lệch kiểm kê" value={formatVnd(analytics.counting.varianceValue)} />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {analytics.actionQueue.length === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 md:col-span-3">
              <p className="font-black text-emerald-800">Không có action analytics khẩn</p>
              <p className="mt-1 text-sm font-semibold text-emerald-700">Kho đang có dữ liệu vận hành ổn, tiếp tục theo dõi realtime và chốt định mức mới.</p>
            </div>
          ) : (
            analytics.actionQueue.slice(0, 3).map((item) => (
              <article key={item.id} className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-black text-[var(--foreground)]">{item.title}</p>
                  <Badge tone={item.severity}>{item.value}</Badge>
                </div>
                <p className="mt-2 text-xs font-bold text-[var(--muted-foreground)]">{item.detail}</p>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function AuditControlPanelMobileDraft({ report }: { report: InventoryAuditReport }) {
  const scoreTone = auditScoreTone(report.auditScore);
  const hasAuditRisk = report.lossValue > 0 || report.unreasonedMovementCount > 0 || report.openControlAlertCount > 0 || report.countVarianceValue > 0;

  return (
    <section className="grid gap-4 xl:grid-cols-[0.74fr_1.26fr]">
      <div className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Audit control</p>
            <h2 className="mt-1 text-xl font-black text-[var(--foreground)]">Chống thất thoát realtime</h2>
          </div>
          <Badge tone={scoreTone}>Audit {report.auditScore}/100</Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <MiniMetric label="Loss gần đây" value={formatVnd(report.lossValue)} />
          <MiniMetric label="Điều chỉnh tay" value={formatVnd(report.manualAdjustmentValue)} />
          <MiniMetric label="Lệch kiểm kê" value={formatVnd(report.countVarianceValue)} />
          <MiniMetric label="Movement thiếu lý do" value={report.unreasonedMovementCount.toLocaleString("vi-VN")} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-black text-red-800">
            <TrendingDown className="mb-1 h-4 w-4" />
            {report.lossMovementCount.toLocaleString("vi-VN")} dòng xuất giảm
          </div>
          <div className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-black text-amber-800">
            <AlertTriangle className="mb-1 h-4 w-4" />
            {report.openControlAlertCount.toLocaleString("vi-VN")} alert kiểm soát
          </div>
          <div className="rounded-2xl bg-blue-50 px-3 py-2 text-sm font-black text-blue-800">
            <ReceiptText className="mb-1 h-4 w-4" />
            {report.movementCount.toLocaleString("vi-VN")} movement
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Loss radar</p>
            <h2 className="mt-1 text-xl font-black text-[var(--foreground)]">Nguyên liệu thất thoát nổi bật</h2>
          </div>
          <Badge tone={hasAuditRisk ? "yellow" : "green"}>{report.topLossItems.length} SKU</Badge>
        </div>
        {report.topLossItems.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="Chưa có loss nổi bật" description="Các movement gần đây chưa tạo tín hiệu thất thoát cần xử lý ngay." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {report.topLossItems.slice(0, 4).map((item) => (
              <article key={item.ingredientName} className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-black text-[var(--foreground)]">{item.ingredientName}</p>
                    <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">
                      {formatQuantity(item.quantity, item.ingredientUnit)} qua {item.movementCount.toLocaleString("vi-VN")} movement
                    </p>
                  </div>
                  <Badge tone={item.value >= 300000 ? "red" : "yellow"}>{formatVnd(item.value)}</Badge>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function InventoryAuditDeskMobileDraft({ report, snapshot }: { report: InventoryAuditReport; snapshot: InventorySnapshot }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
      <div className="grid gap-4">
        <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Control score</p>
              <h2 className="mt-1 text-xl font-black">Điểm kiểm soát kho</h2>
            </div>
            <Badge tone={auditScoreTone(report.auditScore)}>{report.auditScore}/100</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <MiniMetric label="Loss value" value={formatVnd(report.lossValue)} />
            <MiniMetric label="Rollback value" value={formatVnd(report.rollbackValue)} />
            <MiniMetric label="Manual adjust" value={formatVnd(report.manualAdjustmentValue)} />
            <MiniMetric label="Count variance" value={formatVnd(report.countVarianceValue)} />
          </div>
        </section>

        <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Control checklist</p>
              <h2 className="mt-1 text-xl font-black">Việc cần khóa rủi ro</h2>
            </div>
            <Badge tone={report.controls.some((control) => control.severity === "red") ? "red" : report.controls.some((control) => control.severity === "yellow") ? "yellow" : "green"}>
              {report.controls.length} control
            </Badge>
          </div>
          <div className="grid gap-2">
            {report.controls.map((control) => (
              <article key={control.id} className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-[var(--foreground)]">{control.title}</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--muted-foreground)]">{control.detail}</p>
                  </div>
                  <Badge tone={auditSeverityTone(control.severity)}>{control.severity === "green" ? "OK" : "Rà soát"}</Badge>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-4">
        <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Risky movements</p>
              <h2 className="mt-1 text-xl font-black">Movement cần kiểm tra</h2>
            </div>
            <Badge tone={report.riskyMovements.length > 0 ? "yellow" : "green"}>{report.riskyMovements.length} dòng</Badge>
          </div>
          {report.riskyMovements.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Movement rõ lý do" description="Chưa có movement thất thoát hoặc điều chỉnh thủ công cần rà lại." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
              <div className="hidden grid-cols-[0.8fr_1fr_0.72fr_0.56fr] bg-[var(--surface-container-high)] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)] md:grid">
                <span>Thời gian</span>
                <span>Movement</span>
                <span>Giá trị</span>
                <span>Mức</span>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {report.riskyMovements.map((movement) => (
                  <div key={movement.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[0.8fr_1fr_0.72fr_0.56fr] md:items-center">
                    <span className="font-semibold text-[var(--muted-foreground)]">{formatDateTime(movement.createdAt)}</span>
                    <div className="min-w-0">
                      <p className="truncate font-black text-[var(--foreground)]">{movement.title}</p>
                      <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">{movement.detail}</p>
                    </div>
                    <span className="metric-number font-black text-[var(--foreground)]">{formatVnd(movement.value)}</span>
                    <Badge tone={movement.severity}>{movement.severity === "red" ? "Cao" : movement.severity === "yellow" ? "Vừa" : "Thiếu note"}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Ledger sample</p>
              <h2 className="mt-1 text-xl font-black">Nhật ký gần đây để đối soát</h2>
            </div>
            <Badge tone={snapshot.recentMovements.length > 0 ? "blue" : "green"}>{snapshot.recentMovements.length} dòng</Badge>
          </div>
          <div className="grid gap-2">
            {snapshot.recentMovements.length === 0 ? (
              <p className="rounded-2xl bg-[var(--soft-surface)] px-3 py-3 text-sm font-bold text-[var(--muted-foreground)]">Chưa có movement gần đây.</p>
            ) : (
              snapshot.recentMovements.slice(0, 6).map((movement) => (
                <div key={movement.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border)] px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[var(--foreground)]">{movement.ingredientName}</p>
                    <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">{formatDateTime(movement.createdAt)} · {movement.reason || movement.sourceType || "Chưa có lý do"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={movementTone(movement.movementType)}>{movementLabel(movement.movementType)}</Badge>
                    <span className={`metric-number text-sm font-black ${movement.quantityDelta >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                      {movement.quantityDelta > 0 ? "+" : ""}
                      {formatQuantity(movement.quantityDelta, movement.ingredientUnit)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function InventoryCloseControlCenter({
  analytics,
  auditReport,
  purchasePlan,
  stockRiskInsights
}: {
  analytics: InventoryAnalytics;
  auditReport: InventoryAuditReport;
  purchasePlan: InventoryPurchasePlan;
  stockRiskInsights: {
    lowOrOutCount: number;
    expiredCount: number;
    expiringCount: number;
    incomingCount: number;
    reservedValue: number;
    incomingValue: number;
    riskValue: number;
    riskyRows: InventoryStockBalance[];
  };
}) {
  const stockSignalCount = stockRiskInsights.lowOrOutCount + stockRiskInsights.expiredCount + stockRiskInsights.expiringCount;
  const openControlCount = auditReport.controls.filter((control) => control.severity === "red" || control.severity === "yellow").length;
  const closeReadinessScore = Math.max(
    0,
    Math.min(
      100,
      100 -
        stockSignalCount * 5 -
        auditReport.unreasonedMovementCount * 8 -
        auditReport.openControlAlertCount * 7 -
        purchasePlan.urgentLineCount * 6 -
        purchasePlan.latePurchaseOrderCount * 8 -
        Math.min(18, Math.floor(auditReport.lossValue / 100000) * 3)
    )
  );
  const closeTone = closeReadinessScore >= 85 ? "green" : closeReadinessScore >= 65 ? "yellow" : "red";
  const closeChecks = [
    {
      id: "stock-risk",
      label: "Không còn SKU thiếu/hết/HSD",
      value: stockSignalCount.toLocaleString("vi-VN"),
      done: stockSignalCount === 0,
      action: "Mở Stock board"
    },
    {
      id: "audit-reason",
      label: "Movement rủi ro có lý do",
      value: auditReport.unreasonedMovementCount.toLocaleString("vi-VN"),
      done: auditReport.unreasonedMovementCount === 0,
      action: "Mở Audit"
    },
    {
      id: "purchase-urgent",
      label: "Đã tạo kế hoạch mua gấp",
      value: purchasePlan.urgentLineCount.toLocaleString("vi-VN"),
      done: purchasePlan.urgentLineCount === 0,
      action: "Mở NCC & PO"
    },
    {
      id: "late-po",
      label: "Không có PO trễ",
      value: purchasePlan.latePurchaseOrderCount.toLocaleString("vi-VN"),
      done: purchasePlan.latePurchaseOrderCount === 0,
      action: "Rà nhà cung cấp"
    }
  ];
  const closeQueues = [
    ...stockRiskInsights.riskyRows.slice(0, 3).map((row) => ({
      id: `stock-${row.id}`,
      title: row.ingredientName,
      detail: `${stockStatusLabel(row.status)} · ${row.locationName ?? row.branchName ?? "Kho chính"} · ${expirationCopy(row.expirationDate)}`,
      value: formatVnd(Math.round(Math.max(row.onHandQuantity, row.availableQuantity) * row.referenceUnitCost)),
      tone: stockStatusTone(row.status)
    })),
    ...auditReport.riskyMovements.slice(0, 3).map((movement) => ({
      id: `movement-${movement.id}`,
      title: movement.title,
      detail: movement.detail,
      value: formatVnd(movement.value),
      tone: movement.severity
    })),
    ...purchasePlan.lines.slice(0, 3).map((line) => ({
      id: `purchase-${line.ingredientId}`,
      title: line.name,
      detail: line.reason,
      value: formatVnd(line.estimatedCost),
      tone: line.priority === "urgent" ? "red" as const : line.priority === "soon" ? "yellow" as const : "blue" as const
    }))
  ].slice(0, 6);

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Inventory close control</p>
          <h2 className="mt-1 text-xl font-black text-[var(--foreground)]">Checklist chốt ca kho trước giờ cao điểm</h2>
        </div>
        <Badge tone={closeTone}>Close readiness {closeReadinessScore}/100</Badge>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <MiniMetric label="Tồn rủi ro" value={formatVnd(stockRiskInsights.riskValue)} />
            <MiniMetric label="Loss audit" value={formatVnd(auditReport.lossValue)} />
            <MiniMetric label="Mua gấp" value={formatVnd(purchasePlan.urgentSuggestedValue)} />
            <MiniMetric label="Vốn bị giữ" value={formatVnd(analytics.workingCapital.reservedValue)} />
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-[var(--foreground)]">Mức sẵn sàng đóng ca</p>
                <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">{openControlCount} control cần rà · {closeQueues.length} việc trong hàng đợi</p>
              </div>
              <ScoreRing score={closeReadinessScore} />
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-black text-[var(--foreground)]">Checklist quản lý kho</p>
              <Badge tone={closeChecks.every((item) => item.done) ? "green" : "yellow"}>{closeChecks.filter((item) => !item.done).length || "Xong"}</Badge>
            </div>
            <div className="grid gap-2">
              {closeChecks.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[var(--foreground)]">{item.label}</p>
                    <p className="mt-0.5 text-xs font-bold text-[var(--muted-foreground)]">{item.action}</p>
                  </div>
                  <Badge tone={item.done ? "green" : "yellow"}>{item.value}</Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-black text-[var(--foreground)]">Hàng đợi xử lý</p>
              <Badge tone={closeQueues.length > 0 ? "yellow" : "green"}>{closeQueues.length || "Trống"}</Badge>
            </div>
            <div className="grid max-h-72 gap-2 overflow-auto pr-1">
              {closeQueues.length === 0 ? (
                <p className="rounded-2xl bg-white px-3 py-3 text-sm font-bold text-[var(--muted-foreground)]">Không có việc kho cần xử lý ngay.</p>
              ) : (
                closeQueues.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[var(--foreground)]">{item.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs font-semibold text-[var(--muted-foreground)]">{item.detail}</p>
                      </div>
                      <Badge tone={item.tone}>{item.value}</Badge>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AuditControlPanel({ report }: { report: InventoryAuditReport }) {
  const scoreTone = auditScoreTone(report.auditScore);
  const criticalControls = report.controls.filter((control) => control.severity === "red" || control.severity === "yellow");

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Inventory audit</p>
          <h2 className="mt-1 text-xl font-black text-[var(--foreground)]">Kiểm soát thất thoát và movement rủi ro</h2>
        </div>
        <Badge tone={scoreTone}>Audit score {report.auditScore}/100</Badge>
      </div>

      <div className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-2 sm:grid-cols-2">
          <MiniMetric label="Loss gần đây" value={formatVnd(report.lossValue)} />
          <MiniMetric label="Điều chỉnh thủ công" value={formatVnd(report.manualAdjustmentValue)} />
          <MiniMetric label="Movement thiếu lý do" value={report.unreasonedMovementCount.toLocaleString("vi-VN")} />
          <MiniMetric label="Lệch kiểm kê" value={formatVnd(report.countVarianceValue)} />
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          {criticalControls.length === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 md:col-span-2">
              <p className="font-black text-emerald-800">Kiểm soát kho đang ổn</p>
              <p className="mt-1 text-sm font-semibold text-emerald-700">Chưa có movement thiếu lý do, loss lớn hoặc alert kiểm soát cần xử lý ngay.</p>
            </div>
          ) : (
            criticalControls.slice(0, 4).map((control) => (
              <article key={control.id} className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-black text-[var(--foreground)]">{control.title}</p>
                  <Badge tone={auditSeverityTone(control.severity)}>{control.severity}</Badge>
                </div>
                <p className="mt-2 text-xs font-bold leading-relaxed text-[var(--muted-foreground)]">{control.detail}</p>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function InventoryAuditDesk({ report, snapshot }: { report: InventoryAuditReport; snapshot: InventorySnapshot }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
      <div className="grid gap-4">
        <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Audit overview</p>
              <h2 className="mt-1 text-xl font-black">Điểm kiểm soát kho</h2>
            </div>
            <Badge tone={auditScoreTone(report.auditScore)}>{report.auditScore}/100</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <MiniMetric label="Movement" value={report.movementCount.toLocaleString("vi-VN")} />
            <MiniMetric label="Movement loss" value={report.lossMovementCount.toLocaleString("vi-VN")} />
            <MiniMetric label="Rollback" value={formatVnd(report.rollbackValue)} />
            <MiniMetric label="Alert kiểm soát" value={report.openControlAlertCount.toLocaleString("vi-VN")} />
          </div>
        </section>

        <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Top loss</p>
              <h2 className="mt-1 text-xl font-black">Nguyên liệu hao hụt cao</h2>
            </div>
            <Badge tone={report.topLossItems.length > 0 ? "yellow" : "green"}>{report.topLossItems.length} SKU</Badge>
          </div>
          <div className="grid gap-2">
            {report.topLossItems.length === 0 ? (
              <EmptyState icon={PackageCheck} title="Chưa có loss nổi bật" description="Movement hao hụt, hết hạn và trả nhà cung cấp sẽ được gom tại đây khi phát sinh." />
            ) : (
              report.topLossItems.map((item) => (
                <div key={item.ingredientName} className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-black">{item.ingredientName}</p>
                    <Badge tone={item.value >= 300000 ? "red" : "yellow"}>{formatVnd(item.value)}</Badge>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[var(--muted-foreground)]">
                    {formatQuantity(item.quantity, item.ingredientUnit)} · {item.movementCount.toLocaleString("vi-VN")} movement
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-4">
        <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Risky movements</p>
              <h2 className="mt-1 text-xl font-black">Movement cần rà trước khi chốt ca</h2>
            </div>
            <Badge tone={report.riskyMovements.length > 0 ? "yellow" : "green"}>{report.riskyMovements.length} dòng</Badge>
          </div>
          {report.riskyMovements.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="Không có movement rủi ro" description="Các movement gần đây đã có nguồn, lý do hoặc giá trị không vượt ngưỡng kiểm soát." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
              <div className="hidden grid-cols-[minmax(180px,1fr)_0.8fr_110px_120px] bg-[var(--surface-container-high)] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)] md:grid">
                <span>Movement</span>
                <span>Lý do</span>
                <span>Giá trị</span>
                <span>Thời gian</span>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {report.riskyMovements.map((movement) => (
                  <div key={movement.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[minmax(180px,1fr)_0.8fr_110px_120px] md:items-center">
                    <p className="truncate font-black text-[var(--foreground)]">{movement.title}</p>
                    <p className="line-clamp-2 font-semibold text-[var(--muted-foreground)]">{movement.detail}</p>
                    <Badge tone={movement.severity}>{formatVnd(movement.value)}</Badge>
                    <span className="text-xs font-bold text-[var(--muted-foreground)]">{formatDateTime(movement.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Control checklist</p>
              <h2 className="mt-1 text-xl font-black">Checklist audit theo ca</h2>
            </div>
            <Badge tone={report.controls.some((control) => control.severity === "red") ? "red" : "green"}>{report.controls.length} control</Badge>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {report.controls.map((control) => (
              <article key={control.id} className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-black text-[var(--foreground)]">{control.title}</p>
                  <Badge tone={auditSeverityTone(control.severity)}>{control.severity}</Badge>
                </div>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--muted-foreground)]">{control.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Recent ledger</p>
              <h2 className="mt-1 text-xl font-black">Nhật ký gần đây để đối chiếu</h2>
            </div>
            <Badge tone={snapshot.recentMovements.length > 0 ? "blue" : "green"}>{snapshot.recentMovements.length} movement</Badge>
          </div>
          {snapshot.recentMovements.length === 0 ? (
            <EmptyState icon={ReceiptText} title="Chưa có movement gần đây" description="Khi nhập, bán, điều chỉnh hoặc kiểm kê kho, movement sẽ xuất hiện để audit." />
          ) : (
            <div className="grid gap-2">
              {snapshot.recentMovements.slice(0, 6).map((movement) => (
                <div key={movement.id} className="grid gap-1 rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-black text-[var(--foreground)]">{movement.ingredientName}</p>
                    <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">
                      {movement.movementType} · {movement.sourceType ?? "manual"} · {formatDateTime(movement.createdAt)}
                    </p>
                  </div>
                  <Badge tone={movementTone(movement.movementType)}>{formatQuantity(Math.abs(movement.quantityDelta), movement.ingredientUnit)}</Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function BranchBalancingCommandCenter({ report }: { report: InventoryBranchBalancingReport }) {
  const scoreTone = report.balanceScore >= 85 ? "green" : report.balanceScore >= 65 ? "yellow" : "red";
  const urgentTransfers = report.transferSuggestions.filter((item) => item.priority === "urgent");
  const topBranches = report.branches.slice(0, 3);

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Multi-branch balancing</p>
          <h2 className="mt-1 text-xl font-black text-[var(--foreground)]">Cân bằng tồn kho chuỗi và kho trung tâm</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={scoreTone}>Balance {report.balanceScore}/100</Badge>
          <Badge tone={urgentTransfers.length > 0 ? "red" : report.suggestedTransferCount > 0 ? "yellow" : "green"}>
            {report.suggestedTransferCount} gợi ý chuyển
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <MiniMetric label="Thiếu theo chi nhánh" value={formatVnd(report.shortageValue)} />
            <MiniMetric label="Dư có thể cân bằng" value={formatVnd(report.surplusValue)} />
            <MiniMetric label="Sắp HSD" value={formatVnd(report.expiringValue)} />
            <MiniMetric label="Transfer mở" value={report.openTransferCount.toLocaleString("vi-VN")} />
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-black text-[var(--foreground)]">Kho trung tâm</p>
                <p className="mt-1 truncate text-xs font-bold text-[var(--muted-foreground)]">
                  {report.centralKitchen.ready ? report.centralKitchen.locationNames.join(" · ") : "Chưa nhận diện kho trung tâm"}
                </p>
              </div>
              <Badge tone={report.centralKitchen.ready ? "green" : "blue"}>{report.centralLocationCount} kho</Badge>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <MiniMetric label="Tồn trung tâm" value={formatVnd(report.centralKitchen.stockValue)} />
              <MiniMetric label="Dư trung tâm" value={formatVnd(report.centralKitchen.surplusValue)} />
              <MiniMetric label="Có thể cấp" value={formatVnd(report.centralKitchen.suggestedOutboundValue)} />
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-black text-[var(--foreground)]">Điểm bán cần cân bằng</p>
              <Badge tone={topBranches.some((branch) => branch.readinessScore < 70) ? "red" : topBranches.length > 0 ? "yellow" : "green"}>
                {report.branchCount} cụm
              </Badge>
            </div>
            <div className="grid gap-2">
              {topBranches.length === 0 ? (
                <p className="rounded-2xl bg-white px-3 py-3 text-sm font-bold text-[var(--muted-foreground)]">Chưa có dữ liệu chi nhánh/kho.</p>
              ) : (
                topBranches.map((branch) => (
                  <article key={branch.branchName} className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-black text-[var(--foreground)]">{branch.branchName}</p>
                        <p className="mt-0.5 truncate text-xs font-semibold text-[var(--muted-foreground)]">
                          {branch.shortageLineCount} thiếu · {branch.expiringLineCount} HSD · {branch.openInboundTransferCount} inbound
                        </p>
                      </div>
                      <Badge tone={branch.readinessScore >= 85 ? "green" : branch.readinessScore >= 65 ? "yellow" : "red"}>{branch.readinessScore}/100</Badge>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-black text-[var(--foreground)]">Transfer gợi ý</p>
              <Badge tone={urgentTransfers.length > 0 ? "red" : report.transferSuggestions.length > 0 ? "yellow" : "green"}>
                {urgentTransfers.length} gấp
              </Badge>
            </div>
            <div className="grid max-h-72 gap-2 overflow-auto pr-1">
              {report.transferSuggestions.length === 0 ? (
                <p className="rounded-2xl bg-white px-3 py-3 text-sm font-bold text-[var(--muted-foreground)]">Chưa cần điều chuyển cân bằng.</p>
              ) : (
                report.transferSuggestions.slice(0, 4).map((item) => (
                  <article key={item.id} className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[var(--foreground)]">{item.ingredientName}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs font-semibold text-[var(--muted-foreground)]">
                          {item.fromLocationName} → {item.toLocationName} · {formatQuantity(item.quantity, item.ingredientUnit)}
                        </p>
                      </div>
                      <Badge tone={item.priority === "urgent" ? "red" : item.priority === "soon" ? "yellow" : "blue"}>{formatVnd(item.value)}</Badge>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BranchBalancingDesk({ report }: { report: InventoryBranchBalancingReport }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
      <div className="grid gap-4">
        <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Balancing score</p>
              <h2 className="mt-1 text-xl font-black">Sức khỏe cân bằng chuỗi</h2>
            </div>
            <ScoreRing score={report.balanceScore} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <MiniMetric label="Chi nhánh/cụm" value={report.branchCount.toLocaleString("vi-VN")} />
            <MiniMetric label="Vị trí kho" value={report.locationCount.toLocaleString("vi-VN")} />
            <MiniMetric label="Kho trung tâm" value={report.centralLocationCount.toLocaleString("vi-VN")} />
            <MiniMetric label="Transfer mở" value={report.openTransferCount.toLocaleString("vi-VN")} />
          </div>
        </section>

        <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Branch exposure</p>
              <h2 className="mt-1 text-xl font-black">Tồn và thiếu theo chi nhánh</h2>
            </div>
            <Badge tone={report.branches.some((branch) => branch.shortageValue > 0) ? "yellow" : "green"}>{report.branches.length} dòng</Badge>
          </div>
          <div className="grid gap-2">
            {report.branches.length === 0 ? (
              <EmptyState icon={Warehouse} title="Chưa có cụm kho" description="Khi có stock balance theo location/branch, hệ thống sẽ tính cân bằng từng điểm bán." />
            ) : (
              report.branches.slice(0, 8).map((branch) => (
                <article key={branch.branchName} className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-black text-[var(--foreground)]">{branch.branchName}</p>
                      <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">
                        {branch.locationCount} kho · {branch.shortageLineCount} thiếu · {branch.surplusLineCount} dư
                      </p>
                    </div>
                    <Badge tone={branch.readinessScore >= 85 ? "green" : branch.readinessScore >= 65 ? "yellow" : "red"}>{branch.readinessScore}/100</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <MiniMetric label="Tồn" value={formatVnd(branch.stockValue)} />
                    <MiniMetric label="Thiếu" value={formatVnd(branch.shortageValue)} />
                    <MiniMetric label="Sắp HSD" value={formatVnd(branch.expiringValue)} />
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-4">
        <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Suggested transfers</p>
              <h2 className="mt-1 text-xl font-black">Gợi ý điều chuyển trước khi mua thêm</h2>
            </div>
            <Badge tone={report.transferSuggestions.length > 0 ? "yellow" : "green"}>{report.transferSuggestions.length} dòng</Badge>
          </div>
          {report.transferSuggestions.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Không có đề xuất điều chuyển" description="Hệ thống chưa tìm thấy cặp kho dư - chi nhánh thiếu cùng nguyên liệu." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
              <div className="hidden grid-cols-[1fr_1fr_0.65fr_0.65fr] bg-[var(--surface-container-high)] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)] md:grid">
                <span>Tuyến</span>
                <span>Nguyên liệu</span>
                <span>Lượng</span>
                <span>Giá trị</span>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {report.transferSuggestions.map((item) => (
                  <div key={item.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_1fr_0.65fr_0.65fr] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-black text-[var(--foreground)]">{item.fromBranchName} → {item.toBranchName}</p>
                      <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">{item.fromLocationName} → {item.toLocationName}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-black">{item.ingredientName}</p>
                      <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">{item.reason}</p>
                    </div>
                    <Badge tone={item.priority === "urgent" ? "red" : item.priority === "soon" ? "yellow" : "blue"}>
                      {formatQuantity(item.quantity, item.ingredientUnit)}
                    </Badge>
                    <span className="metric-number font-black">{formatVnd(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Balancing risks</p>
              <h2 className="mt-1 text-xl font-black">Rủi ro cần xử lý</h2>
            </div>
            <Badge tone={report.risks.some((risk) => risk.severity === "red") ? "red" : report.risks.length > 0 ? "yellow" : "green"}>{report.risks.length} tín hiệu</Badge>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {report.risks.length === 0 ? (
              <p className="rounded-2xl bg-[var(--soft-surface)] px-3 py-3 text-sm font-bold text-[var(--muted-foreground)] lg:col-span-2">Không có rủi ro cân bằng chuỗi nổi bật.</p>
            ) : (
              report.risks.map((risk) => (
                <article key={risk.id} className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-black text-[var(--foreground)]">{risk.title}</p>
                    <Badge tone={risk.severity}>{formatVnd(risk.value)}</Badge>
                  </div>
                  <p className="mt-2 text-xs font-bold text-[var(--muted-foreground)]">{risk.detail}</p>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function InventoryAnalyticsDesk({ analytics }: { analytics: InventoryAnalytics }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
      <div className="grid gap-4">
        <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Working capital</p>
              <h2 className="mt-1 text-xl font-black">Vốn nằm trong kho</h2>
            </div>
            <Badge tone={analytics.workingCapital.riskValue > 0 ? "yellow" : "green"}>{formatVnd(analytics.workingCapital.onHandValue)}</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <MiniMetric label="On hand" value={formatVnd(analytics.workingCapital.onHandValue)} />
            <MiniMetric label="Available" value={formatVnd(analytics.workingCapital.availableValue)} />
            <MiniMetric label="Reserved" value={formatVnd(analytics.workingCapital.reservedValue)} />
            <MiniMetric label="Incoming" value={formatVnd(analytics.workingCapital.incomingValue)} />
          </div>
        </section>

        <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Recipe economics</p>
          <h2 className="mt-1 text-xl font-black">Giá vốn và margin</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <MiniMetric label="Recipe ready" value={analytics.recipeEconomics.recipeReadyCount.toLocaleString("vi-VN")} />
            <MiniMetric label="Thiếu recipe" value={analytics.recipeEconomics.missingRecipeCount.toLocaleString("vi-VN")} />
            <MiniMetric label="Food cost TB" value={formatPercent(analytics.recipeEconomics.averageFoodCostPercent)} />
            <MiniMetric label="Gross margin TB" value={formatPercent(analytics.recipeEconomics.averageGrossMarginPercent)} />
          </div>
        </section>
      </div>

      <div className="grid gap-4">
        <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Location exposure</p>
              <h2 className="mt-1 text-xl font-black">Rủi ro theo vị trí kho</h2>
            </div>
            <Badge tone={analytics.locationExposure.length > 0 ? "blue" : "green"}>{analytics.locationExposure.length} kho</Badge>
          </div>
          {analytics.locationExposure.length === 0 ? (
            <EmptyState icon={Warehouse} title="Chưa có tồn theo vị trí" description="Khi có stock balance theo kho/lô, analytics sẽ nhóm vốn và rủi ro theo vị trí." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
              <div className="hidden grid-cols-[1fr_0.75fr_0.75fr_0.55fr] bg-[var(--surface-container-high)] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)] md:grid">
                <span>Vị trí</span>
                <span>Giá trị tồn</span>
                <span>Rủi ro</span>
                <span>Dòng</span>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {analytics.locationExposure.map((location) => (
                  <div key={location.locationName} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_0.75fr_0.75fr_0.55fr] md:items-center">
                    <p className="truncate font-black">{location.locationName}</p>
                    <span className="metric-number font-black">{formatVnd(location.onHandValue)}</span>
                    <Badge tone={location.riskValue > 0 ? "red" : "green"}>{formatVnd(location.riskValue)}</Badge>
                    <span className="font-bold text-[var(--muted-foreground)]">{location.riskLineCount}/{location.lineCount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <AnalyticsSupplierPanel analytics={analytics} />
          <AnalyticsAlertPanel analytics={analytics} />
        </section>
      </div>
    </section>
  );
}

function AnalyticsSupplierPanel({ analytics }: { analytics: InventoryAnalytics }) {
  return (
    <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Supplier exposure</p>
          <h2 className="mt-1 text-xl font-black">NCC & PO</h2>
        </div>
        <Badge tone={analytics.purchasing.latePurchaseOrderCount > 0 ? "red" : "green"}>{analytics.purchasing.latePurchaseOrderCount} trễ</Badge>
      </div>
      <div className="grid gap-2">
        {analytics.purchasing.supplierExposure.length === 0 ? (
          <p className="rounded-2xl bg-[var(--soft-surface)] px-3 py-3 text-sm font-bold text-[var(--muted-foreground)]">Không có PO mở.</p>
        ) : (
          analytics.purchasing.supplierExposure.map((supplier) => (
            <div key={supplier.supplierName} className="rounded-2xl border border-[var(--border)] p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="truncate font-black">{supplier.supplierName}</p>
                <Badge tone={supplier.lateCount > 0 ? "red" : "blue"}>{supplier.openCount} PO</Badge>
              </div>
              <p className="mt-1 text-sm font-semibold text-[var(--muted-foreground)]">{formatVnd(supplier.openValue)} · {supplier.lineCount} dòng · {supplier.lateCount} trễ</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function AnalyticsAlertPanel({ analytics }: { analytics: InventoryAnalytics }) {
  return (
    <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Alert mix</p>
          <h2 className="mt-1 text-xl font-black">Cơ cấu cảnh báo</h2>
        </div>
        <Badge tone={analytics.alertMix.length > 0 ? "yellow" : "green"}>{analytics.alertMix.length} nhóm</Badge>
      </div>
      <div className="grid gap-2">
        {analytics.alertMix.length === 0 ? (
          <p className="rounded-2xl bg-[var(--soft-surface)] px-3 py-3 text-sm font-bold text-[var(--muted-foreground)]">Không có cảnh báo mở.</p>
        ) : (
          analytics.alertMix.map((alert) => (
            <div key={alert.label} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-3 py-2">
              <span className="truncate text-sm font-black">{alertTypeLabel(alert.label)}</span>
              <Badge tone={alert.severity}>{alert.count}</Badge>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function StockRiskCockpit({
  insights
}: {
  insights: {
    lowOrOutCount: number;
    expiredCount: number;
    expiringCount: number;
    incomingCount: number;
    reservedValue: number;
    incomingValue: number;
    riskValue: number;
    riskyRows: InventoryStockBalance[];
  };
}) {
  const totalSignals = insights.lowOrOutCount + insights.expiredCount + insights.expiringCount;

  return (
    <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <div className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Rủi ro tồn</p>
            <h2 className="mt-1 text-xl font-black text-[var(--foreground)]">Tồn kho cần chú ý</h2>
          </div>
          <Badge tone={totalSignals > 0 ? "red" : "green"}>{totalSignals} tín hiệu</Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <MiniMetric label="Thiếu / sắp hết" value={insights.lowOrOutCount.toLocaleString("vi-VN")} />
          <MiniMetric label="Hết hạn" value={insights.expiredCount.toLocaleString("vi-VN")} />
          <MiniMetric label="Sắp HSD" value={insights.expiringCount.toLocaleString("vi-VN")} />
          <MiniMetric label="Đang về" value={insights.incomingCount.toLocaleString("vi-VN")} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-black text-red-800">
            <AlertTriangle className="mb-1 h-4 w-4" />
            Rủi ro {formatVnd(insights.riskValue)}
          </div>
          <div className="rounded-2xl bg-blue-50 px-3 py-2 text-sm font-black text-blue-800">
            <Truck className="mb-1 h-4 w-4" />
            Incoming {formatVnd(insights.incomingValue)}
          </div>
          <div className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-black text-amber-800">
            <ShieldCheck className="mb-1 h-4 w-4" />
            Reserved {formatVnd(insights.reservedValue)}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Ops board</p>
            <h2 className="mt-1 text-xl font-black text-[var(--foreground)]">Dòng tồn cần xử lý</h2>
          </div>
          <Badge tone={insights.riskyRows.length > 0 ? "yellow" : "green"}>{insights.riskyRows.length} dòng</Badge>
        </div>
        {insights.riskyRows.length === 0 ? (
          <EmptyState icon={PackageCheck} title="Tồn kho đang ổn" description="Không có dòng hết hàng, sắp hết, hết hạn hoặc đang chờ nhập nổi bật." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {insights.riskyRows.map((row) => (
              <article key={row.id} className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-black text-[var(--foreground)]">{row.ingredientName}</p>
                    <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">
                      {row.locationName || "Kho chính"}{row.branchName ? ` · ${row.branchName}` : ""}{row.batchCode ? ` · Lô ${row.batchCode}` : ""}
                    </p>
                  </div>
                  <Badge tone={stockStatusTone(row.status)}>{stockStatusLabel(row.status)}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MiniMetric label="Khả dụng" value={formatQuantity(row.availableQuantity, row.ingredientUnit)} />
                  <MiniMetric label="Incoming" value={formatQuantity(row.incomingQuantity, row.ingredientUnit)} />
                  <MiniMetric label="Giá trị" value={formatVnd(Math.round(Math.max(row.availableQuantity, row.onHandQuantity) * row.referenceUnitCost))} />
                </div>
                <p className="mt-2 text-xs font-bold text-[var(--muted-foreground)]">
                  {row.expirationDate ? expirationCopy(row.expirationDate) : row.incomingQuantity > 0 ? "Có hàng đang về, cần theo dõi thời gian nhận." : "Không có HSD theo lô."}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CostControlPanel({
  insights,
  recipeBacklog
}: {
  insights: {
    recipeReadyCount: number;
    riskyItems: InventoryRecipeMenuItem[];
    watchItems: number;
    totalRecipeCost: number;
    totalGrossProfit: number;
    averageCostPercent: number;
  };
  recipeBacklog: InventoryRecipeMenuItem[];
}) {
  const topRiskItems = insights.riskyItems.slice(0, 5);
  const hasCostRisk = topRiskItems.length > 0 || recipeBacklog.length > 0;

  return (
    <section className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
      <div className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Cost control</p>
            <h2 className="mt-1 text-xl font-black text-[var(--foreground)]">Biên lợi nhuận món</h2>
          </div>
          <Badge tone={hasCostRisk ? "yellow" : "green"}>{hasCostRisk ? "Cần rà" : "Ổn"}</Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <MiniMetric label="Món có recipe" value={insights.recipeReadyCount.toLocaleString("vi-VN")} />
          <MiniMetric label="Food cost TB" value={formatPercent(insights.averageCostPercent)} />
          <MiniMetric label="Tổng giá vốn/món" value={formatVnd(insights.totalRecipeCost)} />
          <MiniMetric label="Lợi nhuận gộp/món" value={formatVnd(insights.totalGrossProfit)} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800">
            <BadgePercent className="mb-1 h-4 w-4" />
            {Math.max(0, insights.recipeReadyCount - insights.riskyItems.length - insights.watchItems).toLocaleString("vi-VN")} món margin tốt
          </div>
          <div className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-black text-amber-800">
            <AlertTriangle className="mb-1 h-4 w-4" />
            {insights.watchItems.toLocaleString("vi-VN")} món cần theo dõi
          </div>
          <div className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-black text-red-800">
            <TrendingDown className="mb-1 h-4 w-4" />
            {insights.riskyItems.length.toLocaleString("vi-VN")} món rủi ro
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Margin guard</p>
            <h2 className="mt-1 text-xl font-black text-[var(--foreground)]">Món cần xử lý trước</h2>
          </div>
          <Badge tone={topRiskItems.length > 0 ? "red" : recipeBacklog.length > 0 ? "yellow" : "green"}>{topRiskItems.length + recipeBacklog.length} tín hiệu</Badge>
        </div>
        {topRiskItems.length === 0 && recipeBacklog.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Chưa có rủi ro cost" description="Các món đã có định mức đang nằm trong vùng margin an toàn." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {topRiskItems.map((item) => (
              <article key={item.id} className="rounded-2xl border border-red-200 bg-red-50/50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-black text-[var(--foreground)]">{item.name}</p>
                    <p className="mt-1 text-xs font-semibold text-red-800">{item.marginWarning ?? "Recipe cost đang cao hơn vùng an toàn."}</p>
                  </div>
                  <Badge tone={costStatusTone(item.costStatus)}>{formatPercent(item.recipeCostPercent)}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MiniMetric label="Giá bán" value={formatVnd(item.price)} />
                  <MiniMetric label="Giá vốn" value={formatVnd(item.totalRecipeCost)} />
                  <MiniMetric label="Margin" value={formatPercent(item.grossMarginPercent)} />
                </div>
              </article>
            ))}
            {recipeBacklog.slice(0, Math.max(0, 5 - topRiskItems.length)).map((item) => (
              <article key={item.id} className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-black text-[var(--foreground)]">{item.name}</p>
                    <p className="mt-1 text-xs font-semibold text-amber-800">Chưa có định mức nên chưa tính được food cost và tự động trừ kho.</p>
                  </div>
                  <Badge tone="yellow">Thiếu recipe</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MiniMetric label="Giá bán" value={formatVnd(item.price)} />
                  <MiniMetric label="Nhóm món" value={item.categoryName || "Chưa nhóm"} />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SmartReorderTable({ suggestions, ingredients }: { suggestions: InventoryIntelligence["reorderSuggestions"]; ingredients: InventoryIngredient[] }) {
  return (
    <section className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Gợi ý đặt hàng</p>
          <h2 className="mt-1 text-xl font-black text-[var(--foreground)]">Gợi ý đặt hàng thông minh</h2>
        </div>
        <Button type="button" size="sm" className="rounded-xl">Tạo đơn mua tất cả</Button>
      </div>
      <div className="hidden overflow-hidden rounded-2xl border border-[var(--border)] md:block">
        <div className="grid grid-cols-[1.1fr_0.8fr_0.8fr_1fr_0.8fr_0.8fr] bg-[var(--surface-container-high)] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          <span>Nguyên liệu</span>
          <span>Tồn hiện tại</span>
          <span>Đề xuất mua</span>
          <span>Lý do</span>
          <span>Chi phí</span>
          <span>Hành động</span>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {suggestions.length === 0 ? (
            <p className="p-4 text-sm font-bold text-[var(--muted-foreground)]">Chưa có gợi ý đặt hàng.</p>
          ) : (
            suggestions.map((item) => {
              const ingredient = ingredients.find((entry) => entry.id === item.ingredientId);
              return (
                <div key={item.ingredientId} className="grid grid-cols-[1.1fr_0.8fr_0.8fr_1fr_0.8fr_0.8fr] items-center px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-black text-[var(--foreground)]">{item.name}</p>
                    <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">{ingredient ? locationLabel(ingredient) : "Chưa định vị"}</p>
                  </div>
                  <span className="font-bold">{formatQuantity(item.onHandQuantity, item.unit)}</span>
                  <span className="font-bold text-[var(--primary)]">{formatQuantity(item.reorderQuantity, item.unit)}</span>
                  <Badge tone={priorityTone(item.urgency)}>{item.urgency === "high" ? "Dưới ngưỡng min" : "Sắp chạm ngưỡng"}</Badge>
                  <span className="metric-number font-black">{formatVnd(item.estimatedCost)}</span>
                  <Button type="button" size="sm" variant="secondary" className="rounded-xl">Tạo đơn mua</Button>
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="grid gap-3 md:hidden">
        {suggestions.map((item) => (
          <article key={item.ingredientId} className="rounded-2xl border border-[var(--border)] p-3">
            <div className="flex justify-between gap-3">
              <p className="font-black">{item.name}</p>
              <Badge tone={priorityTone(item.urgency)}>{formatVnd(item.estimatedCost)}</Badge>
            </div>
            <p className="mt-1 text-sm font-semibold text-[var(--muted-foreground)]">Tồn {formatQuantity(item.onHandQuantity, item.unit)} · mua {formatQuantity(item.reorderQuantity, item.unit)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function InventoryHealthBreakdown({ segments }: { segments: Array<{ label: string; count: number; percent: number; tone: "green" | "yellow" | "red" | "blue" }> }) {
  return (
    <section className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Phân tích sức khỏe kho</p>
      <h2 className="mt-1 text-xl font-black text-[var(--foreground)]">Breakdown cảnh báo</h2>
      <div className="mt-4 space-y-4">
        {segments.map((segment) => (
          <div key={segment.label}>
            <div className="flex items-center justify-between gap-3">
              <Badge tone={segment.tone === "blue" ? "blue" : segment.tone}>{segment.label}</Badge>
              <span className="text-sm font-black text-[var(--foreground)]">{segment.count}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${segment.tone === "green" ? "bg-emerald-500" : segment.tone === "yellow" ? "bg-amber-500" : segment.tone === "red" ? "bg-red-500" : "bg-blue-500"}`}
                style={{ width: `${Math.max(2, Math.min(100, segment.percent))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function quickActionToneClass(tone: InventoryQuickAction["tone"]) {
  if (tone === "red") return "border-red-200 bg-red-50 text-red-800 hover:bg-red-100";
  if (tone === "yellow") return "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100";
  if (tone === "blue") return "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100";
  return "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100";
}

function WorkbenchButton({
  active,
  icon: Icon,
  label,
  tabId,
  panelId,
  onClick
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  tabId: string;
  panelId: string;
  onClick: () => void;
}) {
  return (
    <button
      id={tabId}
      type="button"
      role="tab"
      onClick={onClick}
      aria-selected={active}
      aria-controls={panelId}
      className={`inline-flex h-12 shrink-0 snap-start items-center gap-2 rounded-xl px-3 text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] sm:rounded-2xl sm:px-4 ${
        active ? "bg-[var(--primary)] text-white shadow-sm" : "bg-[var(--soft-surface)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function WorkbenchSubnavButton({
  active,
  icon: Icon,
  label,
  tabId,
  panelId,
  onClick
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  tabId: string;
  panelId: string;
  onClick: () => void;
}) {
  return (
    <button
      id={tabId}
      type="button"
      role="tab"
      onClick={onClick}
      aria-selected={active}
      aria-controls={panelId}
      className={`inline-flex h-12 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${
        active ? "bg-white text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)] hover:bg-white/70 hover:text-[var(--foreground)]"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function AiInventoryIntake({
  fileInputRef,
  intakeMode,
  setIntakeMode,
  rawIntake,
  setRawIntake,
  draftRows,
  parserMessage,
  aiOcrError,
  aiOcrLoading,
  isListening,
  isParsing,
  importTotalValue,
  rowsJson,
  importAction,
  importPending,
  importState,
  onParse,
  onFileUpload,
  onAdvancedRead,
  onVoice
}: {
  fileInputRef: RefObject<HTMLInputElement | null>;
  intakeMode: IntakeMode;
  setIntakeMode: (mode: IntakeMode) => void;
  rawIntake: string;
  setRawIntake: (value: string) => void;
  draftRows: IntakeDraftRow[];
  parserMessage: string;
  aiOcrError: string | null;
  aiOcrLoading: boolean;
  isListening: boolean;
  isParsing: boolean;
  importTotalValue: number;
  rowsJson: string;
  importAction: (formData: FormData) => void;
  importPending: boolean;
  importState?: { error?: string; success?: string };
  onParse: () => void;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onAdvancedRead: () => void;
  onVoice: () => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">AI nhập kho</p>
            <h2 className="mt-1 text-xl font-black">Nhập kho đa nguồn</h2>
          </div>
          <BrainCircuit className="h-6 w-6 text-[var(--primary)]" />
        </div>
        <input ref={fileInputRef} className="hidden" type="file" accept=".txt,.json,.csv,image/*" onChange={onFileUpload} />
        <div className="grid grid-cols-4 gap-2">
          <ModeButton active={intakeMode === "text"} icon={Wand2} label="Text" onClick={() => setIntakeMode("text")} />
          <ModeButton active={intakeMode === "file"} icon={Upload} label="File" onClick={() => fileInputRef.current?.click()} />
          <ModeButton active={intakeMode === "voice"} icon={AudioLines} label="Voice" onClick={() => setIntakeMode("voice")} />
          <ModeButton active={intakeMode === "ocr"} icon={Camera} label="OCR" onClick={() => fileInputRef.current?.click()} />
        </div>
        <Textarea
          className="mt-3 min-h-36 rounded-2xl bg-[var(--soft-surface)] text-sm"
          value={rawIntake}
          onChange={(event) => setRawIntake(event.target.value)}
          placeholder="Tên, đơn vị, số lượng, min, giá, nhóm"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" onClick={onParse} disabled={isParsing} className="h-12 rounded-xl">
            <Sparkles className="h-4 w-4" /> Phân tích dữ liệu
          </Button>
          <Button type="button" variant="secondary" onClick={onAdvancedRead} disabled={aiOcrLoading} className="h-12 rounded-xl">
            <BrainCircuit className="h-4 w-4" /> {aiOcrLoading ? "Đang đọc..." : "AI đọc nâng cao"}
          </Button>
          <Button type="button" variant="secondary" onClick={onVoice} className="h-12 rounded-xl">
            <AudioLines className="h-4 w-4" /> {isListening ? "Đang nghe..." : "Nhập giọng nói"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => fileInputRef.current?.click()} className="h-12 rounded-xl">
            <FileJson className="h-4 w-4" /> File / OCR
          </Button>
        </div>
        <p className="mt-3 rounded-2xl bg-[var(--soft-surface)] px-3 py-2 text-xs font-bold text-[var(--muted-foreground)]">{parserMessage}</p>
        {aiOcrError ? <p className="mt-2 rounded-2xl bg-red-50 px-3 py-2 text-xs font-black text-red-700">{aiOcrError}</p> : null}
      </section>

      <form action={importAction} className="rounded-3xl border border-[var(--border)] bg-white p-4">
        <input type="hidden" name="rowsJson" value={rowsJson} />
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Bảng nháp</p>
            <h2 className="mt-1 text-xl font-black">{draftRows.length} dòng · {formatVnd(importTotalValue)}</h2>
          </div>
          <Badge tone={draftRows.length > 0 ? "green" : "neutral"}>{draftRows.length > 0 ? "Sẵn sàng" : "Trống"}</Badge>
        </div>
        <div className="min-h-72 overflow-hidden rounded-2xl border border-[var(--border)]">
          {draftRows.length === 0 ? (
            <EmptyState icon={FileText} title="Chưa có bảng nháp" description="Bảng nháp đang trống." />
          ) : (
            <div className="max-h-72 divide-y divide-[var(--border)] overflow-auto">
              {draftRows.map((row, index) => (
                <div key={`${row.name}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-black">{row.name}</p>
                    <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">{row.categoryName || "Chưa nhóm"} · min {formatQuantity(row.minimumQuantity, row.unit)} · giá {formatVnd(row.referenceUnitCost)}</p>
                  </div>
                  <p className="metric-number text-right font-black text-[var(--primary)]">{formatQuantity(row.quantity, row.unit)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        {importState?.error ? <p className="mt-2 rounded-2xl bg-red-50 px-3 py-2 text-xs font-black text-red-700">{importState.error}</p> : null}
        {importState?.success ? <p className="mt-2 rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">{importState.success}</p> : null}
        <SubmitButton disabled={draftRows.length === 0 || importPending} pendingLabel="Đang nhập vào kho..." className="mt-3 h-12 w-full rounded-2xl">
          <PackagePlus className="h-4 w-4" /> Nhập vào kho thật
        </SubmitButton>
      </form>
    </div>
  );
}

function IngredientTable({
  ingredients,
  categories,
  query,
  onQueryChange,
  onCreate,
  onEdit
}: {
  ingredients: InventoryIngredient[];
  categories: InventoryCategory[];
  query: string;
  onQueryChange: (value: string) => void;
  onCreate: () => void;
  onEdit: (ingredient: InventoryIngredient) => void;
}) {
  return (
    <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Quản lý nguyên liệu</p>
          <h2 className="mt-1 text-xl font-black">Thêm, sửa, xóa và định vị nguyên liệu</h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input className="pl-9" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Tìm tên, nhóm, vị trí..." />
          </label>
          <Button type="button" onClick={onCreate} className="rounded-xl">
            <PackagePlus className="h-4 w-4" /> Thêm nguyên liệu
          </Button>
        </div>
      </div>
      <div className="hidden overflow-hidden rounded-2xl border border-[var(--border)] xl:block">
        <div className="grid grid-cols-[1.1fr_0.8fr_0.8fr_0.55fr_0.7fr_0.9fr_0.5fr] bg-[var(--surface-container-high)] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          <span>Tên nguyên liệu</span>
          <span>Nhóm</span>
          <span>Tồn / Min</span>
          <span>Đơn vị</span>
          <span>Giá vốn</span>
          <span>Vị trí</span>
          <span>Hành động</span>
        </div>
        <div className="max-h-[560px] divide-y divide-[var(--border)] overflow-auto">
          {ingredients.length === 0 ? (
            <p className="p-4 text-sm font-bold text-[var(--muted-foreground)]">Chưa có nguyên liệu phù hợp.</p>
          ) : (
            ingredients.map((ingredient) => (
              <div key={ingredient.id} className="grid grid-cols-[1.1fr_0.8fr_0.8fr_0.55fr_0.7fr_0.9fr_0.5fr] items-center px-4 py-3 text-sm">
                <p className="truncate font-black">{ingredient.name}</p>
                <span className="truncate font-semibold text-[var(--muted-foreground)]">{ingredient.categoryName || "Chưa nhóm"}</span>
                <span className="font-bold">{formatQuantity(ingredient.onHandQuantity, ingredient.unit)} / {formatQuantity(ingredient.minimumQuantity, ingredient.unit)}</span>
                <span className="font-bold">{ingredient.unit === "cai" ? "cái" : ingredient.unit}</span>
                <span className="metric-number font-black">{formatVnd(ingredient.referenceUnitCost)}</span>
                <span className="truncate font-semibold text-[var(--primary)]">{locationLabel(ingredient)}</span>
                <button type="button" onClick={() => onEdit(ingredient)} className="inline-flex h-9 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="grid gap-3 xl:hidden">
        {ingredients.map((ingredient) => (
          <article key={ingredient.id} className="rounded-2xl border border-[var(--border)] p-3">
            <div className="flex justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-black">{ingredient.name}</p>
                <p className="truncate text-sm font-semibold text-[var(--muted-foreground)]">{ingredient.categoryName || "Chưa nhóm"} · {locationLabel(ingredient)}</p>
              </div>
              <button type="button" onClick={() => onEdit(ingredient)} className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                <Pencil className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-sm font-bold">Tồn {formatQuantity(ingredient.onHandQuantity, ingredient.unit)} / min {formatQuantity(ingredient.minimumQuantity, ingredient.unit)} · {formatVnd(ingredient.referenceUnitCost)}</p>
          </article>
        ))}
      </div>
      <div className="mt-4 rounded-2xl bg-[var(--soft-surface)] p-3">
        <p className="text-sm font-black">Nhóm nguyên liệu</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {categories.length === 0 ? <span className="text-sm font-bold text-[var(--muted-foreground)]">Chưa có nhóm.</span> : null}
          {categories.map((category) => <Badge key={category.id} tone="blue">{category.name}</Badge>)}
        </div>
      </div>
    </section>
  );
}

function IngredientDrawer({ drawer, categories, onClose }: { drawer: DrawerState; categories: InventoryCategory[]; onClose: () => void }) {
  if (!drawer) return null;
  const ingredient = drawer?.mode === "edit" ? drawer.ingredient : null;
  return (
    <DashboardDrawer
      open
      onClose={onClose}
      title={ingredient?.name ?? "Nguyên liệu mới"}
      subtitle={ingredient ? "Sửa nguyên liệu" : "Thêm nguyên liệu"}
      width="md"
      closeLabel="Đóng nguyên liệu"
    >
        <form action={ingredient ? updateInventoryIngredientAction : createInventoryIngredientAction} className="grid gap-3">
          {ingredient ? <input type="hidden" name="ingredientId" value={ingredient.id} /> : null}
          {ingredient ? <input type="hidden" name="onHandQuantity" value={ingredient.onHandQuantity} /> : null}
          <Input name="name" defaultValue={ingredient?.name ?? ""} placeholder="Tên nguyên liệu" required />
          <div className="grid gap-3 sm:grid-cols-2">
            <select name="categoryId" defaultValue={ingredient?.categoryId ?? ""} className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold">
              <option value="">Chưa nhóm</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <Input name="unit" defaultValue={ingredient?.unit ?? ""} placeholder="Đơn vị: kg, l, cái..." required />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {!ingredient ? <Input name="onHandQuantity" type="number" min="0" step="0.001" placeholder="Tồn đầu" required /> : null}
            <Input name="minimumQuantity" type="number" min="0" step="0.001" defaultValue={ingredient?.minimumQuantity ?? ""} placeholder="Min cảnh báo" required />
            <Input name="referenceUnitCost" type="number" min="0" step="1" defaultValue={ingredient?.referenceUnitCost ?? ""} placeholder="Giá vốn" required />
            <Input name="reorderLeadDays" type="number" min="0" max="60" step="1" defaultValue={ingredient?.reorderLeadDays || ""} placeholder="Lead ngày" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input name="storageArea" defaultValue={ingredient?.storageArea ?? ""} placeholder="Khu vực: Kho khô" />
            <Input name="shelfCode" defaultValue={ingredient?.shelfCode ?? ""} placeholder="Kệ: A-02" />
          </div>
          <Textarea name="storageNote" defaultValue={ingredient?.storageNote ?? ""} placeholder="Ghi chú vị trí hoặc kiểm soát" />
          <div className="mt-2 flex gap-2">
            <SubmitButton className="flex-1 rounded-2xl" pendingLabel={ingredient ? "Đang lưu..." : "Đang thêm..."}>
              {ingredient ? "Lưu thay đổi" : "Thêm nguyên liệu"}
            </SubmitButton>
            {ingredient ? (
              <button form={`archive-${ingredient.id}`} type="submit" className="inline-flex h-11 items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 text-sm font-black text-red-700">
                <Trash2 className="h-4 w-4" /> Xóa
              </button>
            ) : null}
          </div>
        </form>
        {ingredient ? (
          <form id={`archive-${ingredient.id}`} action={deactivateInventoryIngredientAction}>
            <input type="hidden" name="ingredientId" value={ingredient.id} />
          </form>
        ) : null}
    </DashboardDrawer>
  );
}

function StockOperationsControlCenter({
  warehouse,
  rows
}: {
  warehouse: InventoryWarehouseCommandCenter;
  rows: InventoryStockBalance[];
}) {
  const lowRows = rows.filter((row) => row.status === "low" || row.status === "out_of_stock" || (row.minimumQuantity > 0 && row.availableQuantity <= row.minimumQuantity));
  const reservedRows = rows.filter((row) => row.reservedQuantity > 0);
  const incomingRows = rows.filter((row) => row.incomingQuantity > 0);
  const expiringRows = rows
    .map((row) => ({ row, days: daysUntilDate(row.expirationDate) }))
    .filter((item): item is { row: InventoryStockBalance; days: number } => item.days !== null && item.row.availableQuantity > 0 && item.days <= 7)
    .sort((a, b) => a.days - b.days);
  const stockValue = rows.reduce((sum, row) => sum + row.availableQuantity * row.referenceUnitCost, 0);
  const locationNames = new Set(rows.map((row) => row.locationName || row.branchName || "Kho chính"));
  const readinessScore = Math.max(
    35,
    100 -
      lowRows.length * 7 -
      expiringRows.filter((item) => item.days <= 0).length * 10 -
      expiringRows.filter((item) => item.days > 0).length * 4 -
      (warehouse.schemaReady ? 0 : 12)
  );
  const readinessTone = readinessScore >= 82 ? "green" : readinessScore >= 62 ? "yellow" : "red";
  const controlChecks = [
    {
      id: "schema",
      label: "Warehouse v2",
      value: warehouse.schemaReady ? "Sẵn sàng" : "V1 fallback",
      done: warehouse.schemaReady
    },
    {
      id: "low",
      label: "Không thiếu hàng",
      value: lowRows.length.toLocaleString("vi-VN"),
      done: lowRows.length === 0
    },
    {
      id: "expired",
      label: "Không có lô quá hạn",
      value: expiringRows.filter((item) => item.days <= 0).length.toLocaleString("vi-VN"),
      done: expiringRows.every((item) => item.days > 0)
    },
    {
      id: "reserved",
      label: "Reserved được theo dõi",
      value: reservedRows.length.toLocaleString("vi-VN"),
      done: reservedRows.length === 0 || warehouse.schemaReady
    }
  ];

  return (
    <div className="mb-4 rounded-3xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
      <div className="grid gap-3 xl:grid-cols-[0.72fr_1.28fr]">
        <div className="rounded-2xl bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--primary)]">Stock control</p>
              <h3 className="mt-1 text-lg font-black">Sức kho theo ca</h3>
            </div>
            <Badge tone={readinessTone}>Ready {readinessScore}/100</Badge>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <MiniMetric label="Giá trị khả dụng" value={formatVnd(Math.round(stockValue))} />
            <MiniMetric label="Vùng kho" value={locationNames.size.toLocaleString("vi-VN")} />
            <MiniMetric label="Đang giữ hàng" value={reservedRows.length.toLocaleString("vi-VN")} />
            <MiniMetric label="Sắp nhập" value={incomingRows.length.toLocaleString("vi-VN")} />
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-black">Checklist mở ca kho</p>
              <Badge tone={controlChecks.every((item) => item.done) ? "green" : "yellow"}>
                {controlChecks.filter((item) => !item.done).length || "Xong"}
              </Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {controlChecks.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--soft-surface)] px-3 py-2">
                  <span className="truncate text-xs font-black">{item.label}</span>
                  <Badge tone={item.done ? "green" : "yellow"}>{item.value}</Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-black">Hàng cần xử lý trước</p>
              <Badge tone={lowRows.length + expiringRows.length > 0 ? "red" : "green"}>{lowRows.length + expiringRows.length}</Badge>
            </div>
            <div className="space-y-2">
              {[...expiringRows.map((item) => item.row), ...lowRows].slice(0, 3).map((row) => (
                <div key={`${row.id}:risk`} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--soft-surface)] px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-black">{row.ingredientName}</p>
                    <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">{row.locationName || "Kho chính"} · min {formatQuantity(row.minimumQuantity, row.ingredientUnit)}</p>
                  </div>
                  <Badge tone={stockStatusTone(row.status)}>{formatQuantity(row.availableQuantity, row.ingredientUnit)}</Badge>
                </div>
              ))}
              {lowRows.length + expiringRows.length === 0 ? (
                <p className="rounded-xl bg-[var(--soft-surface)] px-3 py-2 text-sm font-bold text-[var(--muted-foreground)]">Không có dòng tồn cần xử lý ngay.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WasteLossCommandCenter({
  stockRows,
  expiringRows,
  expiredRows,
  lossValue,
  expiringValue,
  intelligence
}: {
  stockRows: InventoryStockBalance[];
  expiringRows: Array<{ row: InventoryStockBalance; days: number }>;
  expiredRows: Array<{ row: InventoryStockBalance; days: number }>;
  lossValue: number;
  expiringValue: number;
  intelligence: InventoryIntelligence;
}) {
  const highWasteSignals = intelligence.wasteSignals.filter((item) => item.wasteCost > 200000);
  const safeRows = stockRows.filter((row) => row.availableQuantity > 0 && daysUntilDate(row.expirationDate) === null);
  const closureScore = Math.max(
    40,
    100 - expiredRows.length * 12 - expiringRows.filter((item) => item.days > 0).length * 5 - highWasteSignals.length * 8
  );
  const closureTone = closureScore >= 85 ? "green" : closureScore >= 65 ? "yellow" : "red";
  const checks = [
    {
      id: "expired",
      label: "Quá hạn đã xử lý",
      value: expiredRows.length.toLocaleString("vi-VN"),
      done: expiredRows.length === 0
    },
    {
      id: "expiring",
      label: "Sắp HSD dưới 7 ngày",
      value: expiringRows.filter((item) => item.days > 0).length.toLocaleString("vi-VN"),
      done: expiringRows.filter((item) => item.days > 0).length === 0
    },
    {
      id: "waste",
      label: "Waste cao cần xem",
      value: highWasteSignals.length.toLocaleString("vi-VN"),
      done: highWasteSignals.length === 0
    },
    {
      id: "safe",
      label: "Dòng tồn không HSD",
      value: safeRows.length.toLocaleString("vi-VN"),
      done: safeRows.length === 0
    }
  ];

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Loss prevention</p>
          <h2 className="mt-1 text-xl font-black">Trung tâm kiểm soát HSD và hao hụt</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={closureTone}>Close {closureScore}/100</Badge>
          <Badge tone={expiredRows.length > 0 ? "red" : "green"}>{expiredRows.length} quá hạn</Badge>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[0.75fr_1.25fr]">
        <div className="grid gap-2 sm:grid-cols-2">
          <MiniMetric label="Rủi ro HSD" value={formatVnd(Math.round(expiringValue))} />
          <MiniMetric label="Waste 30 ngày" value={formatVnd(lossValue)} />
          <MiniMetric label="SKU waste cao" value={highWasteSignals.length.toLocaleString("vi-VN")} />
          <MiniMetric label="Dòng cần xem" value={expiringRows.length.toLocaleString("vi-VN")} />
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-black">Checklist đóng ca</p>
              <Badge tone={checks.every((item) => item.done) ? "green" : "yellow"}>{checks.filter((item) => !item.done).length || "Xong"}</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {checks.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
                  <span className="truncate text-xs font-black">{item.label}</span>
                  <Badge tone={item.done ? "green" : "yellow"}>{item.value}</Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-black">Ưu tiên xử lý</p>
              <Badge tone={expiringRows.length > 0 ? "red" : "green"}>{expiringRows.length || "Ổn"}</Badge>
            </div>
            <div className="space-y-2">
              {expiringRows.slice(0, 3).map(({ row, days }) => (
                <div key={`${row.id}:expiry-command`} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--soft-surface)] px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-black">{row.ingredientName}</p>
                    <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">{row.locationName || "Kho chính"} · {formatQuantity(row.availableQuantity, row.ingredientUnit)}</p>
                  </div>
                  <Badge tone={days <= 0 ? "red" : "yellow"}>{expirationCopy(row.expirationDate)}</Badge>
                </div>
              ))}
              {expiringRows.length === 0 ? (
                <p className="rounded-xl bg-[var(--soft-surface)] px-3 py-2 text-sm font-bold text-[var(--muted-foreground)]">Không có lô sát HSD trong 7 ngày.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function WarehouseStockBoard({ warehouse, ingredients }: { warehouse: InventoryWarehouseCommandCenter; ingredients: InventoryIngredient[] }) {
  const rows =
    warehouse.stockBalances.length > 0
      ? warehouse.stockBalances
      : ingredients.slice(0, 24).map((ingredient) => ({
          id: ingredient.id,
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          ingredientUnit: ingredient.unit,
          locationId: null,
          batchId: null,
          branchName: null,
          locationName: locationLabel(ingredient),
          batchCode: null,
          expirationDate: null,
          onHandQuantity: ingredient.onHandQuantity,
          reservedQuantity: 0,
          incomingQuantity: 0,
          availableQuantity: ingredient.onHandQuantity,
          minimumQuantity: ingredient.minimumQuantity,
          referenceUnitCost: ingredient.referenceUnitCost,
          status: ingredient.minimumQuantity > 0 && ingredient.onHandQuantity <= ingredient.minimumQuantity ? ("low" as const) : ("available" as const)
        }));

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Stock board</p>
          <h2 className="mt-1 text-xl font-black">Tồn khả dụng theo kho, lô và chi nhánh</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={warehouse.schemaReady ? "green" : "yellow"}>{warehouse.schemaReady ? "Warehouse v2 sẵn sàng" : "Đang dùng tồn v1"}</Badge>
          <Badge tone="blue">{warehouse.stockBalanceCount.toLocaleString("vi-VN")} balance</Badge>
        </div>
      </div>
      <StockOperationsControlCenter warehouse={warehouse} rows={rows} />
      <div className="hidden overflow-hidden rounded-2xl border border-[var(--border)] xl:block">
        <div className="grid grid-cols-[1.1fr_0.8fr_0.7fr_0.65fr_0.65fr_0.65fr_0.65fr] bg-[var(--surface-container-high)] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          <span>Nguyên liệu</span>
          <span>Kho / chi nhánh</span>
          <span>Lô</span>
          <span>Available</span>
          <span>Reserved</span>
          <span>Incoming</span>
          <span>Trạng thái</span>
        </div>
        <div className="max-h-[520px] divide-y divide-[var(--border)] overflow-auto">
          {rows.length === 0 ? (
            <p className="p-4 text-sm font-bold text-[var(--muted-foreground)]">Chưa có stock balance.</p>
          ) : (
            rows.map((row) => (
              <div key={row.id} className="grid grid-cols-[1.1fr_0.8fr_0.7fr_0.65fr_0.65fr_0.65fr_0.65fr] items-center px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-black">{row.ingredientName}</p>
                  <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">Min {formatQuantity(row.minimumQuantity, row.ingredientUnit)}</p>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-bold">{row.locationName || "Kho chính"}</p>
                  <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">{row.branchName || "Toàn quán"}</p>
                </div>
                <span className="truncate font-semibold text-[var(--muted-foreground)]">{row.batchCode || row.expirationDate || "Không lô"}</span>
                <span className="metric-number font-black">{formatQuantity(row.availableQuantity, row.ingredientUnit)}</span>
                <span className="font-bold">{formatQuantity(row.reservedQuantity, row.ingredientUnit)}</span>
                <span className="font-bold text-[var(--primary)]">{formatQuantity(row.incomingQuantity, row.ingredientUnit)}</span>
                <Badge tone={stockStatusTone(row.status)}>{stockStatusLabel(row.status)}</Badge>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="grid gap-3 xl:hidden">
        {rows.map((row) => (
          <article key={row.id} className="rounded-2xl border border-[var(--border)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-black">{row.ingredientName}</p>
                <p className="truncate text-sm font-semibold text-[var(--muted-foreground)]">{row.locationName || "Kho chính"} · {row.branchName || "Toàn quán"}</p>
              </div>
              <Badge tone={stockStatusTone(row.status)}>{stockStatusLabel(row.status)}</Badge>
            </div>
            <p className="mt-2 text-sm font-bold">
              Available {formatQuantity(row.availableQuantity, row.ingredientUnit)} · reserved {formatQuantity(row.reservedQuantity, row.ingredientUnit)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function WasteExpirationDesk({
  warehouse,
  ingredients,
  intelligence
}: {
  warehouse: InventoryWarehouseCommandCenter;
  ingredients: InventoryIngredient[];
  intelligence: InventoryIntelligence;
}) {
  const stockRows = useMemo<InventoryStockBalance[]>(
    () =>
      warehouse.stockBalances.length > 0
        ? warehouse.stockBalances.filter((row) => row.onHandQuantity > 0 || row.availableQuantity > 0)
        : ingredients.slice(0, 30).map((ingredient) => ({
            id: ingredient.id,
            ingredientId: ingredient.id,
            ingredientName: ingredient.name,
            ingredientUnit: ingredient.unit,
            locationId: null,
            batchId: null,
            branchName: null,
            locationName: locationLabel(ingredient),
            batchCode: null,
            expirationDate: null,
            onHandQuantity: ingredient.onHandQuantity,
            reservedQuantity: 0,
            incomingQuantity: 0,
            availableQuantity: ingredient.onHandQuantity,
            minimumQuantity: ingredient.minimumQuantity,
            referenceUnitCost: ingredient.referenceUnitCost,
            status: ingredient.minimumQuantity > 0 && ingredient.onHandQuantity <= ingredient.minimumQuantity ? "low" : "available"
          })),
    [ingredients, warehouse.stockBalances]
  );
  const [selectedStockId, setSelectedStockId] = useState(stockRows[0]?.id ?? "");
  const [movementType, setMovementType] = useState<LossMovementType>("waste");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const selectedRow = stockRows.find((row) => row.id === selectedStockId) ?? stockRows[0] ?? null;
  const selectedMovement = lossMovementTypes.find((item) => item.value === movementType);
  const parsedQuantity = parseNumber(quantity);
  const isOverAvailable = Boolean(selectedRow && parsedQuantity > selectedRow.availableQuantity);
  const expiringRows = stockRows
    .map((row) => ({ row, days: daysUntilDate(row.expirationDate) }))
    .filter((item): item is { row: InventoryStockBalance; days: number } => item.days !== null && item.row.availableQuantity > 0 && item.days <= 7)
    .sort((a, b) => a.days - b.days)
    .slice(0, 12);
  const expiredRows = expiringRows.filter((item) => item.days <= 0);
  const expiringValue = expiringRows.reduce((sum, item) => sum + item.row.availableQuantity * item.row.referenceUnitCost, 0);
  const lossValue = intelligence.wasteSignals.reduce((sum, item) => sum + item.wasteCost, 0);

  const primeLossForm = (row: InventoryStockBalance, nextType: LossMovementType) => {
    setSelectedStockId(row.id);
    setMovementType(nextType);
    setQuantity(String(Math.max(0, row.availableQuantity)));
    setReason(
      nextType === "expired"
        ? `Loại hàng hết hạn${row.batchCode ? ` lô ${row.batchCode}` : ""}${row.expirationDate ? `, HSD ${row.expirationDate}` : ""}`
        : ""
    );
  };

  return (
    <div className="grid gap-4">
      <WasteLossCommandCenter
        stockRows={stockRows}
        expiringRows={expiringRows}
        expiredRows={expiredRows}
        lossValue={lossValue}
        expiringValue={expiringValue}
        intelligence={intelligence}
      />
      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Hao hụt & HSD</p>
            <h2 className="mt-1 text-xl font-black">Ghi nhận xuất giảm theo kho và lô</h2>
          </div>
          <Badge tone={stockRows.length > 0 ? "green" : "yellow"}>{stockRows.length} dòng tồn</Badge>
        </div>

        <form action={recordInventoryMovementAction} className="grid gap-3 rounded-2xl bg-[var(--soft-surface)] p-3">
          <input type="hidden" name="ingredientId" value={selectedRow?.ingredientId ?? ""} />
          <input type="hidden" name="locationId" value={selectedRow?.locationId ?? ""} />
          <input type="hidden" name="batchId" value={selectedRow?.batchId ?? ""} />
          <input type="hidden" name="stockBalanceId" value={selectedRow?.id ?? ""} />
          <input type="hidden" name="unitCost" value={selectedRow?.referenceUnitCost ? Math.round(selectedRow.referenceUnitCost) : ""} />
          <div className="grid gap-2">
            <select
              value={selectedRow?.id ?? ""}
              onChange={(event) => setSelectedStockId(event.target.value)}
              className="h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-bold"
            >
              {stockRows.length === 0 ? <option value="">Chưa có tồn khả dụng</option> : null}
              {stockRows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.ingredientName} · {row.locationName || "Kho chính"} · {row.batchCode || row.expirationDate || "Không lô"} · {formatQuantity(row.availableQuantity, row.ingredientUnit)}
                </option>
              ))}
            </select>
            <select
              name="movementType"
              value={movementType}
              onChange={(event) => setMovementType(event.target.value as LossMovementType)}
              className="h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-bold"
            >
              {lossMovementTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2 sm:grid-cols-[0.8fr_1.2fr]">
            <Input
              name="quantity"
              type="number"
              min="0.001"
              step="0.001"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder={selectedRow ? `Số lượng (${selectedRow.ingredientUnit})` : "Số lượng"}
              className="h-11 rounded-xl bg-white"
            />
            <Textarea
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={selectedMovement?.hint ?? "Lý do xuất giảm"}
              className="min-h-11 rounded-xl bg-white"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <MiniMetric label="Khả dụng" value={selectedRow ? formatQuantity(selectedRow.availableQuantity, selectedRow.ingredientUnit) : "-"} />
            <MiniMetric label="Giá trị ghi nhận" value={selectedRow ? formatVnd(Math.round(parsedQuantity * selectedRow.referenceUnitCost)) : formatVnd(0)} />
            <MiniMetric label="HSD" value={selectedRow?.expirationDate ? expirationCopy(selectedRow.expirationDate) : "Không lô"} />
          </div>

          {isOverAvailable ? (
            <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-black text-red-700">
              Số lượng vượt tồn khả dụng của dòng kho đã chọn.
            </p>
          ) : null}

          <SubmitButton disabled={!selectedRow || parsedQuantity <= 0 || isOverAvailable} pendingLabel="Đang ghi nhận..." className="h-11 rounded-2xl">
            <Trash2 className="h-4 w-4" />
            Ghi nhận xuất giảm
          </SubmitButton>
        </form>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <MiniMetric label="Waste 30 ngày" value={formatVnd(lossValue)} />
          <MiniMetric label="SKU có waste" value={intelligence.wasteSignals.length.toLocaleString("vi-VN")} />
        </div>

        <div className="mt-3 space-y-2">
          {intelligence.wasteSignals.length === 0 ? (
            <p className="rounded-2xl bg-[var(--soft-surface)] px-3 py-2 text-sm font-bold text-[var(--muted-foreground)]">Chưa có waste hoặc hết hạn đáng chú ý trong 30 ngày.</p>
          ) : (
            intelligence.wasteSignals.slice(0, 4).map((item) => (
              <div key={item.ingredientId} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--soft-surface)] px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-black">{item.name}</p>
                  <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">{formatQuantity(item.wasteQuantity, item.unit)} · {item.movementCount} lần</p>
                </div>
                <Badge tone={item.wasteCost > 200000 ? "red" : "yellow"}>{formatVnd(item.wasteCost)}</Badge>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Expiration desk</p>
            <h2 className="mt-1 text-xl font-black">Lô hết hạn và sắp hết hạn</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={expiredRows.length > 0 ? "red" : "green"}>{expiredRows.length} quá hạn</Badge>
            <Badge tone={expiringRows.length > 0 ? "yellow" : "green"}>{expiringRows.length} cần xem</Badge>
            <Badge tone="blue">{formatVnd(Math.round(expiringValue))}</Badge>
          </div>
        </div>

        {expiringRows.length === 0 ? (
          <EmptyState icon={PackageCheck} title="Không có lô sát HSD" description="Các batch còn tồn sẽ xuất hiện ở đây khi đã quá hạn hoặc còn dưới 7 ngày." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
            <div className="hidden grid-cols-[1fr_0.85fr_0.65fr_0.65fr_0.55fr] bg-[var(--surface-container-high)] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)] lg:grid">
              <span>Nguyên liệu / lô</span>
              <span>Kho</span>
              <span>HSD</span>
              <span>Tồn</span>
              <span>Hành động</span>
            </div>
            <div className="max-h-[520px] divide-y divide-[var(--border)] overflow-auto">
              {expiringRows.map(({ row, days }) => (
                <div key={row.id} className="grid gap-2 px-4 py-3 text-sm lg:grid-cols-[1fr_0.85fr_0.65fr_0.65fr_0.55fr] lg:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-black">{row.ingredientName}</p>
                    <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">Lô {row.batchCode || "không mã"} · {row.branchName || "Toàn quán"}</p>
                  </div>
                  <span className="truncate font-semibold text-[var(--muted-foreground)]">{row.locationName || "Kho chính"}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={days <= 0 ? "red" : "yellow"}>{expirationCopy(row.expirationDate)}</Badge>
                    {row.expirationDate ? <span className="text-xs font-bold text-[var(--muted-foreground)]">{formatDate(row.expirationDate)}</span> : null}
                  </div>
                  <span className="metric-number font-black">{formatQuantity(row.availableQuantity, row.ingredientUnit)}</span>
                  <Button type="button" size="sm" variant={days <= 0 ? "danger" : "secondary"} onClick={() => primeLossForm(row, "expired")} className="h-9 rounded-xl">
                    <Trash2 className="h-4 w-4" />
                    Ghi HSD
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}

function CountingControlCenter({
  warehouse,
  countLines,
  totalVarianceValue,
  selectedLocationName
}: {
  warehouse: InventoryWarehouseCommandCenter;
  countLines: CountDraftLine[];
  totalVarianceValue: number;
  selectedLocationName: string;
}) {
  const historicalVariance = warehouse.countSessions.reduce((sum, count) => sum + count.totalVarianceValue, 0);
  const adjustedLineCount = warehouse.countSessions.reduce((sum, count) => sum + count.adjustedLineCount, 0);
  const openSessions = warehouse.countSessions.filter((count) => count.status !== "applied");
  const highVarianceDrafts = countLines.filter((line) => Math.abs(line.countedQuantity - line.expectedQuantity) > 0);
  const countReadinessScore = Math.max(45, 100 - highVarianceDrafts.length * 8 - openSessions.length * 10 - (countLines.length === 0 ? 8 : 0));
  const countReadinessTone = countReadinessScore >= 85 ? "green" : countReadinessScore >= 65 ? "yellow" : "red";
  const checklist = [
    {
      id: "draft",
      label: "Phiếu có dòng đếm",
      value: countLines.length.toLocaleString("vi-VN"),
      done: countLines.length > 0
    },
    {
      id: "variance",
      label: "Dòng lệch cần xác nhận",
      value: highVarianceDrafts.length.toLocaleString("vi-VN"),
      done: highVarianceDrafts.length === 0
    },
    {
      id: "open",
      label: "Phiên treo",
      value: openSessions.length.toLocaleString("vi-VN"),
      done: openSessions.length === 0
    },
    {
      id: "location",
      label: "Kho đang kiểm",
      value: selectedLocationName,
      done: true
    }
  ];

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Kiểm kê</p>
          <h2 className="mt-1 text-xl font-black">Kiểm soát phiên kiểm kê và lệch tồn</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={countReadinessTone}>Sẵn sàng {countReadinessScore}/100</Badge>
          <Badge tone={highVarianceDrafts.length > 0 ? "yellow" : "green"}>{highVarianceDrafts.length} dòng lệch</Badge>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[0.76fr_1.24fr]">
        <div className="grid gap-2 sm:grid-cols-2">
          <MiniMetric label="Phiếu nháp" value={countLines.length.toLocaleString("vi-VN")} />
          <MiniMetric label="Ước tính lệch" value={formatVnd(totalVarianceValue)} />
          <MiniMetric label="Lệch lịch sử" value={formatVnd(historicalVariance)} />
          <MiniMetric label="Dòng đã chỉnh" value={adjustedLineCount.toLocaleString("vi-VN")} />
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-black">Checklist kiểm kê</p>
              <Badge tone={checklist.every((item) => item.done) ? "green" : "yellow"}>{checklist.filter((item) => !item.done).length || "Xong"}</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {checklist.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
                  <span className="truncate text-xs font-black">{item.label}</span>
                  <Badge tone={item.done ? "green" : "yellow"}>{item.value}</Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-black">Dòng lệch trong phiếu</p>
              <Badge tone={highVarianceDrafts.length > 0 ? "yellow" : "green"}>{highVarianceDrafts.length || "Không"}</Badge>
            </div>
            <div className="space-y-2">
              {highVarianceDrafts.slice(0, 3).map((line) => {
                const variance = line.countedQuantity - line.expectedQuantity;
                return (
                  <div key={`${line.locationId}:${line.ingredientId}:variance`} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--soft-surface)] px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-black">{line.name}</p>
                      <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">{line.locationName}</p>
                    </div>
                    <Badge tone={variance > 0 ? "blue" : "red"}>{variance > 0 ? "+" : ""}{formatQuantity(variance, line.unit)}</Badge>
                  </div>
                );
              })}
              {highVarianceDrafts.length === 0 ? (
                <p className="rounded-xl bg-[var(--soft-surface)] px-3 py-2 text-sm font-bold text-[var(--muted-foreground)]">Chưa có dòng lệch trong phiếu hiện tại.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TransferControlCenter({
  warehouse,
  transferReady,
  fromLocationId,
  toLocationId,
  transferLines,
  availableFromSource,
  selectedIngredient
}: {
  warehouse: InventoryWarehouseCommandCenter;
  transferReady: boolean;
  fromLocationId: string;
  toLocationId: string;
  transferLines: TransferDraftLine[];
  availableFromSource: number;
  selectedIngredient: InventoryIngredient | null;
}) {
  const fromLocation = warehouse.locations.find((location) => location.id === fromLocationId);
  const toLocation = warehouse.locations.find((location) => location.id === toLocationId);
  const routeReady = Boolean(fromLocationId && toLocationId && fromLocationId !== toLocationId);
  const routeLabel = routeReady
    ? `${fromLocation?.name ?? "Kho xuất"} > ${toLocation?.name ?? "Kho nhận"}`
    : "Chưa chọn tuyến";
  const openTransfers = warehouse.transfers.filter((transfer) => transfer.status !== "received" && transfer.status !== "cancelled");
  const draftQuantity = transferLines.reduce((sum, line) => sum + line.quantity, 0);
  const sourceBlocked = Boolean(selectedIngredient && parseNumber(String(draftQuantity || 0)) > availableFromSource && transferLines.some((line) => line.ingredientId === selectedIngredient.id));
  const transferScore = Math.max(40, 100 - (transferReady ? 0 : 18) - (routeReady ? 0 : 14) - openTransfers.length * 5 - (sourceBlocked ? 15 : 0));
  const transferTone = transferScore >= 85 ? "green" : transferScore >= 65 ? "yellow" : "red";
  const checklist = [
    {
      id: "locations",
      label: "Có ít nhất 2 kho",
      value: warehouse.locations.length.toLocaleString("vi-VN"),
      done: transferReady
    },
    {
      id: "route",
      label: "Tuyến hợp lệ",
      value: routeReady ? "OK" : "Thiếu",
      done: routeReady
    },
    {
      id: "draft",
      label: "Phiếu có dòng",
      value: transferLines.length.toLocaleString("vi-VN"),
      done: transferLines.length > 0
    },
    {
      id: "open",
      label: "Phiếu mở cần theo dõi",
      value: openTransfers.length.toLocaleString("vi-VN"),
      done: openTransfers.length === 0
    }
  ];

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Chuyển kho</p>
          <h2 className="mt-1 text-xl font-black">Điều phối luồng chuyển kho</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={transferTone}>Sẵn sàng {transferScore}/100</Badge>
          <Badge tone={routeReady ? "green" : "yellow"}>{routeLabel}</Badge>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[0.76fr_1.24fr]">
        <div className="grid gap-2 sm:grid-cols-2">
          <MiniMetric label="Phiếu nháp" value={transferLines.length.toLocaleString("vi-VN")} />
          <MiniMetric label="Tổng lượng nháp" value={draftQuantity.toLocaleString("vi-VN")} />
          <MiniMetric label="Phiếu mở" value={openTransfers.length.toLocaleString("vi-VN")} />
          <MiniMetric label="Khả dụng đang chọn" value={selectedIngredient ? formatQuantity(availableFromSource, selectedIngredient.unit) : "-"} />
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-black">Checklist điều chuyển</p>
              <Badge tone={checklist.every((item) => item.done) ? "green" : "yellow"}>{checklist.filter((item) => !item.done).length || "Xong"}</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {checklist.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
                  <span className="truncate text-xs font-black">{item.label}</span>
                  <Badge tone={item.done ? "green" : "yellow"}>{item.value}</Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-black">Phiếu mở gần đây</p>
              <Badge tone={openTransfers.length > 0 ? "blue" : "green"}>{openTransfers.length || "Không"}</Badge>
            </div>
            <div className="space-y-2">
              {openTransfers.slice(0, 3).map((transfer) => (
                <div key={`${transfer.id}:open-command`} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--soft-surface)] px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-black">{transfer.transferNumber}</p>
                    <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">{transfer.fromLocationName || "Kho xuất"} &gt; {transfer.toLocationName || "Kho nhận"}</p>
                  </div>
                  <Badge tone={workflowStatusTone(transfer.status)}>{transfer.lineCount} dòng</Badge>
                </div>
              ))}
              {openTransfers.length === 0 ? (
                <p className="rounded-xl bg-[var(--soft-surface)] px-3 py-2 text-sm font-bold text-[var(--muted-foreground)]">Không có phiếu điều chuyển đang treo.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function InventoryCountingDesk({ warehouse, ingredients }: { warehouse: InventoryWarehouseCommandCenter; ingredients: InventoryIngredient[] }) {
  const [countDraftSeed] = useState(() => readInventoryDraft<CountDraftSnapshot>(COUNT_DRAFT_KEY));
  const [locationId, setLocationId] = useState(() => countDraftSeed?.locationId ?? warehouse.locations[0]?.id ?? "");
  const [ingredientId, setIngredientId] = useState(ingredients[0]?.id ?? "");
  const [countedQuantity, setCountedQuantity] = useState("");
  const [countSearch, setCountSearch] = useState("");
  const [sessionNote, setSessionNote] = useState("");
  const [lineNote, setLineNote] = useState("");
  const [countLines, setCountLines] = useState<CountDraftLine[]>(() => (Array.isArray(countDraftSeed?.lines) ? countDraftSeed.lines : []));

  useEffect(() => {
    writeInventoryDraft(COUNT_DRAFT_KEY, { locationId, lines: countLines });
  }, [countLines, locationId]);
  const selectedIngredient = ingredients.find((ingredient) => ingredient.id === ingredientId) ?? null;
  const countIngredientOptions = ingredients.filter((ingredient) => ingredientMatchesQuery(ingredient, countSearch)).slice(0, 80);
  const selectedLocation = warehouse.locations.find((location) => location.id === locationId) ?? null;
  const selectedLocationName = selectedLocation ? `${selectedLocation.name}${selectedLocation.branchName ? ` · ${selectedLocation.branchName}` : ""}` : "Kho chính";
  const expectedQuantity = selectedIngredient
    ? warehouse.stockBalances.find((balance) => balance.ingredientId === selectedIngredient.id && (!locationId || balance.locationId === locationId))?.onHandQuantity ?? selectedIngredient.onHandQuantity
    : 0;
  const countRowsJson = useMemo(
    () =>
      JSON.stringify(
        countLines.map((line) => ({
          ingredientId: line.ingredientId,
          countedQuantity: line.countedQuantity,
          locationId: line.locationId,
          note: line.note
        }))
      ),
    [countLines]
  );
  const totalVarianceValue = countLines.reduce((sum, line) => {
    const ingredient = ingredients.find((item) => item.id === line.ingredientId);
    return sum + Math.round(Math.abs(line.countedQuantity - line.expectedQuantity) * (ingredient?.referenceUnitCost ?? 0));
  }, 0);

  const addCountLine = () => {
    if (!selectedIngredient) return;
    const quantity = parseNumber(countedQuantity);
    if (quantity < 0) return;
    const nextLine: CountDraftLine = {
      ingredientId: selectedIngredient.id,
      name: selectedIngredient.name,
      unit: selectedIngredient.unit,
      locationId,
      locationName: selectedLocationName,
      expectedQuantity,
      countedQuantity: quantity,
      note: lineNote.trim() || undefined
    };
    setCountLines((current) => [
      ...current.filter((line) => line.ingredientId !== nextLine.ingredientId || line.locationId !== nextLine.locationId),
      nextLine
    ]);
    setCountedQuantity("");
    setLineNote("");
  };

  return (
    <div className="grid gap-4">
      <CountingControlCenter
        warehouse={warehouse}
        countLines={countLines}
        totalVarianceValue={totalVarianceValue}
        selectedLocationName={selectedLocationName}
      />
      <div className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
      <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Kiểm kê nhanh</p>
            <h2 className="mt-1 text-xl font-black">Nhập số thực tế và chốt lệch kho</h2>
          </div>
          <Badge tone="blue">Mobile-ready</Badge>
        </div>
        <form action={applyInventoryCountAction} className="grid gap-3 rounded-2xl bg-[var(--soft-surface)] p-3">
          <input type="hidden" name="rowsJson" value={countRowsJson} />
          <input type="hidden" name="locationId" value={locationId} />
          <div className="grid gap-2 lg:grid-cols-[1fr_0.85fr]">
            <Input name="title" placeholder="Tên phiên: Kiểm kê cuối ca" className="h-10 rounded-xl bg-white" />
            <select
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              disabled={countLines.length > 0}
              className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-bold"
            >
              <option value="">Kho chính</option>
              {warehouse.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}{location.branchName ? ` · ${location.branchName}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 lg:grid-cols-[1.15fr_0.55fr]">
            <Input
              value={countSearch}
              onChange={(event) => {
                const next = event.target.value;
                setCountSearch(next);
                const matched = ingredients.find((ingredient) => ingredientMatchesQuery(ingredient, next));
                if (matched) setIngredientId(matched.id);
              }}
              placeholder="Scan barcode/SKU hoặc tìm tên"
              className="h-10 rounded-xl bg-white lg:col-span-2"
            />
            <select
              name="ingredientId"
              value={ingredientId}
              onChange={(event) => setIngredientId(event.target.value)}
              className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-bold"
            >
              <option value="">Scan/tìm nguyên liệu</option>
              {countIngredientOptions.map((ingredient) => (
                <option key={ingredient.id} value={ingredient.id}>
                  {ingredient.name}{ingredient.sku ? ` · ${ingredient.sku}` : ""}{ingredient.barcode ? ` · ${ingredient.barcode}` : ""} ({ingredient.unit})
                </option>
              ))}
            </select>
            <Input
              name="countedQuantity"
              type="number"
              min="0"
              step="0.001"
              placeholder={selectedIngredient ? `Thực tế (${selectedIngredient.unit})` : "SL thực tế"}
              value={countedQuantity}
              onChange={(event) => setCountedQuantity(event.target.value)}
              className="h-10 rounded-xl bg-white"
            />
          </div>
          <Textarea
            name="note"
            placeholder="Ghi chú chung cho phiên kiểm kê"
            value={sessionNote}
            onChange={(event) => setSessionNote(event.target.value)}
            className="min-h-16 rounded-xl bg-white"
          />
          <Input
            placeholder="Ghi chú dòng đang đếm (tùy chọn)"
            value={lineNote}
            onChange={(event) => setLineNote(event.target.value)}
            className="h-10 rounded-xl bg-white"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-bold text-[var(--muted-foreground)]">
            <span>Dự kiến hệ thống: {selectedIngredient ? formatQuantity(expectedQuantity, selectedIngredient.unit) : "-"}</span>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setCountLines([])} disabled={countLines.length === 0} className="h-9 rounded-xl">
                Xóa nháp
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={addCountLine} disabled={!selectedIngredient || countedQuantity.trim().length === 0} className="h-9 rounded-xl">
                <PackagePlus className="h-4 w-4" />
                Thêm dòng
              </Button>
            </div>
          </div>
          <DraftLinesPanel
            emptyIcon={ClipboardList}
            emptyTitle="Chưa có dòng kiểm kê"
            emptyDescription="Thêm từng nguyên liệu vào phiếu nháp, sau đó áp dụng một lần để tạo count session và movement điều chỉnh."
          >
            {countLines.map((line) => {
              const variance = line.countedQuantity - line.expectedQuantity;
              return (
                <div key={`${line.locationId || "main"}:${line.ingredientId}`} className="grid gap-2 px-3 py-2 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-black">{line.name}</p>
                    <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">
                      {line.locationName} · hệ thống {formatQuantity(line.expectedQuantity, line.unit)} · thực tế {formatQuantity(line.countedQuantity, line.unit)}
                    </p>
                  </div>
                  <Badge tone={variance === 0 ? "green" : variance > 0 ? "blue" : "red"}>
                    {variance > 0 ? "+" : ""}{formatQuantity(variance, line.unit)}
                  </Badge>
                  <button type="button" onClick={() => setCountLines((current) => current.filter((item) => item.ingredientId !== line.ingredientId || item.locationId !== line.locationId))} className="h-9 rounded-xl px-3 text-xs font-black text-red-700">
                    Xóa
                  </button>
                </div>
              );
            })}
          </DraftLinesPanel>
          <div className="grid gap-2 sm:grid-cols-2">
            <MiniMetric label="Dòng trong phiếu" value={countLines.length.toLocaleString("vi-VN")} />
            <MiniMetric label="Ước tính lệch" value={formatVnd(totalVarianceValue)} />
          </div>
          <SubmitButton disabled={countLines.length === 0} pendingLabel="Đang áp dụng..." className="h-11 rounded-2xl">
            <ClipboardCheck className="h-4 w-4" />
            Áp dụng {countLines.length.toLocaleString("vi-VN")} dòng kiểm kê
          </SubmitButton>
        </form>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <MiniMetric label="Phiên gần đây" value={warehouse.countSessions.length.toLocaleString("vi-VN")} />
          <MiniMetric
            label="Dòng đã chỉnh"
            value={warehouse.countSessions.reduce((sum, count) => sum + count.adjustedLineCount, 0).toLocaleString("vi-VN")}
          />
          <MiniMetric
            label="Giá trị lệch"
            value={formatVnd(warehouse.countSessions.reduce((sum, count) => sum + count.totalVarianceValue, 0))}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Count ledger</p>
            <h2 className="mt-1 text-xl font-black">Phiên kiểm kê gần đây</h2>
          </div>
          <Badge tone={warehouse.countSessions.length > 0 ? "green" : "neutral"}>{warehouse.countSessions.length} phiên</Badge>
        </div>
        {warehouse.countSessions.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Chưa có phiên kiểm kê" description="Khi áp dụng kiểm kê, hệ thống sẽ ghi count line và movement điều chỉnh để audit được chênh lệch." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
            <div className="hidden grid-cols-[1fr_0.8fr_0.6fr_0.7fr_0.8fr] bg-[var(--surface-container-high)] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)] md:grid">
              <span>Phiên</span>
              <span>Kho</span>
              <span>Trạng thái</span>
              <span>Lệch</span>
              <span>Thời gian</span>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {warehouse.countSessions.map((count) => (
                <div key={count.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_0.8fr_0.6fr_0.7fr_0.8fr] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-black">{count.title}</p>
                    <p className="text-xs font-semibold text-[var(--muted-foreground)]">{count.lineCount} dòng · {count.adjustedLineCount} chỉnh</p>
                  </div>
                  <span className="truncate font-semibold text-[var(--muted-foreground)]">{count.locationName || "Kho chính"}</span>
                  <Badge tone={workflowStatusTone(count.status)}>{countStatusLabel(count.status)}</Badge>
                  <span className="metric-number font-black">{formatVnd(count.totalVarianceValue)}</span>
                  <span className="font-semibold text-[var(--muted-foreground)]">{formatDateTime(count.appliedAt || count.startedAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}

function InventoryTransferDesk({ warehouse, ingredients }: { warehouse: InventoryWarehouseCommandCenter; ingredients: InventoryIngredient[] }) {
  const transferReady = warehouse.locations.length >= 2 && ingredients.length > 0;
  const [transferDraftSeed] = useState(() => readInventoryDraft<TransferDraftSnapshot>(TRANSFER_DRAFT_KEY));
  const [fromLocationId, setFromLocationId] = useState(() => transferDraftSeed?.fromLocationId ?? warehouse.locations[0]?.id ?? "");
  const [toLocationId, setToLocationId] = useState(
    () => transferDraftSeed?.toLocationId ?? warehouse.locations.find((location) => location.id !== (transferDraftSeed?.fromLocationId ?? warehouse.locations[0]?.id))?.id ?? ""
  );
  const [ingredientId, setIngredientId] = useState(ingredients[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState(ingredients[0]?.unit ?? "");
  const [transferNote, setTransferNote] = useState(() => transferDraftSeed?.note ?? "");
  const [lineNote, setLineNote] = useState("");
  const [transferSearch, setTransferSearch] = useState("");
  const [transferLines, setTransferLines] = useState<TransferDraftLine[]>(() => (Array.isArray(transferDraftSeed?.lines) ? transferDraftSeed.lines : []));
  const selectedIngredient = ingredients.find((ingredient) => ingredient.id === ingredientId) ?? null;
  const transferIngredientOptions = ingredients.filter((ingredient) => ingredientMatchesQuery(ingredient, transferSearch)).slice(0, 80);

  useEffect(() => {
    writeInventoryDraft(TRANSFER_DRAFT_KEY, { fromLocationId, toLocationId, note: transferNote, lines: transferLines });
  }, [fromLocationId, toLocationId, transferLines, transferNote]);
  const transferRowsJson = useMemo(
    () =>
      JSON.stringify(
        transferLines.map((line) => ({
          ingredientId: line.ingredientId,
          quantity: line.quantity,
          unit: line.unit,
          note: line.note
        }))
      ),
    [transferLines]
  );
  const availableFromSource = selectedIngredient
    ? warehouse.stockBalances.find((balance) => balance.ingredientId === selectedIngredient.id && balance.locationId === fromLocationId)?.availableQuantity ?? selectedIngredient.onHandQuantity
    : 0;
  const transferStageCounts = {
    requested: warehouse.transfers.filter((transfer) => transfer.status === "requested").length,
    approved: warehouse.transfers.filter((transfer) => transfer.status === "approved").length,
    dispatched: warehouse.transfers.filter((transfer) => transfer.status === "dispatched").length
  };

  const addTransferLine = () => {
    if (!selectedIngredient) return;
    const parsedQuantity = parseNumber(quantity);
    if (parsedQuantity <= 0) return;
    const nextLine: TransferDraftLine = {
      ingredientId: selectedIngredient.id,
      name: selectedIngredient.name,
      unit: unit.trim() || selectedIngredient.unit,
      quantity: parsedQuantity,
      note: lineNote.trim() || undefined
    };
    setTransferLines((current) => [...current.filter((line) => line.ingredientId !== nextLine.ingredientId), nextLine]);
    setQuantity("");
    setUnit(selectedIngredient.unit);
    setLineNote("");
  };

  return (
    <div className="grid gap-4">
      <TransferControlCenter
        warehouse={warehouse}
        transferReady={transferReady}
        fromLocationId={fromLocationId}
        toLocationId={toLocationId}
        transferLines={transferLines}
        availableFromSource={availableFromSource}
        selectedIngredient={selectedIngredient}
      />
      <div className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
      <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Điều chuyển kho</p>
            <h2 className="mt-1 text-xl font-black">Chuyển hàng giữa kho, bar, bếp và chi nhánh</h2>
          </div>
          <Badge tone={transferReady ? "green" : "yellow"}>{transferReady ? "Sẵn sàng" : "Cần 2 kho"}</Badge>
        </div>
        <form action={createInventoryTransferAction} className="grid gap-3 rounded-2xl bg-[var(--soft-surface)] p-3">
          <input type="hidden" name="rowsJson" value={transferRowsJson} />
          <input type="hidden" name="fromLocationId" value={fromLocationId} />
          <input type="hidden" name="toLocationId" value={toLocationId} />
          <div className="grid gap-2 lg:grid-cols-2">
            <select
              value={fromLocationId}
              onChange={(event) => {
                const nextFrom = event.target.value;
                setFromLocationId(nextFrom);
                if (nextFrom === toLocationId) {
                  setToLocationId(warehouse.locations.find((location) => location.id !== nextFrom)?.id ?? "");
                }
              }}
              className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-bold"
              disabled={transferLines.length > 0}
              required
            >
              <option value="">Kho xuất</option>
              {warehouse.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}{location.branchName ? ` · ${location.branchName}` : ""}
                </option>
              ))}
            </select>
            <select
              value={toLocationId}
              onChange={(event) => setToLocationId(event.target.value)}
              className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-bold"
              disabled={transferLines.length > 0}
              required
            >
              <option value="">Kho nhận</option>
              {warehouse.locations.filter((location) => location.id !== fromLocationId).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}{location.branchName ? ` · ${location.branchName}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 lg:grid-cols-[1.15fr_0.55fr_0.45fr]">
            <Input
              value={transferSearch}
              onChange={(event) => {
                const next = event.target.value;
                setTransferSearch(next);
                const matched = ingredients.find((ingredient) => ingredientMatchesQuery(ingredient, next));
                if (matched) {
                  setIngredientId(matched.id);
                  setUnit(matched.unit);
                }
              }}
              placeholder="Scan barcode/SKU hoặc tìm nguyên liệu"
              className="h-10 rounded-xl bg-white lg:col-span-3"
            />
            <select
              name="ingredientId"
              value={ingredientId}
              onChange={(event) => {
                const nextIngredientId = event.target.value;
                setIngredientId(nextIngredientId);
                setUnit(ingredients.find((ingredient) => ingredient.id === nextIngredientId)?.unit ?? "");
              }}
              className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-bold"
            >
              <option value="">Chọn nguyên liệu</option>
              {transferIngredientOptions.map((ingredient) => (
                <option key={ingredient.id} value={ingredient.id}>
                  {ingredient.name}{ingredient.sku ? ` · ${ingredient.sku}` : ""}{ingredient.barcode ? ` · ${ingredient.barcode}` : ""} ({ingredient.unit})
                </option>
              ))}
            </select>
            <Input name="quantity" type="number" min="0.001" step="0.001" placeholder="Số lượng" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="h-10 rounded-xl bg-white" />
            <Input name="unit" placeholder="Đơn vị" value={unit} onChange={(event) => setUnit(event.target.value)} className="h-10 rounded-xl bg-white" />
          </div>
          <Input placeholder="Ghi chú dòng đang chuyển (tùy chọn)" value={lineNote} onChange={(event) => setLineNote(event.target.value)} className="h-10 rounded-xl bg-white" />
          <Textarea name="note" placeholder="Ghi chú chung cho phiếu điều chuyển" value={transferNote} onChange={(event) => setTransferNote(event.target.value)} className="min-h-16 rounded-xl bg-white" />
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-bold text-[var(--muted-foreground)]">
            <span>Khả dụng tại kho xuất: {selectedIngredient ? formatQuantity(availableFromSource, selectedIngredient.unit) : "-"}</span>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setTransferLines([])} disabled={transferLines.length === 0} className="h-9 rounded-xl">
                Xóa nháp
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={addTransferLine} disabled={!selectedIngredient || quantity.trim().length === 0} className="h-9 rounded-xl">
                <PackagePlus className="h-4 w-4" />
                Thêm dòng
              </Button>
            </div>
          </div>
          <DraftLinesPanel
            emptyIcon={ArrowDownUp}
            emptyTitle="Chưa có dòng điều chuyển"
            emptyDescription="Thêm từng nguyên liệu vào phiếu nháp. Phiếu sẽ đi qua duyệt, xuất kho, nhận kho để audit rõ hàng đang đi đường."
          >
            {transferLines.map((line) => (
              <div key={line.ingredientId} className="grid gap-2 px-3 py-2 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate font-black">{line.name}</p>
                  <p className="text-xs font-semibold text-[var(--muted-foreground)]">{line.note || "Không ghi chú"}</p>
                </div>
                <Badge tone="blue">{formatQuantity(line.quantity, line.unit)}</Badge>
                <button type="button" onClick={() => setTransferLines((current) => current.filter((item) => item.ingredientId !== line.ingredientId))} className="h-9 rounded-xl px-3 text-xs font-black text-red-700">
                  Xóa
                </button>
              </div>
            ))}
          </DraftLinesPanel>
          <div className="grid gap-2 sm:grid-cols-2">
            <MiniMetric label="Dòng trong phiếu" value={transferLines.length.toLocaleString("vi-VN")} />
            <MiniMetric label="Tổng lượng" value={transferLines.reduce((sum, line) => sum + line.quantity, 0).toLocaleString("vi-VN")} />
          </div>
          <SubmitButton disabled={!transferReady || transferLines.length === 0 || !fromLocationId || !toLocationId || fromLocationId === toLocationId} pendingLabel="Đang tạo điều chuyển..." className="h-11 rounded-2xl">
            <ArrowDownUp className="h-4 w-4" />
            Tạo yêu cầu {transferLines.length.toLocaleString("vi-VN")} dòng
          </SubmitButton>
        </form>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <MiniMetric label="Chờ duyệt" value={transferStageCounts.requested.toLocaleString("vi-VN")} />
          <MiniMetric label="Chờ xuất" value={transferStageCounts.approved.toLocaleString("vi-VN")} />
          <MiniMetric label="Đang đi đường" value={transferStageCounts.dispatched.toLocaleString("vi-VN")} />
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Transfer ledger</p>
            <h2 className="mt-1 text-xl font-black">Luồng điều chuyển gần đây</h2>
          </div>
          <Badge tone={warehouse.transfers.length > 0 ? "blue" : "neutral"}>{warehouse.transfers.length} phiếu</Badge>
        </div>
        {warehouse.transfers.length === 0 ? (
          <EmptyState icon={ArrowDownUp} title="Chưa có điều chuyển" description="Phiếu điều chuyển sẽ tách rõ yêu cầu, duyệt, xuất kho và nhận kho để thấy hàng nào đang đi đường." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
            <div className="hidden grid-cols-[0.72fr_1fr_0.62fr_0.45fr_0.72fr_1fr] bg-[var(--surface-container-high)] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)] md:grid">
              <span>Mã</span>
              <span>Tuyến</span>
              <span>Trạng thái</span>
              <span>Dòng</span>
              <span>Thời gian</span>
              <span>Thao tác</span>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {warehouse.transfers.map((transfer) => (
                <div key={transfer.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[0.72fr_1fr_0.62fr_0.45fr_0.72fr_1fr] md:items-center">
                  <p className="truncate font-black">{transfer.transferNumber}</p>
                  <span className="truncate font-semibold text-[var(--muted-foreground)]">
                    {transfer.fromLocationName || "Kho xuất"} &gt; {transfer.toLocationName || "Kho nhận"}
                  </span>
                  <Badge tone={workflowStatusTone(transfer.status)}>{transferStatusLabel(transfer.status)}</Badge>
                  <span className="metric-number font-black">
                    {transfer.status === "dispatched"
                      ? `${formatQuantity(transfer.receivedQuantity, "")}/${formatQuantity(transfer.dispatchedQuantity, "")}`
                      : transfer.lineCount.toLocaleString("vi-VN")}
                  </span>
                  <span className="font-semibold text-[var(--muted-foreground)]">{formatDateTime(transfer.createdAt)}</span>
                  <TransferWorkflowActions transfer={transfer} />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}

function TransferWorkflowActions({ transfer }: { transfer: InventoryTransfer }) {
  const actions =
    transfer.status === "requested"
      ? [
          { action: "approve", label: "Duyệt", icon: CheckCircle2, tone: "primary" as const },
          { action: "cancel", label: "Hủy", icon: X, tone: "secondary" as const }
        ]
      : transfer.status === "approved"
        ? [
            { action: "dispatch", label: "Xuất", icon: Truck, tone: "primary" as const },
            { action: "cancel", label: "Hủy", icon: X, tone: "secondary" as const }
          ]
        : transfer.status === "dispatched"
          ? []
          : [];

  if (transfer.status === "dispatched") {
    return <TransferReceiveForm transfer={transfer} />;
  }

  if (actions.length === 0) {
    return <span className="text-xs font-black text-[var(--muted-foreground)]">Đã khóa</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map(({ action, label, icon: Icon, tone }) => (
        <form key={`${transfer.id}:${action}`} action={processInventoryTransferAction}>
          <input type="hidden" name="transferId" value={transfer.id} />
          <input type="hidden" name="action" value={action} />
          <SubmitButton variant={tone === "primary" ? "primary" : "secondary"} size="sm" pendingLabel="..." className="h-8 rounded-xl px-3 text-xs">
            <Icon className="h-3.5 w-3.5" />
            {label}
          </SubmitButton>
        </form>
      ))}
    </div>
  );
}

function TransferReceiveForm({ transfer }: { transfer: InventoryTransfer }) {
  const receivableLines = useMemo(() => transfer.lines.filter((line) => line.dispatchedQuantity > line.receivedQuantity), [transfer.lines]);
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(receivableLines.map((line) => [line.id, String(Math.max(0, line.dispatchedQuantity - line.receivedQuantity))]))
  );
  const linesJson = useMemo(
    () =>
      JSON.stringify(
        receivableLines.map((line) => ({
          lineId: line.id,
          receivedQuantity: Math.min(Math.max(0, parseNumber(quantities[line.id] ?? "0")), Math.max(0, line.dispatchedQuantity - line.receivedQuantity))
        }))
      ),
    [quantities, receivableLines]
  );

  if (receivableLines.length === 0) return <span className="text-xs font-black text-[var(--muted-foreground)]">Đã nhận đủ</span>;

  return (
    <form action={processInventoryTransferAction} className="grid gap-2">
      <input type="hidden" name="transferId" value={transfer.id} />
      <input type="hidden" name="action" value="receive" />
      <input type="hidden" name="linesJson" value={linesJson} />
      <div className="grid max-h-36 gap-1 overflow-y-auto pr-1">
        {receivableLines.map((line) => {
          const remaining = Math.max(0, line.dispatchedQuantity - line.receivedQuantity);
          return (
            <label key={line.id} className="grid grid-cols-[1fr_84px] items-center gap-2 text-xs font-bold text-[var(--muted-foreground)]">
              <span className="truncate">{line.ingredientName}</span>
              <Input
                type="number"
                min="0"
                max={remaining}
                step="0.001"
                value={quantities[line.id] ?? ""}
                onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))}
                className="h-8 rounded-lg bg-white px-2 text-xs"
              />
            </label>
          );
        })}
      </div>
      <SubmitButton size="sm" pendingLabel="..." className="h-8 rounded-xl px-3 text-xs">
        <PackageCheck className="h-3.5 w-3.5" />
        Nhận hàng
      </SubmitButton>
    </form>
  );
}

function PurchasingCommandCenterDraft({
  purchasePlan,
  suppliers,
  openPurchaseOrders,
  latePurchaseOrders,
  receivableOrders,
  receivingLineCount,
  supplierContactGaps,
  purchaseReadinessScore,
  purchaseReadinessTone,
  draftLineCount,
  draftValue,
  onAddAllPlanLines,
  onAddUrgentLines
}: {
  purchasePlan: InventoryPurchasePlan;
  suppliers: InventoryWarehouseCommandCenter["suppliers"];
  openPurchaseOrders: InventoryWarehouseCommandCenter["purchaseOrders"];
  latePurchaseOrders: InventoryWarehouseCommandCenter["purchaseOrders"];
  receivableOrders: InventoryWarehouseCommandCenter["purchaseOrders"];
  receivingLineCount: number;
  supplierContactGaps: number;
  purchaseReadinessScore: number;
  purchaseReadinessTone: "green" | "yellow" | "red";
  draftLineCount: number;
  draftValue: number;
  onAddAllPlanLines: () => void;
  onAddUrgentLines: () => void;
}) {
  const hasPlanLines = purchasePlan.lines.length > 0;
  const recommendedSupplier = purchasePlan.recommendedSupplier?.name ?? suppliers.find((supplier) => supplier.isPreferred)?.name ?? "Chưa có";
  const commandChecks = [
    {
      id: "urgent",
      label: "Không còn dòng cần mua gấp",
      value: purchasePlan.urgentLineCount.toLocaleString("vi-VN"),
      done: purchasePlan.urgentLineCount === 0
    },
    {
      id: "late",
      label: "PO trễ đã được xử lý",
      value: latePurchaseOrders.length.toLocaleString("vi-VN"),
      done: latePurchaseOrders.length === 0
    },
    {
      id: "receive",
      label: "Dòng nhận hàng đang chờ",
      value: receivingLineCount.toLocaleString("vi-VN"),
      done: receivingLineCount === 0
    },
    {
      id: "supplier",
      label: "NCC đủ thông tin liên hệ",
      value: supplierContactGaps.toLocaleString("vi-VN"),
      done: supplierContactGaps === 0
    }
  ];

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Mua hàng</p>
          <h2 className="mt-1 text-xl font-black text-[var(--foreground)]">Điều phối mua hàng và nhận hàng</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={purchaseReadinessTone}>Sẵn sàng {purchaseReadinessScore}/100</Badge>
          <Badge tone={latePurchaseOrders.length > 0 ? "red" : "green"}>{latePurchaseOrders.length} PO trễ</Badge>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
        <div className="grid gap-2 sm:grid-cols-2">
          <MiniMetric label="Đề xuất mua" value={formatVnd(purchasePlan.totalSuggestedValue)} />
          <MiniMetric label="PO mở" value={formatVnd(purchasePlan.openPurchaseValue)} />
          <MiniMetric label="Đang nhận" value={receivableOrders.length.toLocaleString("vi-VN")} />
          <MiniMetric label="Phiếu nháp" value={`${draftLineCount.toLocaleString("vi-VN")} · ${formatVnd(draftValue)}`} />
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-black text-[var(--foreground)]">Kế hoạch đặt hàng</p>
                <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">NCC gợi ý: {recommendedSupplier}</p>
              </div>
              <Badge tone={purchasePlan.urgentLineCount > 0 ? "red" : hasPlanLines ? "yellow" : "green"}>{purchasePlan.suggestedLineCount} dòng</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={!hasPlanLines} onClick={onAddAllPlanLines} className="h-9 rounded-xl">
                <PackagePlus className="h-4 w-4" />
                Thêm tất cả
              </Button>
              <Button type="button" size="sm" variant="secondary" disabled={purchasePlan.urgentLineCount === 0} onClick={onAddUrgentLines} className="h-9 rounded-xl">
                Thêm dòng gấp
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-black text-[var(--foreground)]">Checklist mua hàng</p>
              <Badge tone={commandChecks.every((item) => item.done) ? "green" : "yellow"}>{commandChecks.filter((item) => !item.done).length || "Xong"}</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {commandChecks.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--soft-surface)] px-3 py-2">
                  <span className="truncate text-xs font-black text-[var(--foreground)]">{item.label}</span>
                  <Badge tone={item.done ? "green" : "yellow"}>{item.value}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {openPurchaseOrders.length > 0 ? (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {openPurchaseOrders.slice(0, 3).map((order) => (
            <div key={order.id} className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-sm font-black text-[var(--foreground)]">{order.supplierName ?? "Chưa chọn NCC"}</p>
                <Badge tone={purchaseOrderTone(order.status)}>{purchaseOrderStatusLabel(order.status)}</Badge>
              </div>
              <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">{order.lineCount} dòng · {formatVnd(order.totalAmount)}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PurchasePlanningPanel({
  purchasePlan,
  onAddPlanLines
}: {
  purchasePlan: InventoryPurchasePlan;
  onAddPlanLines: (lines: PurchasePlanLine[]) => void;
}) {
  const urgentLines = purchasePlan.lines.filter((line) => line.priority === "urgent");
  const hasLines = purchasePlan.lines.length > 0;

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Purchase planning</p>
          <h2 className="mt-1 text-xl font-black text-[var(--foreground)]">Kế hoạch mua hàng tự động</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={purchasePlan.urgentLineCount > 0 ? "red" : hasLines ? "yellow" : "green"}>{purchasePlan.suggestedLineCount} dòng đề xuất</Badge>
          <Badge tone={purchasePlan.latePurchaseOrderCount > 0 ? "red" : "blue"}>{purchasePlan.latePurchaseOrderCount} PO trễ</Badge>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        <div className="grid gap-2 sm:grid-cols-2">
          <MiniMetric label="Tổng đề xuất" value={formatVnd(purchasePlan.totalSuggestedValue)} />
          <MiniMetric label="Cần mua ngay" value={formatVnd(purchasePlan.urgentSuggestedValue)} />
          <MiniMetric label="PO mở" value={formatVnd(purchasePlan.openPurchaseValue)} />
          <MiniMetric label="NCC gợi ý" value={purchasePlan.recommendedSupplier?.name ?? "Chưa có"} />
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-black text-[var(--foreground)]">Nhóm ưu tiên</p>
              <Button type="button" size="sm" disabled={!hasLines} onClick={() => onAddPlanLines(purchasePlan.lines)} className="h-9 rounded-xl">
                <PackagePlus className="h-4 w-4" />
                Đưa vào phiếu nháp
              </Button>
            </div>
            <div className="mt-3 grid gap-2">
              {purchasePlan.priorityBuckets.map((bucket) => (
                <div key={bucket.priority} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm">
                  <div>
                    <p className="font-black">{bucket.label}</p>
                    <p className="text-xs font-semibold text-[var(--muted-foreground)]">{bucket.lineCount} dòng</p>
                  </div>
                  <Badge tone={bucket.priority === "urgent" && bucket.lineCount > 0 ? "red" : bucket.priority === "soon" && bucket.lineCount > 0 ? "yellow" : "blue"}>
                    {formatVnd(bucket.estimatedValue)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-black text-[var(--foreground)]">Dòng mua ưu tiên</p>
              <Button type="button" size="sm" variant="secondary" disabled={urgentLines.length === 0} onClick={() => onAddPlanLines(urgentLines)} className="h-9 rounded-xl">
                Thêm dòng gấp
              </Button>
            </div>
            {purchasePlan.lines.length === 0 ? (
              <p className="rounded-2xl bg-[var(--soft-surface)] px-3 py-3 text-sm font-bold text-[var(--muted-foreground)]">Chưa có dòng cần mua từ AI reorder.</p>
            ) : (
              <div className="max-h-60 divide-y divide-[var(--border)] overflow-auto rounded-2xl border border-[var(--border)]">
                {purchasePlan.lines.slice(0, 8).map((line) => (
                  <div key={line.ingredientId} className="grid gap-2 px-3 py-2 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-black">{line.name}</p>
                      <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">{line.reason}</p>
                    </div>
                    <Badge tone={line.priority === "urgent" ? "red" : line.priority === "soon" ? "yellow" : "blue"}>
                      {formatQuantity(line.orderQuantity, line.unit)}
                    </Badge>
                    <span className="metric-number text-right font-black">{formatVnd(line.estimatedCost)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {purchasePlan.warnings.length > 0 ? (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {purchasePlan.warnings.slice(0, 3).map((warning) => (
            <div key={warning.id} className={`rounded-2xl px-3 py-2 text-sm font-bold ${warning.severity === "red" ? "bg-red-50 text-red-800" : warning.severity === "yellow" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800"}`}>
              <p className="font-black">{warning.title}</p>
              <p className="mt-1 text-xs">{warning.detail}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PurchasingCommandCenter({
  purchasePlan,
  suppliers,
  openPurchaseOrders,
  latePurchaseOrders,
  receivableOrders,
  receivingLineCount,
  supplierContactGaps,
  purchaseReadinessScore,
  purchaseReadinessTone,
  draftLineCount,
  draftValue,
  onAddAllPlanLines,
  onAddUrgentLines
}: {
  purchasePlan: InventoryPurchasePlan;
  suppliers: InventoryWarehouseCommandCenter["suppliers"];
  openPurchaseOrders: InventoryPurchaseOrder[];
  latePurchaseOrders: InventoryPurchaseOrder[];
  receivableOrders: InventoryPurchaseOrder[];
  receivingLineCount: number;
  supplierContactGaps: number;
  purchaseReadinessScore: number;
  purchaseReadinessTone: "green" | "yellow" | "red";
  draftLineCount: number;
  draftValue: number;
  onAddAllPlanLines: () => void;
  onAddUrgentLines: () => void;
}) {
  const preferredSuppliers = suppliers.filter((supplier) => supplier.isPreferred).length;
  const supplierPlanRows = purchasePlan.supplierPlans.slice(0, 4);
  const purchaseChecklist = [
    {
      id: "urgent-lines",
      label: "Đã xử lý nguyên liệu cần mua ngay",
      value: purchasePlan.urgentLineCount.toLocaleString("vi-VN"),
      done: purchasePlan.urgentLineCount === 0
    },
    {
      id: "late-po",
      label: "Không còn PO trễ hẹn",
      value: latePurchaseOrders.length.toLocaleString("vi-VN"),
      done: latePurchaseOrders.length === 0
    },
    {
      id: "receiving",
      label: "Hàng đang về đã có kế hoạch nhận",
      value: receivingLineCount.toLocaleString("vi-VN"),
      done: receivingLineCount === 0
    },
    {
      id: "supplier-contact",
      label: "NCC có thông tin liên hệ",
      value: supplierContactGaps.toLocaleString("vi-VN"),
      done: supplierContactGaps === 0
    }
  ];
  const purchaseQueue = [
    ...purchasePlan.lines.slice(0, 4).map((line) => ({
      id: `plan-${line.ingredientId}`,
      title: line.name,
      detail: line.reason,
      value: formatVnd(line.estimatedCost),
      tone: line.priority === "urgent" ? "red" as const : line.priority === "soon" ? "yellow" as const : "blue" as const
    })),
    ...latePurchaseOrders.slice(0, 3).map((order) => ({
      id: `late-${order.id}`,
      title: order.poNumber,
      detail: `${order.supplierName || "Chưa chọn NCC"} · dự kiến ${order.expectedDeliveryAt ? formatDateTime(order.expectedDeliveryAt) : "-"}`,
      value: formatVnd(order.totalAmount),
      tone: "red" as const
    })),
    ...receivableOrders.slice(0, 3).map((order) => ({
      id: `receive-${order.id}`,
      title: `Nhận ${order.poNumber}`,
      detail: `${order.lines.filter((line) => line.remainingQuantity > 0).length} dòng còn nhận · ${order.supplierName || "Chưa chọn NCC"}`,
      value: formatVnd(order.totalAmount),
      tone: "yellow" as const
    }))
  ].slice(0, 6);

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Mua hàng</p>
          <h2 className="mt-1 text-xl font-black text-[var(--foreground)]">Điều phối mua hàng, NCC và nhận hàng</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={purchaseReadinessTone}>Purchase readiness {purchaseReadinessScore}/100</Badge>
          <Badge tone={draftLineCount > 0 ? "blue" : "neutral"}>{draftLineCount} dòng nháp</Badge>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <MiniMetric label="Đề xuất mua" value={formatVnd(purchasePlan.totalSuggestedValue)} />
            <MiniMetric label="Cần mua ngay" value={formatVnd(purchasePlan.urgentSuggestedValue)} />
            <MiniMetric label="PO mở" value={formatVnd(purchasePlan.openPurchaseValue)} />
            <MiniMetric label="Phiếu nháp" value={formatVnd(draftValue)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" onClick={onAddUrgentLines} disabled={purchasePlan.urgentLineCount === 0} className="h-10 rounded-2xl">
              <AlertTriangle className="h-4 w-4" />
              Đưa dòng gấp vào PO
            </Button>
            <Button type="button" variant="secondary" onClick={onAddAllPlanLines} disabled={purchasePlan.lines.length === 0} className="h-10 rounded-2xl">
              <PackagePlus className="h-4 w-4" />
              Đưa tất cả vào PO
            </Button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-black text-[var(--foreground)]">Checklist mua hàng</p>
              <Badge tone={purchaseChecklist.every((item) => item.done) ? "green" : "yellow"}>{purchaseChecklist.filter((item) => !item.done).length || "Xong"}</Badge>
            </div>
            <div className="grid gap-2">
              {purchaseChecklist.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white px-3 py-2">
                  <p className="min-w-0 truncate text-sm font-black text-[var(--foreground)]">{item.label}</p>
                  <Badge tone={item.done ? "green" : "yellow"}>{item.value}</Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-black text-[var(--foreground)]">Hàng đợi mua/nhận</p>
              <Badge tone={purchaseQueue.length > 0 ? "yellow" : "green"}>{purchaseQueue.length || "Trống"}</Badge>
            </div>
            <div className="grid max-h-72 gap-2 overflow-auto pr-1">
              {purchaseQueue.length === 0 ? (
                <p className="rounded-2xl bg-white px-3 py-3 text-sm font-bold text-[var(--muted-foreground)]">Không có việc mua hàng cần xử lý ngay.</p>
              ) : (
                purchaseQueue.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[var(--foreground)]">{item.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs font-semibold text-[var(--muted-foreground)]">{item.detail}</p>
                      </div>
                      <Badge tone={item.tone}>{item.value}</Badge>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[0.86fr_1.14fr]">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-black text-[var(--foreground)]">NCC đề xuất</p>
            <Badge tone={preferredSuppliers > 0 ? "green" : "blue"}>{preferredSuppliers}/{suppliers.length} ưu tiên</Badge>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {supplierPlanRows.length === 0 ? (
              <p className="rounded-2xl bg-white px-3 py-3 text-sm font-bold text-[var(--muted-foreground)] md:col-span-2">Chưa có supplier plan từ reorder engine.</p>
            ) : (
              supplierPlanRows.map((supplier) => (
                <div key={supplier.supplierId ?? supplier.supplierName} className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-black text-[var(--foreground)]">{supplier.supplierName}</p>
                    <Badge tone={supplier.isPreferred ? "green" : "blue"}>{supplier.defaultLeadDays} ngày</Badge>
                  </div>
                  <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">{supplier.lineCount} dòng · {formatVnd(supplier.estimatedValue)}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-black text-[var(--foreground)]">PO cần theo dõi</p>
            <Badge tone={latePurchaseOrders.length > 0 ? "red" : openPurchaseOrders.length > 0 ? "yellow" : "green"}>{openPurchaseOrders.length} mở</Badge>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <MiniMetric label="PO trễ" value={latePurchaseOrders.length.toLocaleString("vi-VN")} />
            <MiniMetric label="Chờ nhận" value={receivableOrders.length.toLocaleString("vi-VN")} />
            <MiniMetric label="Dòng còn nhận" value={receivingLineCount.toLocaleString("vi-VN")} />
          </div>
        </section>
      </div>
    </section>
  );
}

function SupplierPurchaseDesk({
  warehouse,
  ingredients,
  purchasePlan
}: {
  warehouse: InventoryWarehouseCommandCenter;
  ingredients: InventoryIngredient[];
  purchasePlan: InventoryPurchasePlan;
}) {
  const [purchaseNowMs] = useState(() => Date.now());
  const [supplierId, setSupplierId] = useState("");
  const [locationId, setLocationId] = useState(warehouse.locations[0]?.id ?? "");
  const [ingredientId, setIngredientId] = useState(ingredients[0]?.id ?? "");
  const [orderQuantity, setOrderQuantity] = useState("");
  const [orderUnit, setOrderUnit] = useState(ingredients[0]?.unit ?? "");
  const [unitCost, setUnitCost] = useState(ingredients[0] ? String(Math.round(ingredients[0].referenceUnitCost)) : "");
  const [expectedDeliveryAt, setExpectedDeliveryAt] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [lineNote, setLineNote] = useState("");
  const [purchaseNote, setPurchaseNote] = useState("");
  const [purchaseLines, setPurchaseLines] = useState<PurchaseDraftLine[]>([]);
  const selectedIngredient = ingredients.find((ingredient) => ingredient.id === ingredientId) ?? null;
  const purchaseRowsJson = useMemo(
    () =>
      JSON.stringify(
        purchaseLines.map((line) => ({
          ingredientId: line.ingredientId,
          orderQuantity: line.orderQuantity,
          orderUnit: line.orderUnit,
          unitCost: line.unitCost,
          expirationDate: line.expirationDate,
          batchCode: line.batchCode,
          note: line.note
        }))
      ),
    [purchaseLines]
  );
  const purchaseTotal = purchaseLines.reduce((sum, line) => sum + Math.round(line.orderQuantity * line.unitCost), 0);
  const openPurchaseOrders = warehouse.purchaseOrders.filter((order) => !["cancelled", "delivered"].includes(order.status));
  const latePurchaseOrders = openPurchaseOrders.filter((order) => Boolean(order.expectedDeliveryAt && new Date(order.expectedDeliveryAt).getTime() < purchaseNowMs));
  const receivableOrders = openPurchaseOrders.filter((order) => order.lines.some((line) => line.remainingQuantity > 0));
  const receivingLineCount = receivableOrders.reduce((sum, order) => sum + order.lines.filter((line) => line.remainingQuantity > 0).length, 0);
  const supplierContactGaps = warehouse.suppliers.filter((supplier) => !supplier.phone && !supplier.address).length;
  const purchaseReadinessScore = Math.max(
    0,
    Math.min(
      100,
      100 -
        purchasePlan.urgentLineCount * 7 -
        latePurchaseOrders.length * 10 -
        receivingLineCount * 3 -
        supplierContactGaps * 5 -
        (purchasePlan.budget.isOverBudget ? 12 : 0)
    )
  );
  const purchaseReadinessTone = purchaseReadinessScore >= 85 ? "green" : purchaseReadinessScore >= 65 ? "yellow" : "red";

  const addPurchaseLine = () => {
    if (!selectedIngredient) return;
    const quantity = parseNumber(orderQuantity);
    const cost = Math.round(parseNumber(unitCost));
    if (quantity <= 0 || cost < 0) return;
    const nextLine: PurchaseDraftLine = {
      ingredientId: selectedIngredient.id,
      name: selectedIngredient.name,
      unit: selectedIngredient.unit,
      orderQuantity: quantity,
      orderUnit: orderUnit.trim() || selectedIngredient.unit,
      unitCost: cost,
      expirationDate: expirationDate || undefined,
      batchCode: batchCode.trim() || undefined,
      note: lineNote.trim() || undefined
    };
    setPurchaseLines((current) => [
      ...current.filter((line) => line.ingredientId !== nextLine.ingredientId || line.expirationDate !== nextLine.expirationDate || line.batchCode !== nextLine.batchCode),
      nextLine
    ]);
    setOrderQuantity("");
    setOrderUnit(selectedIngredient.unit);
    setUnitCost(String(Math.round(selectedIngredient.referenceUnitCost)));
    setExpirationDate("");
    setBatchCode("");
    setLineNote("");
  };

  const addPlanLines = (lines: PurchasePlanLine[]) => {
    const nextLines = lines.reduce<PurchaseDraftLine[]>((drafts, line) => {
        const ingredient = ingredients.find((item) => item.id === line.ingredientId);
        if (!ingredient || line.orderQuantity <= 0) return drafts;
        drafts.push({
          ingredientId: ingredient.id,
          name: ingredient.name,
          unit: ingredient.unit,
          orderQuantity: line.orderQuantity,
          orderUnit: line.unit || ingredient.unit,
          unitCost: line.unitCost || Math.round(ingredient.referenceUnitCost),
          note: line.reason
        });
        return drafts;
      }, []);
    if (nextLines.length === 0) return;
    setPurchaseLines((current) => {
      const merged = new Map(current.map((line) => [line.ingredientId, line]));
      for (const line of nextLines) merged.set(line.ingredientId, line);
      return [...merged.values()];
    });
    if (!supplierId && purchasePlan.recommendedSupplier?.id) setSupplierId(purchasePlan.recommendedSupplier.id);
    if (!purchaseNote.trim()) setPurchaseNote("Tạo từ Purchase Planning & Reorder Intelligence.");
  };

  return (
    <div className="grid gap-4">
      <PurchasingCommandCenter
        purchasePlan={purchasePlan}
        suppliers={warehouse.suppliers}
        openPurchaseOrders={openPurchaseOrders}
        latePurchaseOrders={latePurchaseOrders}
        receivableOrders={receivableOrders}
        receivingLineCount={receivingLineCount}
        supplierContactGaps={supplierContactGaps}
        purchaseReadinessScore={purchaseReadinessScore}
        purchaseReadinessTone={purchaseReadinessTone}
        draftLineCount={purchaseLines.length}
        draftValue={purchaseTotal}
        onAddAllPlanLines={() => addPlanLines(purchasePlan.lines)}
        onAddUrgentLines={() => addPlanLines(purchasePlan.lines.filter((line) => line.priority === "urgent"))}
      />
      <PurchasePlanningPanel purchasePlan={purchasePlan} onAddPlanLines={addPlanLines} />
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Supplier management</p>
            <h2 className="mt-1 text-xl font-black">Nhà cung cấp và giá nhập</h2>
          </div>
          <Badge tone={warehouse.suppliers.length > 0 ? "green" : "neutral"}>{warehouse.suppliers.length} NCC</Badge>
        </div>
        <form action={createInventorySupplierAction} className="mb-4 grid gap-2 rounded-2xl bg-[var(--soft-surface)] p-3 sm:grid-cols-[1fr_0.8fr_0.55fr_auto]">
          <Input name="name" required placeholder="Tên nhà cung cấp" className="h-10 rounded-xl bg-white" />
          <Input name="phone" placeholder="Số điện thoại" className="h-10 rounded-xl bg-white" />
          <Input name="defaultLeadDays" type="number" min={0} max={120} placeholder="Lead" className="h-10 rounded-xl bg-white" />
          <SubmitButton size="sm" pendingLabel="Đang thêm..." className="h-10 rounded-xl">
            <Building2 className="h-4 w-4" />
            Thêm NCC
          </SubmitButton>
          <Input name="address" placeholder="Địa chỉ hoặc ghi chú giao hàng" className="h-10 rounded-xl bg-white sm:col-span-2" />
          <label className="flex h-10 items-center gap-2 rounded-xl bg-white px-3 text-sm font-bold text-[var(--muted-foreground)]">
            <input name="isPreferred" type="checkbox" className="h-4 w-4 accent-[var(--primary)]" />
            Ưu tiên
          </label>
        </form>
        <div className="space-y-3">
          {warehouse.suppliers.length === 0 ? (
            <EmptyState icon={Building2} title="Chưa có nhà cung cấp" description="Thêm supplier để so giá, theo dõi lead time và tạo PO nhập hàng." />
          ) : (
            warehouse.suppliers.slice(0, 8).map((supplier) => (
              <article key={supplier.id} className="rounded-2xl border border-[var(--border)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-black">{supplier.name}</p>
                    <p className="truncate text-sm font-semibold text-[var(--muted-foreground)]">{supplier.phone || supplier.address || "Chưa có liên hệ"}</p>
                  </div>
                  <Badge tone={supplier.isPreferred ? "green" : "blue"}>{supplier.isPreferred ? "Ưu tiên" : `${supplier.defaultLeadDays} ngày`}</Badge>
                </div>
                <p className="mt-2 text-sm font-bold text-[var(--primary)]">{supplier.productCount} nguyên liệu đang liên kết</p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Purchase orders</p>
            <h2 className="mt-1 text-xl font-black">Đơn mua hàng và hàng đang về</h2>
          </div>
          <Badge tone={warehouse.openPurchaseOrderCount > 0 ? "yellow" : "green"}>{warehouse.openPurchaseOrderCount} PO mở</Badge>
        </div>
        <form action={createInventoryPurchaseOrderAction} className="mb-4 grid gap-3 rounded-2xl bg-[var(--soft-surface)] p-3">
          <input type="hidden" name="rowsJson" value={purchaseRowsJson} />
          <div className="grid gap-2 lg:grid-cols-[1fr_1fr]">
            <select name="supplierId" value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-bold">
              <option value="">Chọn NCC sau</option>
              {warehouse.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
            <select name="locationId" value={locationId} onChange={(event) => setLocationId(event.target.value)} className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-bold">
              <option value="">Kho chính</option>
              {warehouse.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}{location.branchName ? ` · ${location.branchName}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 lg:grid-cols-[1.2fr_0.55fr_0.45fr_0.65fr]">
            <select
              value={ingredientId}
              onChange={(event) => {
                const nextIngredientId = event.target.value;
                const nextIngredient = ingredients.find((ingredient) => ingredient.id === nextIngredientId);
                setIngredientId(nextIngredientId);
                setOrderUnit(nextIngredient?.unit ?? "");
                setUnitCost(nextIngredient ? String(Math.round(nextIngredient.referenceUnitCost)) : "");
              }}
              className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-bold"
            >
              <option value="">Chọn nguyên liệu</option>
              {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}
            </select>
            <Input type="number" min="0.001" step="0.001" placeholder="SL đặt" value={orderQuantity} onChange={(event) => setOrderQuantity(event.target.value)} className="h-10 rounded-xl bg-white" />
            <Input placeholder="Đơn vị" value={orderUnit} onChange={(event) => setOrderUnit(event.target.value)} className="h-10 rounded-xl bg-white" />
            <Input type="number" min={0} step={1} placeholder="Giá / đơn vị" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} className="h-10 rounded-xl bg-white" />
          </div>
          <div className="grid gap-2 lg:grid-cols-[0.9fr_0.7fr_0.7fr_auto]">
            <Input name="expectedDeliveryAt" type="datetime-local" value={expectedDeliveryAt} onChange={(event) => setExpectedDeliveryAt(event.target.value)} className="h-10 rounded-xl bg-white" />
            <Input type="date" value={expirationDate} onChange={(event) => setExpirationDate(event.target.value)} className="h-10 rounded-xl bg-white" />
            <Input placeholder="Mã lô" value={batchCode} onChange={(event) => setBatchCode(event.target.value)} className="h-10 rounded-xl bg-white" />
            <Button type="button" size="sm" variant="secondary" onClick={addPurchaseLine} disabled={!selectedIngredient || orderQuantity.trim().length === 0 || unitCost.trim().length === 0} className="h-10 rounded-xl">
              <PackagePlus className="h-4 w-4" />
              Thêm dòng
            </Button>
          </div>
          <Input placeholder="Ghi chú dòng, quy cách giao hoặc giá thỏa thuận" value={lineNote} onChange={(event) => setLineNote(event.target.value)} className="h-10 rounded-xl bg-white" />
          <DraftLinesPanel
            emptyIcon={ClipboardList}
            emptyTitle="Chưa có dòng đặt hàng"
            emptyDescription="Thêm các nguyên liệu trong hóa đơn hoặc đề xuất nhập hàng, rồi tạo một PO nhiều dòng."
          >
            {purchaseLines.map((line) => (
              <div key={`${line.ingredientId}:${line.expirationDate || "no-exp"}:${line.batchCode || "no-batch"}`} className="grid gap-2 px-3 py-2 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate font-black">{line.name}</p>
                  <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">
                    {formatQuantity(line.orderQuantity, line.orderUnit || line.unit)} · {formatVnd(line.unitCost)}/đv{line.expirationDate ? ` · HSD ${line.expirationDate}` : ""}{line.batchCode ? ` · Lô ${line.batchCode}` : ""}
                  </p>
                </div>
                <Badge tone="blue">{formatVnd(Math.round(line.orderQuantity * line.unitCost))}</Badge>
                <button type="button" onClick={() => setPurchaseLines((current) => current.filter((item) => item.ingredientId !== line.ingredientId || item.expirationDate !== line.expirationDate || item.batchCode !== line.batchCode))} className="h-9 rounded-xl px-3 text-xs font-black text-red-700">
                  Xóa
                </button>
              </div>
            ))}
          </DraftLinesPanel>
          <div className="grid gap-2 sm:grid-cols-2">
            <MiniMetric label="Dòng trong PO" value={purchaseLines.length.toLocaleString("vi-VN")} />
            <MiniMetric label="Tạm tính" value={formatVnd(purchaseTotal)} />
          </div>
          <Textarea name="note" placeholder="Ghi chú chung: giao hàng, công nợ hoặc điều kiện nhận hàng" value={purchaseNote} onChange={(event) => setPurchaseNote(event.target.value)} className="min-h-16 rounded-xl bg-white" />
          <SubmitButton disabled={ingredients.length === 0 || purchaseLines.length === 0} pendingLabel="Đang tạo PO..." className="h-11 rounded-2xl">
            <ClipboardList className="h-4 w-4" />
            Tạo PO {purchaseLines.length.toLocaleString("vi-VN")} dòng
          </SubmitButton>
        </form>
        <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
          <div className="hidden grid-cols-[0.7fr_0.9fr_0.7fr_0.6fr_0.65fr_0.65fr] bg-[var(--surface-container-high)] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)] md:grid">
            <span>Mã PO</span>
            <span>NCC</span>
            <span>Trạng thái</span>
            <span>Dự kiến</span>
            <span>Tổng</span>
            <span>Nhận</span>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {warehouse.purchaseOrders.length === 0 ? (
              <p className="p-4 text-sm font-bold text-[var(--muted-foreground)]">Chưa có purchase order.</p>
            ) : (
              warehouse.purchaseOrders.map((order) => {
                const canReceive = !["cancelled", "delivered"].includes(order.status);
                return (
                  <div key={order.id} className="px-4 py-3 text-sm">
                    <div className="grid gap-2 md:grid-cols-[0.7fr_0.9fr_0.7fr_0.6fr_0.65fr_0.65fr] md:items-center">
                      <div className="min-w-0">
                        <p className="truncate font-black">{order.poNumber}</p>
                        <p className="text-xs font-semibold text-[var(--muted-foreground)]">{order.lineCount} dòng</p>
                      </div>
                      <span className="truncate font-semibold text-[var(--muted-foreground)]">{order.supplierName || "Chưa chọn NCC"}</span>
                      <Badge tone={purchaseOrderTone(order.status)}>{purchaseOrderStatusLabel(order.status)}</Badge>
                      <span className="font-semibold text-[var(--muted-foreground)]">{order.expectedDeliveryAt ? formatDateTime(order.expectedDeliveryAt) : "-"}</span>
                      <span className="metric-number font-black">{formatVnd(order.totalAmount)}</span>
                      <Badge tone={order.status === "delivered" ? "green" : canReceive ? "yellow" : "red"}>
                        {order.status === "delivered" ? "Xong" : canReceive ? "Chờ nhận" : "Đóng"}
                      </Badge>
                    </div>
                    {canReceive ? (
                      <PurchaseOrderReceiveForm
                        key={`${order.id}:${order.status}:${order.lines.map((line) => `${line.id}:${line.receivedQuantity}`).join("|")}`}
                        order={order}
                      />
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
      </div>
    </div>
  );
}

function PurchaseOrderReceiveForm({ order }: { order: InventoryPurchaseOrder }) {
  const receivableLines = order.lines.filter((line) => line.remainingQuantity > 0);
  const [receiptLines, setReceiptLines] = useState<PurchaseReceiptDraftLine[]>(
    receivableLines.map((line) => ({
      purchaseOrderLineId: line.id,
      receivedQuantity: String(line.remainingQuantity),
      unitCost: String(Math.round(line.unitCost)),
      expirationDate: line.expirationDate ?? "",
      batchCode: line.batchCode ?? "",
      note: ""
    }))
  );
  const receiptRowsJson = useMemo(
    () =>
      JSON.stringify(
        receiptLines
          .map((line) => ({
            purchaseOrderLineId: line.purchaseOrderLineId,
            receivedQuantity: parseNumber(line.receivedQuantity),
            unitCost: Math.round(parseNumber(line.unitCost)),
            expirationDate: line.expirationDate || undefined,
            batchCode: line.batchCode.trim() || undefined,
            note: line.note.trim() || undefined
          }))
          .filter((line) => line.receivedQuantity > 0)
      ),
    [receiptLines]
  );
  const receiptValue = receiptLines.reduce((sum, line) => {
    const quantity = parseNumber(line.receivedQuantity);
    const unitCost = Math.round(parseNumber(line.unitCost));
    return quantity > 0 && unitCost >= 0 ? sum + Math.round(quantity * unitCost) : sum;
  }, 0);
  const activeLineCount = receiptLines.filter((line) => parseNumber(line.receivedQuantity) > 0).length;

  const updateReceiptLine = (lineId: string, patch: Partial<PurchaseReceiptDraftLine>) => {
    setReceiptLines((current) => current.map((line) => (line.purchaseOrderLineId === lineId ? { ...line, ...patch } : line)));
  };

  if (receivableLines.length === 0) {
    return (
      <div className="mt-3 rounded-2xl bg-[var(--soft-surface)] px-3 py-2 text-xs font-bold text-[var(--muted-foreground)]">
        PO này không còn dòng cần nhận.
      </div>
    );
  }

  return (
    <form action={receiveInventoryPurchaseOrderAction} className="mt-3 grid gap-3 rounded-2xl bg-[var(--soft-surface)] p-3">
      <input type="hidden" name="purchaseOrderId" value={order.id} />
      <input type="hidden" name="rowsJson" value={receiptRowsJson} />
      <div className="grid gap-2">
        {receivableLines.map((line) => {
          const draft = receiptLines.find((item) => item.purchaseOrderLineId === line.id);
          if (!draft) return null;
          const receivedQuantity = parseNumber(draft.receivedQuantity);
          const overReceivedQuantity = Math.max(0, line.receivedQuantity + receivedQuantity - line.orderQuantity);

          return (
            <div key={line.id} className="rounded-2xl border border-[var(--border)] bg-white p-3">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-black">{line.ingredientName}</p>
                  <p className="text-xs font-semibold text-[var(--muted-foreground)]">
                    Đặt {formatQuantity(line.orderQuantity, line.orderUnit)} · đã nhận {formatQuantity(line.receivedQuantity, line.orderUnit)} · còn {formatQuantity(line.remainingQuantity, line.orderUnit)}
                  </p>
                </div>
                <Badge tone={overReceivedQuantity > 0 ? "yellow" : "blue"}>
                  {overReceivedQuantity > 0 ? `Dư ${formatQuantity(overReceivedQuantity, line.orderUnit)}` : formatVnd(Math.round(receivedQuantity * parseNumber(draft.unitCost)))}
                </Badge>
              </div>
              <div className="grid gap-2 md:grid-cols-[0.58fr_0.58fr_0.62fr_0.62fr_1fr]">
                <Input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={draft.receivedQuantity}
                  onChange={(event) => updateReceiptLine(line.id, { receivedQuantity: event.target.value })}
                  className="h-10 rounded-xl bg-white"
                  aria-label={`Số lượng nhận ${line.ingredientName}`}
                />
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={draft.unitCost}
                  onChange={(event) => updateReceiptLine(line.id, { unitCost: event.target.value })}
                  className="h-10 rounded-xl bg-white"
                  aria-label={`Giá nhận ${line.ingredientName}`}
                />
                <Input
                  type="date"
                  value={draft.expirationDate}
                  onChange={(event) => updateReceiptLine(line.id, { expirationDate: event.target.value })}
                  className="h-10 rounded-xl bg-white"
                  aria-label={`Hạn sử dụng ${line.ingredientName}`}
                />
                <Input
                  value={draft.batchCode}
                  onChange={(event) => updateReceiptLine(line.id, { batchCode: event.target.value })}
                  placeholder="Mã lô"
                  className="h-10 rounded-xl bg-white"
                  aria-label={`Mã lô ${line.ingredientName}`}
                />
                <Input
                  value={draft.note}
                  onChange={(event) => updateReceiptLine(line.id, { note: event.target.value })}
                  placeholder="Ghi chú nhận"
                  className="h-10 rounded-xl bg-white"
                  aria-label={`Ghi chú nhận ${line.ingredientName}`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
        <MiniMetric label="Dòng nhận" value={activeLineCount.toLocaleString("vi-VN")} />
        <MiniMetric label="Giá trị nhận" value={formatVnd(receiptValue)} />
        <SubmitButton size="sm" variant="secondary" disabled={activeLineCount === 0} pendingLabel="Đang nhận..." className="h-10 rounded-xl">
          <PackageCheck className="h-4 w-4" />
          Nhận hàng
        </SubmitButton>
      </div>
    </form>
  );
}

function InventoryAlertDesk({ warehouse }: { warehouse: InventoryWarehouseCommandCenter }) {
  const sortedAlerts = [...warehouse.alerts].sort(
    (a, b) => alertPriorityScore(b) - alertPriorityScore(a) || new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
  );
  const criticalCount = warehouse.alerts.filter((alert) => alert.severity === "critical" || alert.severity === "high").length;
  const operationsCount = warehouse.alerts.filter((alert) => ["out_of_stock", "low_stock", "missing_inventory"].includes(alert.alertType)).length;
  const lossCount = warehouse.alerts.filter((alert) => ["expired", "expiring_soon", "waste_spike", "abnormal_usage"].includes(alert.alertType)).length;
  const supplierCount = warehouse.alerts.filter((alert) => ["supplier_delay", "price_spike"].includes(alert.alertType)).length;

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Inventory alerts</p>
          <h2 className="mt-1 text-xl font-black">Cảnh báo thiếu hàng, hết hạn và bất thường</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={warehouse.openAlertCount > 0 ? "red" : "green"}>{warehouse.openAlertCount} alert mở</Badge>
          <form action={refreshInventoryAlertsAction}>
            <SubmitButton variant="secondary" size="sm" pendingLabel="Đang quét..." className="h-9 rounded-xl">
              <Wand2 className="h-4 w-4" />
              Quét cảnh báo
            </SubmitButton>
          </form>
        </div>
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <MiniMetric label="Ưu tiên cao" value={criticalCount.toLocaleString("vi-VN")} />
        <MiniMetric label="Thiếu hàng" value={operationsCount.toLocaleString("vi-VN")} />
        <MiniMetric label="Hao hụt / HSD" value={lossCount.toLocaleString("vi-VN")} />
        <MiniMetric label="NCC / giá" value={supplierCount.toLocaleString("vi-VN")} />
      </div>
      {warehouse.alerts.length === 0 ? (
        <EmptyState icon={PackageCheck} title="Chưa có cảnh báo mở" description="Alert engine sẽ gom low stock, expiring soon, waste spike, supplier delay và recipe gap ở đây." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {sortedAlerts.map((alert) => (
            <article
              key={alert.id}
              className={`rounded-2xl border p-4 ${
                alert.severity === "critical" || alert.severity === "high"
                  ? "border-red-200 bg-red-50/40"
                  : alert.severity === "medium"
                    ? "border-amber-200 bg-amber-50/30"
                    : "border-[var(--border)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-black">{alert.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold text-[var(--muted-foreground)]">{alert.detail || alert.ingredientName || "Cần kiểm tra dữ liệu kho."}</p>
                </div>
                <Badge tone={alertTone(alert.severity)}>{alertSeverityLabel(alert.severity)}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="blue">{alertTypeLabel(alert.alertType)}</Badge>
                <Badge tone={workflowStatusTone(alert.status)}>{alertStatusLabel(alert.status)}</Badge>
                {alert.branchName ? <Badge tone="neutral">{alert.branchName}</Badge> : null}
                {alert.ingredientName ? <Badge tone="neutral">{alert.ingredientName}</Badge> : null}
                <span className="text-xs font-bold text-[var(--muted-foreground)]">{formatDateTime(alert.detectedAt)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {alert.status === "open" ? (
                  <form action={updateInventoryAlertStatusAction}>
                    <input type="hidden" name="alertId" value={alert.id} />
                    <input type="hidden" name="status" value="acknowledged" />
                    <SubmitButton size="sm" variant="secondary" pendingLabel="Đang lưu..." className="h-9 rounded-xl">
                      <CheckCircle2 className="h-4 w-4" />
                      Đã xem
                    </SubmitButton>
                  </form>
                ) : null}
                <form action={updateInventoryAlertStatusAction}>
                  <input type="hidden" name="alertId" value={alert.id} />
                  <input type="hidden" name="status" value="resolved" />
                  <SubmitButton size="sm" pendingLabel="Đang lưu..." className="h-9 rounded-xl">
                    <ShieldCheck className="h-4 w-4" />
                    Xử lý xong
                  </SubmitButton>
                </form>
                <form action={updateInventoryAlertStatusAction}>
                  <input type="hidden" name="alertId" value={alert.id} />
                  <input type="hidden" name="status" value="dismissed" />
                  <SubmitButton size="sm" variant="ghost" pendingLabel="Đang lưu..." className="h-9 rounded-xl">
                    <X className="h-4 w-4" />
                    Bỏ qua
                  </SubmitButton>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function RecipesAndCategories({
  categories,
  ingredients,
  recipeMenuItems,
  recipeBacklog
}: {
  categories: InventoryCategory[];
  ingredients: InventoryIngredient[];
  recipeMenuItems: InventoryRecipeMenuItem[];
  recipeBacklog: InventoryRecipeMenuItem[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Nhóm & định mức</p>
        <h2 className="mt-1 text-xl font-black">Thiết lập dữ liệu nền</h2>
        <form action={createInventoryCategoryAction} className="mt-4 flex gap-2">
          <Input name="name" placeholder="Ví dụ: Bar, Bếp nóng..." required />
          <SubmitButton pendingLabel="Đang thêm..." className="rounded-xl">Thêm nhóm</SubmitButton>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((category) => <Badge key={category.id} tone="blue">{category.name}</Badge>)}
        </div>
        <form action={upsertInventoryRecipeLineAction} className="mt-5 grid gap-3 rounded-2xl bg-[var(--soft-surface)] p-3">
          <p className="font-black">Bổ sung định mức món</p>
          <select name="menuItemId" className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold" required>
            <option value="">Chọn món</option>
            {recipeMenuItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select name="ingredientId" className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold" required>
            <option value="">Chọn nguyên liệu</option>
            {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <Input name="quantityPerItem" type="number" min="0.001" step="0.001" placeholder="Lượng / món" required />
            <Input name="wastePercent" type="number" min="0" max="100" step="0.1" placeholder="Hao hụt %" />
          </div>
          <SubmitButton pendingLabel="Đang lưu..." className="rounded-xl">Lưu định mức</SubmitButton>
        </form>
      </section>
      <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Giá vốn món</p>
            <h2 className="mt-1 text-xl font-black">Định mức đang áp dụng</h2>
          </div>
          <Badge tone={recipeBacklog.length > 0 ? "yellow" : "green"}>{recipeBacklog.length} món thiếu</Badge>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {recipeMenuItems.slice(0, 8).map((item) => (
            <article key={item.id} className="rounded-2xl border border-[var(--border)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black">{item.name}</p>
                  <p className="text-sm font-semibold text-[var(--muted-foreground)]">
                    Cost {formatVnd(item.totalRecipeCost)} · {formatPercent(item.recipeCostPercent)} · margin {formatPercent(item.grossMarginPercent)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={item.recipeLines.length > 0 ? costStatusTone(item.costStatus) : "red"}>{item.recipeLines.length > 0 ? costStatusLabel(item.costStatus) : "Thiếu recipe"}</Badge>
                  <span className="metric-number text-xs font-black text-[var(--foreground)]">{formatVnd(item.grossProfit)}</span>
                </div>
              </div>
              {item.marginWarning ? <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">{item.marginWarning}</p> : null}
              <div className="mt-3 space-y-2">
                {item.recipeLines.length === 0 ? (
                  <p className="rounded-xl bg-[var(--surface-container-high)] px-3 py-2 text-sm font-bold text-[var(--muted-foreground)]">Chưa có định mức.</p>
                ) : (
                  item.recipeLines.map((line) => (
                    <div key={line.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-container-high)] px-3 py-2 text-sm">
                      <span className="font-bold">{line.ingredientName} · {formatQuantity(line.quantityPerItem, line.ingredientUnit)}</span>
                      <form action={deleteInventoryRecipeLineAction}>
                        <input type="hidden" name="recipeLineId" value={line.id} />
                        <SubmitButton variant="ghost" size="sm" pendingLabel="Đang xóa..." className="h-8 min-h-8 rounded-xl px-2 text-red-700">
                          Xóa
                        </SubmitButton>
                      </form>
                    </div>
                  ))
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function InventoryLedger({ snapshot }: { snapshot: InventorySnapshot }) {
  return (
    <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Nhật ký kho</p>
      <h2 className="mt-1 text-xl font-black">Dòng kho gần đây</h2>
      <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)]">
        <div className="hidden grid-cols-[0.9fr_1fr_0.8fr_0.8fr] bg-[var(--surface-container-high)] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)] md:grid">
          <span>Thời gian</span>
          <span>Nguyên liệu</span>
          <span>Loại</span>
          <span>Số lượng</span>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {snapshot.recentMovements.length === 0 ? (
            <p className="p-4 text-sm font-bold text-[var(--muted-foreground)]">Chưa có movement nào.</p>
          ) : (
            snapshot.recentMovements.map((movement) => (
              <div key={movement.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[0.9fr_1fr_0.8fr_0.8fr] md:items-center">
                <span className="font-semibold text-[var(--muted-foreground)]">{formatDateTime(movement.createdAt)}</span>
                <div className="min-w-0">
                  <p className="truncate font-black">{movement.ingredientName}</p>
                  <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">{movement.reason || movement.sourceType}</p>
                </div>
                <Badge tone={movementTone(movement.movementType)}>{movementLabel(movement.movementType)}</Badge>
                <span className={`metric-number font-black ${movement.quantityDelta >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {movement.quantityDelta > 0 ? "+" : ""}
                  {formatQuantity(movement.quantityDelta, movement.ingredientUnit)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function ModeButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-12 rounded-2xl border px-3 py-3 text-xs font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${
        active ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] bg-white text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      }`}
    >
      <Icon className="mx-auto mb-1 h-5 w-5" />
      {label}
    </button>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2">
      <p className="metric-number text-lg font-black text-[var(--foreground)]">{value}</p>
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{label}</p>
    </div>
  );
}

function DraftLinesPanel({
  children,
  emptyIcon,
  emptyTitle,
  emptyDescription
}: {
  children: ReactNode;
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
      {hasChildren ? <div className="max-h-64 divide-y divide-[var(--border)] overflow-auto">{children}</div> : <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="grid min-h-48 place-items-center rounded-2xl bg-[var(--soft-surface)] p-6 text-center">
      <div>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-[var(--primary)] shadow-sm">
          <Icon className="h-5 w-5" />
        </span>
        <p className="mt-3 font-black text-[var(--foreground)]">{title}</p>
        <p className="mt-1 max-w-md text-sm font-semibold text-[var(--muted-foreground)]">{description}</p>
      </div>
    </div>
  );
}

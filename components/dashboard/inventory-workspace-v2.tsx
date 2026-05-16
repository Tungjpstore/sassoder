"use client";

import {
  AlertTriangle,
  ArrowDownUp,
  AudioLines,
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
  ReceiptText,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Truck,
  Upload,
  Wand2,
  Warehouse,
  X,
  type LucideIcon
} from "lucide-react";
import { useActionState, useMemo, useRef, useState, useTransition, type ChangeEvent, type ReactNode, type RefObject } from "react";
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
  receiveInventoryPurchaseOrderAction,
  recordInventoryMovementAction,
  refreshInventoryAlertsAction,
  updateInventoryAlertStatusAction,
  updateInventoryIngredientAction,
  upsertInventoryRecipeLineAction
} from "@/app/dashboard/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { formatVnd } from "@/lib/money";
import type {
  InventoryActionPriority,
  InventoryCategory,
  InventoryIngredient,
  InventoryIntelligence,
  InventoryRecipeMenuItem,
  InventorySnapshot,
  InventoryStockBalanceStatus,
  InventoryWarehouseCommandCenter
} from "@/services/inventory-service";
import type { InventoryMovementType } from "@/types/domain";

type IntakeMode = "text" | "file" | "voice" | "ocr";
type WorkbenchTab = "intake" | "ingredients" | "stock" | "counting" | "transfers" | "purchasing" | "recipes" | "alerts" | "ledger";
type DrawerState = { mode: "create" } | { mode: "edit"; ingredient: InventoryIngredient } | null;

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

const movementTypes: Array<{ value: Exclude<InventoryMovementType, "deduct_sale">; label: string }> = [
  { value: "receive", label: "Nhập kho" },
  { value: "adjust_increase", label: "Điều chỉnh tăng" },
  { value: "adjust_decrease", label: "Điều chỉnh giảm" },
  { value: "waste", label: "Hao hụt" },
  { value: "rollback", label: "Hoàn kho" }
];

function formatQuantity(value: number, unit: string) {
  const localizedUnit = unit === "cai" ? "cái" : unit;
  return `${Number(value.toFixed(3)).toLocaleString("vi-VN")} ${localizedUnit}`;
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
  snapshot,
  categories,
  ingredients,
  recipeMenuItems,
  intelligence,
  warehouse
}: {
  snapshot: InventorySnapshot;
  categories: InventoryCategory[];
  ingredients: InventoryIngredient[];
  recipeMenuItems: InventoryRecipeMenuItem[];
  intelligence: InventoryIntelligence;
  warehouse: InventoryWarehouseCommandCenter;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("intake");
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("text");
  const [rawIntake, setRawIntake] = useState("");
  const [draftRows, setDraftRows] = useState<IntakeDraftRow[]>([]);
  const [parserMessage, setParserMessage] = useState("Chưa có dữ liệu. Dán nội dung thật, tải file hoặc dùng OCR để bắt đầu.");
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [aiOcrLoading, setAiOcrLoading] = useState(false);
  const [aiOcrError, setAiOcrError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isParsing, startTransition] = useTransition();
  const [importState, importAction, importPending] = useActionState(importInventoryIntakeAction, undefined);

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
  const reorderSuggestions = intelligence.reorderSuggestions.slice(0, 6);
  const urgentActions = intelligence.actionQueue.slice(0, 3);
  const importTotalValue = draftRows.reduce((total, row) => total + row.quantity * row.referenceUnitCost, 0);
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
    <div className="inventory-redesign space-y-5">
      <InventoryPageHeader query={query} onQueryChange={setQuery} />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={BrainCircuit}
          label="Sức khỏe kho AI"
          value={`${intelligence.healthScore}/100`}
          caption={intelligence.healthScore >= 75 ? "Tốt, tiếp tục theo dõi cảnh báo sớm." : "Cần xử lý các việc AI đề xuất."}
          tone={intelligence.healthScore >= 75 ? "green" : intelligence.healthScore >= 50 ? "yellow" : "red"}
          circularScore={intelligence.healthScore}
        />
        <SummaryCard icon={ShieldCheck} label="Giá trị tồn kho" value={formatVnd(snapshot.totalReferenceValue)} caption="Theo giá vốn hiện tại." tone="blue" />
        <SummaryCard
          icon={Boxes}
          label="Nguyên liệu"
          value={snapshot.activeIngredientCount.toLocaleString("vi-VN")}
          caption={`${snapshot.lowStockCount.toLocaleString("vi-VN")} cảnh báo cần xem.`}
          tone={snapshot.lowStockCount > 0 ? "yellow" : "green"}
        />
        <SummaryCard
          icon={ClipboardCheck}
          label="Recipe coverage"
          value={`${snapshot.recipeReadyItemCount}/${snapshot.menuItemCount} món`}
          caption={recipeBacklog.length > 0 ? "Cần bổ sung định mức để trừ kho chính xác." : "Định mức đã sẵn sàng."}
          tone={recipeBacklog.length > 0 ? "red" : "green"}
        />
      </section>

      <WarehouseOperationsStrip warehouse={warehouse} />

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Ưu tiên hành động hôm nay</p>
              <h2 className="mt-1 text-xl font-black text-[var(--foreground)]">Nhìn 3 giây biết cần làm gì</h2>
            </div>
            <Badge tone={urgentActions.length > 0 ? "yellow" : "green"}>{urgentActions.length} việc cần xử lý</Badge>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {urgentActions.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Không có việc gấp" description="Kho đang ổn. Hãy tiếp tục nhập hàng và chốt định mức khi có món mới." />
            ) : (
              urgentActions.map((item) => (
                <ActionCard key={item.id} priority={item.priority} title={item.title} detail={item.detail} value={item.valueLabel} />
              ))
            )}
          </div>
        </div>
        <InventoryHealthBreakdown segments={healthSegments} />
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Gợi ý đặt hàng</p>
            <h2 className="mt-1 text-xl font-black text-[var(--foreground)]">Bảng gợi ý đặt hàng thông minh</h2>
          </div>
          <Badge tone={reorderSuggestions.length > 0 ? "yellow" : "green"}>{reorderSuggestions.length} SKU</Badge>
        </div>
        <SmartReorderTable suggestions={reorderSuggestions} ingredients={ingredients} />
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
        <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
          <WorkbenchButton active={activeTab === "intake"} icon={Sparkles} label="AI nhập kho" onClick={() => setActiveTab("intake")} />
          <WorkbenchButton active={activeTab === "ingredients"} icon={Boxes} label="Quản lý nguyên liệu" onClick={() => setActiveTab("ingredients")} />
          <WorkbenchButton active={activeTab === "stock"} icon={Warehouse} label="Stock board" onClick={() => setActiveTab("stock")} />
          <WorkbenchButton active={activeTab === "counting"} icon={ClipboardList} label="Kiểm kê" onClick={() => setActiveTab("counting")} />
          <WorkbenchButton active={activeTab === "transfers"} icon={ArrowDownUp} label="Điều chuyển" onClick={() => setActiveTab("transfers")} />
          <WorkbenchButton active={activeTab === "purchasing"} icon={Truck} label="NCC & PO" onClick={() => setActiveTab("purchasing")} />
          <WorkbenchButton active={activeTab === "recipes"} icon={ClipboardCheck} label="Giá vốn món" onClick={() => setActiveTab("recipes")} />
          <WorkbenchButton active={activeTab === "alerts"} icon={Bell} label="Cảnh báo" onClick={() => setActiveTab("alerts")} />
          <WorkbenchButton active={activeTab === "ledger"} icon={ReceiptText} label="Nhật ký kho" onClick={() => setActiveTab("ledger")} />
        </div>

        <div className="pt-4">
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

          {activeTab === "counting" ? <InventoryCountingDesk warehouse={warehouse} ingredients={ingredients} /> : null}

          {activeTab === "transfers" ? <InventoryTransferDesk warehouse={warehouse} ingredients={ingredients} /> : null}

          {activeTab === "purchasing" ? <SupplierPurchaseDesk warehouse={warehouse} ingredients={ingredients} /> : null}

          {activeTab === "recipes" ? (
            <RecipesAndCategories categories={categories} ingredients={ingredients} recipeMenuItems={recipeMenuItems} recipeBacklog={recipeBacklog} />
          ) : null}

          {activeTab === "alerts" ? <InventoryAlertDesk warehouse={warehouse} /> : null}

          {activeTab === "ledger" ? <InventoryLedger snapshot={snapshot} /> : null}
        </div>
      </section>

      {drawer ? <IngredientDrawer drawer={drawer} categories={categories} onClose={() => setDrawer(null)} /> : null}
    </div>
  );
}

function InventoryPageHeader({ query, onQueryChange }: { query: string; onQueryChange: (value: string) => void }) {
  return (
    <section className="rounded-3xl border border-[var(--border)] bg-[linear-gradient(135deg,#fffaf2_0%,#f7fbf6_54%,#eef6ff_100%)] p-4 shadow-[0_18px_60px_rgba(15,77,58,0.06)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-bold text-[var(--muted-foreground)]">Trang chủ / Kho hàng</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-[var(--foreground)]">Kho hàng</h1>
          <p className="mt-1 max-w-2xl text-sm font-semibold text-[var(--muted-foreground)]">Tối ưu nhập hàng, cảnh báo sớm và kiểm soát nguyên liệu cho quán.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 sm:w-96">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input className="h-11 rounded-2xl bg-white pl-9" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Tìm nguyên liệu, nhóm, vị trí..." />
          </label>
        </div>
      </div>
    </section>
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

function WorkbenchButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-black transition ${
        active ? "bg-[var(--primary)] text-white shadow-sm" : "bg-[var(--soft-surface)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
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
            <h2 className="mt-1 text-xl font-black">Text, file, giọng nói hoặc OCR</h2>
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
          placeholder="Ví dụ: Ly giấy 500ml, cái, 500, min 120, giá 650, nhóm Bao bì"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" onClick={onParse} disabled={isParsing} className="rounded-xl">
            <Sparkles className="h-4 w-4" /> Phân tích dữ liệu
          </Button>
          <Button type="button" variant="secondary" onClick={onAdvancedRead} disabled={aiOcrLoading} className="rounded-xl">
            <BrainCircuit className="h-4 w-4" /> {aiOcrLoading ? "Đang đọc..." : "AI đọc nâng cao"}
          </Button>
          <Button type="button" variant="secondary" onClick={onVoice} className="rounded-xl">
            <AudioLines className="h-4 w-4" /> {isListening ? "Đang nghe..." : "Nhập giọng nói"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => fileInputRef.current?.click()} className="rounded-xl">
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
            <EmptyState icon={FileText} title="Chưa có bảng nháp" description="Sau khi phân tích text, file, voice hoặc OCR, dữ liệu nhập kho sẽ xuất hiện ở đây để bạn xác nhận." />
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
        <Button type="submit" disabled={draftRows.length === 0 || importPending} className="mt-3 w-full rounded-2xl">
          <PackagePlus className="h-4 w-4" /> {importPending ? "Đang nhập vào kho..." : "Nhập vào kho thật"}
        </Button>
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
  const ingredient = drawer?.mode === "edit" ? drawer.ingredient : null;
  return (
    <div className="fixed inset-0 z-[80]">
      <button type="button" className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" aria-label="Đóng drawer" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col overflow-auto border-l border-[var(--border)] bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">{ingredient ? "Sửa nguyên liệu" : "Thêm nguyên liệu"}</p>
            <h2 className="mt-1 text-2xl font-black">{ingredient?.name ?? "Nguyên liệu mới"}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--soft-surface)]">
            <X className="h-5 w-5" />
          </button>
        </div>
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
            <Button type="submit" className="flex-1 rounded-2xl">{ingredient ? "Lưu thay đổi" : "Thêm nguyên liệu"}</Button>
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
      </aside>
    </div>
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
          branchName: null,
          locationName: locationLabel(ingredient),
          batchCode: null,
          expirationDate: null,
          onHandQuantity: ingredient.onHandQuantity,
          reservedQuantity: 0,
          incomingQuantity: 0,
          availableQuantity: ingredient.onHandQuantity,
          minimumQuantity: ingredient.minimumQuantity,
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

function InventoryCountingDesk({ warehouse, ingredients }: { warehouse: InventoryWarehouseCommandCenter; ingredients: InventoryIngredient[] }) {
  const [locationId, setLocationId] = useState(warehouse.locations[0]?.id ?? "");
  const [ingredientId, setIngredientId] = useState(ingredients[0]?.id ?? "");
  const [countedQuantity, setCountedQuantity] = useState("");
  const [sessionNote, setSessionNote] = useState("");
  const [lineNote, setLineNote] = useState("");
  const [countLines, setCountLines] = useState<CountDraftLine[]>([]);
  const selectedIngredient = ingredients.find((ingredient) => ingredient.id === ingredientId) ?? null;
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
            <select
              name="ingredientId"
              value={ingredientId}
              onChange={(event) => setIngredientId(event.target.value)}
              className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-bold"
            >
              <option value="">Scan/tìm nguyên liệu</option>
              {ingredients.map((ingredient) => (
                <option key={ingredient.id} value={ingredient.id}>
                  {ingredient.name} ({ingredient.unit})
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
            <Button type="button" variant="secondary" size="sm" onClick={addCountLine} disabled={!selectedIngredient || countedQuantity.trim().length === 0} className="h-9 rounded-xl">
              <PackagePlus className="h-4 w-4" />
              Thêm dòng
            </Button>
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
          <Button type="submit" disabled={countLines.length === 0} className="h-11 rounded-2xl">
            <ClipboardCheck className="h-4 w-4" />
            Áp dụng {countLines.length.toLocaleString("vi-VN")} dòng kiểm kê
          </Button>
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
  );
}

function InventoryTransferDesk({ warehouse, ingredients }: { warehouse: InventoryWarehouseCommandCenter; ingredients: InventoryIngredient[] }) {
  const transferReady = warehouse.locations.length >= 2 && ingredients.length > 0;
  const [fromLocationId, setFromLocationId] = useState(warehouse.locations[0]?.id ?? "");
  const [toLocationId, setToLocationId] = useState(warehouse.locations.find((location) => location.id !== fromLocationId)?.id ?? "");
  const [ingredientId, setIngredientId] = useState(ingredients[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState(ingredients[0]?.unit ?? "");
  const [transferNote, setTransferNote] = useState("");
  const [lineNote, setLineNote] = useState("");
  const [transferLines, setTransferLines] = useState<TransferDraftLine[]>([]);
  const selectedIngredient = ingredients.find((ingredient) => ingredient.id === ingredientId) ?? null;
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
              {ingredients.map((ingredient) => (
                <option key={ingredient.id} value={ingredient.id}>
                  {ingredient.name} ({ingredient.unit})
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
            <Button type="button" variant="secondary" size="sm" onClick={addTransferLine} disabled={!selectedIngredient || quantity.trim().length === 0} className="h-9 rounded-xl">
              <PackagePlus className="h-4 w-4" />
              Thêm dòng
            </Button>
          </div>
          <DraftLinesPanel
            emptyIcon={ArrowDownUp}
            emptyTitle="Chưa có dòng điều chuyển"
            emptyDescription="Thêm từng nguyên liệu vào phiếu nháp rồi tạo điều chuyển một lần để ghi transfer out/in đồng bộ."
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
          <Button type="submit" disabled={!transferReady || transferLines.length === 0 || !fromLocationId || !toLocationId || fromLocationId === toLocationId} className="h-11 rounded-2xl">
            <ArrowDownUp className="h-4 w-4" />
            Tạo điều chuyển {transferLines.length.toLocaleString("vi-VN")} dòng
          </Button>
        </form>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <MiniMetric label="Điều chuyển mở" value={warehouse.transferCount.toLocaleString("vi-VN")} />
          <MiniMetric label="Gần đây" value={warehouse.transfers.length.toLocaleString("vi-VN")} />
          <MiniMetric label="Vị trí kho" value={warehouse.locationCount.toLocaleString("vi-VN")} />
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
          <EmptyState icon={ArrowDownUp} title="Chưa có điều chuyển" description="Phiếu điều chuyển sẽ ghi transfer out/in atomic để stock board cập nhật ngay và vẫn giữ audit trail." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
            <div className="hidden grid-cols-[0.75fr_1fr_0.7fr_0.55fr_0.75fr] bg-[var(--surface-container-high)] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)] md:grid">
              <span>Mã</span>
              <span>Tuyến</span>
              <span>Trạng thái</span>
              <span>Dòng</span>
              <span>Thời gian</span>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {warehouse.transfers.map((transfer) => (
                <div key={transfer.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[0.75fr_1fr_0.7fr_0.55fr_0.75fr] md:items-center">
                  <p className="truncate font-black">{transfer.transferNumber}</p>
                  <span className="truncate font-semibold text-[var(--muted-foreground)]">
                    {transfer.fromLocationName || "Kho xuất"} &gt; {transfer.toLocationName || "Kho nhận"}
                  </span>
                  <Badge tone={workflowStatusTone(transfer.status)}>{transferStatusLabel(transfer.status)}</Badge>
                  <span className="metric-number font-black">{transfer.lineCount.toLocaleString("vi-VN")}</span>
                  <span className="font-semibold text-[var(--muted-foreground)]">{formatDateTime(transfer.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SupplierPurchaseDesk({ warehouse, ingredients }: { warehouse: InventoryWarehouseCommandCenter; ingredients: InventoryIngredient[] }) {
  return (
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
          <Button type="submit" size="sm" className="h-10 rounded-xl">
            <Building2 className="h-4 w-4" />
            Thêm NCC
          </Button>
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
          <div className="grid gap-2 lg:grid-cols-[1fr_1fr]">
            <select name="supplierId" className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-bold">
              <option value="">Chọn NCC sau</option>
              {warehouse.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
            <select name="locationId" className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-bold">
              <option value="">Kho chính</option>
              {warehouse.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}{location.branchName ? ` · ${location.branchName}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 lg:grid-cols-[1.2fr_0.55fr_0.45fr_0.65fr]">
            <select name="ingredientId" className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-bold" required>
              <option value="">Chọn nguyên liệu</option>
              {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}
            </select>
            <Input name="orderQuantity" type="number" min="0.001" step="0.001" placeholder="SL đặt" className="h-10 rounded-xl bg-white" required />
            <Input name="orderUnit" placeholder="Đơn vị" className="h-10 rounded-xl bg-white" />
            <Input name="unitCost" type="number" min={0} step={1} placeholder="Giá / đơn vị" className="h-10 rounded-xl bg-white" required />
          </div>
          <div className="grid gap-2 lg:grid-cols-[0.9fr_0.7fr_0.7fr_auto]">
            <Input name="expectedDeliveryAt" type="datetime-local" className="h-10 rounded-xl bg-white" />
            <Input name="expirationDate" type="date" className="h-10 rounded-xl bg-white" />
            <Input name="batchCode" placeholder="Mã lô" className="h-10 rounded-xl bg-white" />
            <Button type="submit" size="sm" disabled={ingredients.length === 0} className="h-10 rounded-xl">
              <ClipboardList className="h-4 w-4" />
              Tạo PO
            </Button>
          </div>
          <Textarea name="note" placeholder="Ghi chú giao hàng, công nợ hoặc điều kiện nhận hàng" className="min-h-16 rounded-xl bg-white" />
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
                  <div key={order.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[0.7fr_0.9fr_0.7fr_0.6fr_0.65fr_0.65fr] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-black">{order.poNumber}</p>
                      <p className="text-xs font-semibold text-[var(--muted-foreground)]">{order.lineCount} dòng</p>
                    </div>
                    <span className="truncate font-semibold text-[var(--muted-foreground)]">{order.supplierName || "Chưa chọn NCC"}</span>
                    <Badge tone={purchaseOrderTone(order.status)}>{purchaseOrderStatusLabel(order.status)}</Badge>
                    <span className="font-semibold text-[var(--muted-foreground)]">{order.expectedDeliveryAt ? formatDateTime(order.expectedDeliveryAt) : "-"}</span>
                    <span className="metric-number font-black">{formatVnd(order.totalAmount)}</span>
                    {canReceive ? (
                      <form action={receiveInventoryPurchaseOrderAction}>
                        <input type="hidden" name="purchaseOrderId" value={order.id} />
                        <Button type="submit" size="sm" variant="secondary" className="h-9 rounded-xl">
                          <PackageCheck className="h-4 w-4" />
                          Nhận
                        </Button>
                      </form>
                    ) : (
                      <Badge tone={order.status === "delivered" ? "green" : "red"}>{order.status === "delivered" ? "Xong" : "Đóng"}</Badge>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function InventoryAlertDesk({ warehouse }: { warehouse: InventoryWarehouseCommandCenter }) {
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
            <Button type="submit" variant="secondary" size="sm" className="h-9 rounded-xl">
              <Wand2 className="h-4 w-4" />
              Quét cảnh báo
            </Button>
          </form>
        </div>
      </div>
      {warehouse.alerts.length === 0 ? (
        <EmptyState icon={PackageCheck} title="Chưa có cảnh báo mở" description="Alert engine sẽ gom low stock, expiring soon, waste spike, supplier delay và recipe gap ở đây." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {warehouse.alerts.map((alert) => (
            <article key={alert.id} className="rounded-2xl border border-[var(--border)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-black">{alert.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold text-[var(--muted-foreground)]">{alert.detail || alert.ingredientName || "Cần kiểm tra dữ liệu kho."}</p>
                </div>
                <Badge tone={alertTone(alert.severity)}>{alert.severity}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="blue">{alert.alertType}</Badge>
                <Badge tone={workflowStatusTone(alert.status)}>{alert.status}</Badge>
                {alert.branchName ? <Badge tone="neutral">{alert.branchName}</Badge> : null}
                <span className="text-xs font-bold text-[var(--muted-foreground)]">{formatDateTime(alert.detectedAt)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {alert.status === "open" ? (
                  <form action={updateInventoryAlertStatusAction}>
                    <input type="hidden" name="alertId" value={alert.id} />
                    <input type="hidden" name="status" value="acknowledged" />
                    <Button type="submit" size="sm" variant="secondary" className="h-9 rounded-xl">
                      <CheckCircle2 className="h-4 w-4" />
                      Đã xem
                    </Button>
                  </form>
                ) : null}
                <form action={updateInventoryAlertStatusAction}>
                  <input type="hidden" name="alertId" value={alert.id} />
                  <input type="hidden" name="status" value="resolved" />
                  <Button type="submit" size="sm" className="h-9 rounded-xl">
                    <ShieldCheck className="h-4 w-4" />
                    Xử lý xong
                  </Button>
                </form>
                <form action={updateInventoryAlertStatusAction}>
                  <input type="hidden" name="alertId" value={alert.id} />
                  <input type="hidden" name="status" value="dismissed" />
                  <Button type="submit" size="sm" variant="ghost" className="h-9 rounded-xl">
                    <X className="h-4 w-4" />
                    Bỏ qua
                  </Button>
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
          <Button type="submit" className="rounded-xl">Thêm nhóm</Button>
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
          <Button type="submit" className="rounded-xl">Lưu định mức</Button>
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
                  <p className="text-sm font-semibold text-[var(--muted-foreground)]">Cost {formatVnd(item.totalRecipeCost)} · {formatPercent(item.recipeCostPercent)}</p>
                </div>
                <Badge tone={item.recipeLines.length > 0 ? "green" : "red"}>{item.recipeLines.length} dòng</Badge>
              </div>
              <div className="mt-3 space-y-2">
                {item.recipeLines.length === 0 ? (
                  <p className="rounded-xl bg-[var(--surface-container-high)] px-3 py-2 text-sm font-bold text-[var(--muted-foreground)]">Chưa có định mức.</p>
                ) : (
                  item.recipeLines.map((line) => (
                    <div key={line.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-container-high)] px-3 py-2 text-sm">
                      <span className="font-bold">{line.ingredientName} · {formatQuantity(line.quantityPerItem, line.ingredientUnit)}</span>
                      <form action={deleteInventoryRecipeLineAction}>
                        <input type="hidden" name="recipeLineId" value={line.id} />
                        <button type="submit" className="font-black text-red-700">Xóa</button>
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
      className={`rounded-2xl border px-3 py-3 text-xs font-black transition ${
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

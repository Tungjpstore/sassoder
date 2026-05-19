"use client";

import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  AudioLines,
  Boxes,
  BrainCircuit,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  FileJson,
  FileText,
  Layers3,
  MapPin,
  PackagePlus,
  Pencil,
  ReceiptText,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  Warehouse,
  Zap,
  type LucideIcon
} from "lucide-react";
import { useActionState, useMemo, useRef, useState, useTransition, type ChangeEvent, type ReactNode } from "react";
import {
  createInventoryCategoryAction,
  createInventoryIngredientAction,
  deactivateInventoryIngredientAction,
  deleteInventoryRecipeLineAction,
  importInventoryIntakeAction,
  recordInventoryMovementAction,
  updateInventoryIngredientAction,
  upsertInventoryRecipeLineAction
} from "@/app/dashboard/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { formatVnd } from "@/lib/money";
import type {
  InventoryActionItem,
  InventoryActionPriority,
  InventoryCategory,
  InventoryIngredient,
  InventoryIntelligence,
  InventoryRecipeMenuItem,
  InventorySnapshot
} from "@/services/inventory-service";
import type { InventoryMovementType } from "@/types/domain";

type IntakeMode = "text" | "file" | "voice" | "ocr";
type DeskMode = "receive" | "ingredients" | "alerts" | "ledger";

type IntakeDraftRow = {
  name: string;
  unit: string;
  quantity: number;
  minimumQuantity: number;
  referenceUnitCost: number;
  categoryName?: string;
};

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error?: string };

type InventoryOcrResponse = {
  text?: string;
  data?: {
    rows?: Array<IntakeDraftRow & { categoryName?: string | null }>;
    warnings?: string[];
    confidence?: number;
  };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
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

function movementLabel(type: InventoryMovementType) {
  const labels: Record<InventoryMovementType, string> = {
    receive: "Nhập kho",
    deduct_sale: "Trừ theo đơn",
    adjust_increase: "Điều chỉnh tăng",
    adjust_decrease: "Điều chỉnh giảm",
    waste: "Hao hụt",
    rollback: "Hoàn tác",
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

function movementTone(type: InventoryMovementType) {
  if (type === "receive" || type === "adjust_increase" || type === "rollback" || type === "transfer_in" || type === "release_reserve") {
    return "green";
  }
  if (type === "waste" || type === "adjust_decrease" || type === "expired" || type === "supplier_return" || type === "transfer_out") {
    return "red";
  }
  if (type === "reserve" || type === "internal_use") return "yellow";
  return "blue";
}

function formatQuantity(value: number, unit: string) {
  return `${Number(value.toFixed(3)).toLocaleString("vi-VN")} ${unit}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatPercent(value: number) {
  return `${Number(value.toFixed(2)).toLocaleString("vi-VN")}%`;
}

function formatDaysLeft(value: number | null) {
  if (value === null) return "Chưa có lịch sử dùng";
  if (value < 1) return "Dưới 1 ngày";
  return `${Number(value.toFixed(1)).toLocaleString("vi-VN")} ngày`;
}

function priorityLabel(priority: InventoryActionPriority) {
  if (priority === "high") return "Gấp";
  if (priority === "medium") return "Theo dõi";
  return "Ổn";
}

function priorityTone(priority: InventoryActionPriority): "green" | "yellow" | "red" {
  if (priority === "high") return "red";
  if (priority === "medium") return "yellow";
  return "green";
}

function actionTypeLabel(type: InventoryActionItem["type"]) {
  const labels: Record<InventoryActionItem["type"], string> = {
    reorder: "Mua hàng",
    waste: "Hao hụt",
    price: "Giá vốn",
    recipe: "Định mức",
    count: "Kiểm kê"
  };
  return labels[type];
}

function ingredientLocationLabel(ingredient: InventoryIngredient) {
  const parts = [ingredient.storageArea, ingredient.shelfCode].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Chưa định vị";
}

function suggestedReorderQuantity(onHandQuantity: number, minimumQuantity: number) {
  const gap = Math.max(0, minimumQuantity - onHandQuantity);
  const buffer = minimumQuantity > 0 ? minimumQuantity * 0.5 : 0;
  return Math.max(gap + buffer, gap);
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
    const normalized =
      decimalPart.length === 3 && integerPart.length > 0 ? `${integerPart}${decimalPart}` : `${integerPart}.${decimalPart}`;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickText(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function normalizeUnit(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll("lít", "l")
    .replaceAll("lit", "l")
    .replaceAll("gói", "goi")
    .replaceAll("hộp", "hop")
    .replaceAll("cái", "cai")
    .replaceAll("chai", "chai")
    .replaceAll("lon", "lon");
  const match = normalized.match(/\b(kg|g|gram|ml|l|chai|lon|goi|hop|cai|thung|bao|phan|suat|unit)\b/);
  const sanitized = normalized.replace(/[^a-zA-Z0-9_%/ .-]/g, "").slice(0, 24);
  return match?.[1] ?? (sanitized || "unit");
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
  const unit = normalizeUnit(parts.find((part) => /\b(kg|g|gram|ml|l|lit|lít|chai|lon|goi|gói|hop|hộp|cai|cái)\b/i.test(part)) ?? cleaned);
  const categoryMatch = cleaned.match(/(?:nhóm|nhom|category)\s*:?\s*([^,|;]+)/i);
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

export function InventoryWorkspace({
  snapshot,
  categories,
  ingredients,
  recipeMenuItems,
  intelligence
}: {
  snapshot: InventorySnapshot;
  categories: InventoryCategory[];
  ingredients: InventoryIngredient[];
  recipeMenuItems: InventoryRecipeMenuItem[];
  intelligence: InventoryIntelligence;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("text");
  const [activeDesk, setActiveDesk] = useState<DeskMode>("receive");
  const [rawIntake, setRawIntake] = useState("");
  const [draftRows, setDraftRows] = useState<IntakeDraftRow[]>([]);
  const [parserMessage, setParserMessage] = useState("Dán dữ liệu thật, tải file, đọc OCR hoặc nhập giọng nói để AI dựng bảng nháp.");
  const [ingredientQuery, setIngredientQuery] = useState("");
  const [aiOcrLoading, setAiOcrLoading] = useState(false);
  const [aiOcrError, setAiOcrError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isParsing, startTransition] = useTransition();
  const [importState, importAction, importPending] = useActionState(importInventoryIntakeAction, undefined);

  const rowsJson = useMemo(() => JSON.stringify(draftRows), [draftRows]);
  const lowStockValue = useMemo(
    () =>
      snapshot.lowStockIngredients.reduce(
        (total, ingredient) =>
          total + suggestedReorderQuantity(ingredient.onHandQuantity, ingredient.minimumQuantity) * ingredient.referenceUnitCost,
        0
      ),
    [snapshot.lowStockIngredients]
  );
  const recipeBacklog = useMemo(() => recipeMenuItems.filter((item) => item.recipeLines.length === 0).slice(0, 4), [recipeMenuItems]);
  const filteredIngredients = useMemo(() => {
    const query = ingredientQuery.trim().toLowerCase();
    if (!query) return ingredients;
    return ingredients.filter((ingredient) =>
      [ingredient.name, ingredient.categoryName, ingredient.storageArea, ingredient.shelfCode, ingredient.storageNote]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query))
    );
  }, [ingredientQuery, ingredients]);
  const storageAreas = useMemo(() => {
    const areaMap = new Map<string, { count: number; value: number }>();
    for (const ingredient of ingredients) {
      const area = ingredient.storageArea || "Chưa định vị";
      const current = areaMap.get(area) ?? { count: 0, value: 0 };
      current.count += 1;
      current.value += ingredient.onHandQuantity * ingredient.referenceUnitCost;
      areaMap.set(area, current);
    }
    return [...areaMap.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 6);
  }, [ingredients]);
  const importTotalValue = useMemo(
    () => draftRows.reduce((total, row) => total + row.quantity * row.referenceUnitCost, 0),
    [draftRows]
  );
  const topActionItems = intelligence.actionQueue.slice(0, 5);
  const topReorderSuggestions = intelligence.reorderSuggestions.slice(0, 5);
  const topIngredients = filteredIngredients.slice(0, 8);
  const deskItems: Array<{
    mode: DeskMode;
    icon: LucideIcon;
    label: string;
    helper: string;
    badge: string;
  }> = [
    {
      mode: "receive",
      icon: PackagePlus,
      label: "Nhập hàng",
      helper: "AI, OCR, file, voice và ledger",
      badge: draftRows.length > 0 ? `${draftRows.length} dòng nháp` : "Ưu tiên"
    },
    {
      mode: "ingredients",
      icon: Boxes,
      label: "Nguyên liệu",
      helper: "Thêm, sửa, xóa, định vị SKU",
      badge: `${ingredients.length} SKU`
    },
    {
      mode: "alerts",
      icon: AlertTriangle,
      label: "Cảnh báo",
      helper: "Mua lại, thiếu hàng, hao hụt",
      badge: `${intelligence.actionQueue.length} việc`
    },
    {
      mode: "ledger",
      icon: ReceiptText,
      label: "Ledger",
      helper: "Dòng kho và định mức món",
      badge: `${snapshot.recentMovements.length} dòng`
    }
  ];

  const runParser = (value = rawIntake) => {
    startTransition(() => {
      const rows = parseInventoryDraft(value);
      setDraftRows(rows);
      setParserMessage(
        rows.length > 0
          ? `Đã nhận diện ${rows.length} dòng nhập kho. Kiểm tra nhanh rồi bấm nhập vào kho.`
          : "Chưa nhận diện được dòng hợp lệ. Hãy nhập mỗi nguyên liệu một dòng hoặc dùng JSON/CSV rõ cột."
      );
    });
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

  const runInventoryAiOcr = async ({ imageFile, rawText }: { imageFile?: File; rawText?: string }) => {
    const trimmedText = rawText?.trim();
    if (!imageFile && !trimmedText) {
      setParserMessage("Dán nội dung nhập kho hoặc tải ảnh hóa đơn trước khi gọi AI đọc nâng cao.");
      return;
    }

    setAiOcrLoading(true);
    setAiOcrError(null);
    setParserMessage(imageFile ? "AI đang đọc ảnh hóa đơn/phiếu nhập..." : "AI đang phân tích nội dung nhập kho...");

    try {
      const imageBase64 = imageFile ? await fileToBase64(imageFile) : undefined;
      const response = await fetch("/api/admin/ai/inventory-ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64, rawText: trimmedText || undefined })
      });
      const result = (await response.json().catch(() => null)) as ApiResponse<InventoryOcrResponse> | null;
      if (!result || !result.ok) throw new Error(result?.error || "AI chưa đọc được dữ liệu nhập kho.");

      const rows =
        result.data.data?.rows?.map((row) => ({
          ...row,
          categoryName: row.categoryName || undefined
        })) ?? [];

      setDraftRows(rows);
      setRawIntake(
        imageFile
          ? `AI OCR ảnh "${imageFile.name}"\n${rows
              .map((row) => `${row.name}, ${row.unit}, ${row.quantity}, min ${row.minimumQuantity}, giá ${row.referenceUnitCost}, nhóm ${row.categoryName || ""}`)
              .join("\n")}`
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
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
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
      <section className="admin-hero-panel overflow-hidden px-4 py-5">
        <div className="flex max-w-3xl flex-col gap-4">
          <Badge tone="yellow">Inventory schema</Badge>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] md:text-3xl">Kho hàng chưa sẵn sàng để vận hành.</h1>
          <p className="text-sm font-medium text-[var(--muted-foreground)]">
            Cần chạy migration inventory trước khi bật màn hình quản lý kho mới, ledger nhập/xuất và AI intake.
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-3">
      <section className="admin-hero-panel relative overflow-hidden px-4 py-3">
        <div className="relative z-[1] flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={snapshot.lowStockCount > 0 ? "red" : "green"}>
                {snapshot.lowStockCount > 0 ? `${snapshot.lowStockCount} cảnh báo kho` : "Kho ổn định"}
              </Badge>
              <Badge tone={intelligence.healthScore >= 75 ? "green" : intelligence.healthScore >= 50 ? "yellow" : "red"}>
                AI health {intelligence.healthScore}/100
              </Badge>
            </div>
            <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Inventory shift desk</p>
            <h1 className="mt-0.5 text-xl font-bold tracking-tight text-[var(--foreground)] md:text-2xl">Kho gọn theo ca vận hành</h1>
            <p className="mt-0.5 max-w-2xl text-sm font-medium text-[var(--muted-foreground)]">
              {intelligence.aiBrief}
            </p>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 xl:max-w-[720px] xl:grid-cols-4">
            <CommandMetric icon={BrainCircuit} label="AI health" value={`${intelligence.healthScore}/100`} hint={`${intelligence.actionQueue.length} việc ưu tiên`} />
            <CommandMetric icon={Boxes} label="Nguyên liệu" value={snapshot.activeIngredientCount.toLocaleString("vi-VN")} hint={`${snapshot.ingredientCount} tổng`} />
            <CommandMetric icon={ShieldCheck} label="Recipe" value={formatPercent(snapshot.recipeCoveragePercent)} hint={`${snapshot.recipeReadyItemCount}/${snapshot.menuItemCount} món`} />
            <CommandMetric icon={Warehouse} label="Giá trị tồn" value={formatVnd(snapshot.totalReferenceValue)} hint="Theo giá vốn" />
          </div>
        </div>
      </section>

      <section className="dashboard-panel p-2">
        <div className="grid gap-2 md:grid-cols-4">
          {deskItems.map((item) => (
            <DeskTab
              key={item.mode}
              active={activeDesk === item.mode}
              icon={item.icon}
              label={item.label}
              helper={item.helper}
              badge={item.badge}
              onClick={() => setActiveDesk(item.mode)}
            />
          ))}
        </div>
      </section>

      {activeDesk === "alerts" ? (
      <section className="grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="dashboard-panel p-3 md:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">AI Action Queue</p>
              <h2 className="mt-0.5 text-lg font-bold text-[var(--foreground)]">Việc cần làm theo mức ưu tiên</h2>
            </div>
            <Badge tone={topActionItems.length > 0 ? priorityTone(topActionItems[0].priority) : "green"}>
              {topActionItems.length > 0 ? priorityLabel(topActionItems[0].priority) : "Không có cảnh báo"}
            </Badge>
          </div>
          <div className="grid gap-2">
            {topActionItems.length === 0 ? (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
                AI chưa thấy việc gấp. Tiếp tục nhập movement và hoàn thiện định mức để dự báo ngày càng sắc hơn.
              </div>
            ) : (
              topActionItems.map((item) => (
                <div key={item.id} className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={priorityTone(item.priority)}>{priorityLabel(item.priority)}</Badge>
                      <span className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{actionTypeLabel(item.type)}</span>
                    </div>
                    <p className="mt-1 text-sm font-black text-[var(--foreground)]">{item.title}</p>
                    <p className="text-xs font-semibold text-[var(--muted-foreground)]">{item.detail}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 md:block md:text-right">
                    <p className="metric-number text-sm font-black text-[var(--primary)]">{item.valueLabel}</p>
                    <p className="text-[11px] font-black text-[var(--accent-strong)]">{item.cta}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="dashboard-panel p-3 md:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Smart Reorder</p>
              <h2 className="mt-0.5 text-lg font-bold text-[var(--foreground)]">Gợi ý mua lại trong 7 ngày</h2>
            </div>
            <Badge tone={topReorderSuggestions.length > 0 ? "yellow" : "green"}>{formatVnd(intelligence.projectedPurchaseValue)}</Badge>
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            {topReorderSuggestions.length === 0 ? (
              <p className="p-3 text-sm font-semibold text-[var(--muted-foreground)]">Chưa có đề xuất mua lại. AI sẽ tự nổi cảnh báo khi tồn kho hoặc tốc độ dùng chạm ngưỡng.</p>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {topReorderSuggestions.map((item) => (
                  <div key={item.ingredientId} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[var(--foreground)]">{item.name}</p>
                      <p className="truncate text-[11px] font-semibold text-[var(--muted-foreground)]">
                        Còn {formatDaysLeft(item.daysLeft)} · dùng TB {formatQuantity(item.dailyUsage, item.unit)}/ngày
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="metric-number text-sm font-black text-[var(--primary)]">{formatQuantity(item.reorderQuantity, item.unit)}</p>
                      <p className="text-[11px] font-bold text-[var(--muted-foreground)]">{formatVnd(item.estimatedCost)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <MiniInsight label="Burn 7 ngày" value={formatVnd(intelligence.weeklyUsageValue)} />
            <MiniInsight label="Tín hiệu rủi ro" value={`${intelligence.wasteSignals.length + intelligence.priceSignals.length} điểm`} />
          </div>
        </div>
      </section>
      ) : null}

      {activeDesk === "ingredients" ? (
      <section className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="dashboard-panel p-3 md:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Ingredient cockpit</p>
              <h2 className="mt-0.5 text-lg font-bold text-[var(--foreground)]">Thêm, sửa, xóa và định vị nguyên vật liệu</h2>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <Input
                className="pl-9"
                value={ingredientQuery}
                onChange={(event) => setIngredientQuery(event.target.value)}
                placeholder="Tìm tên, nhóm, khu vực, kệ..."
              />
            </div>
          </div>

          <form action={createInventoryIngredientAction} className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="grid gap-2 lg:grid-cols-[1.1fr_0.7fr_0.55fr_0.55fr_0.65fr]">
              <Input name="name" placeholder="Tên nguyên liệu" required />
              <select name="categoryId" className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold">
                <option value="">Nhóm</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
              <Input name="unit" placeholder="Đơn vị" required />
              <Input name="onHandQuantity" type="number" min="0" step="0.001" placeholder="Tồn đầu" required />
              <Input name="minimumQuantity" type="number" min="0" step="0.001" placeholder="Min cảnh báo" required />
            </div>
            <div className="mt-2 grid gap-2 lg:grid-cols-[0.7fr_0.8fr_0.65fr_1fr_0.55fr_auto]">
              <Input name="referenceUnitCost" type="number" min="0" step="1" placeholder="Giá vốn" required />
              <Input name="storageArea" placeholder="Khu vực: Kho khô" />
              <Input name="shelfCode" placeholder="Kệ: A-02" />
              <Input name="storageNote" placeholder="Ghi chú vị trí/kiểm soát" />
              <Input name="reorderLeadDays" type="number" min="0" max="60" step="1" placeholder="Lead ngày" />
              <Button type="submit" className="rounded-lg">
                <PackagePlus className="h-4 w-4" /> Thêm
              </Button>
            </div>
          </form>

          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <div className="grid grid-cols-[1.1fr_0.8fr_0.8fr_0.7fr] bg-[var(--surface-container-high)] px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)] md:grid-cols-[1.1fr_0.75fr_0.8fr_0.75fr_0.55fr]">
              <span>Nguyên liệu</span>
              <span>Tồn / min</span>
              <span>Vị trí</span>
              <span>Giá vốn</span>
              <span className="hidden md:block">Sửa/xóa</span>
            </div>
            <div className="max-h-[520px] divide-y divide-[var(--border)] overflow-auto">
              {filteredIngredients.length === 0 ? (
                <p className="p-4 text-sm font-bold text-[var(--muted-foreground)]">Không tìm thấy nguyên liệu thật nào theo bộ lọc hiện tại.</p>
              ) : (
                filteredIngredients.slice(0, 32).map((ingredient) => (
                  <details key={ingredient.id} className="group bg-[var(--surface)]">
                    <summary className="grid cursor-pointer list-none grid-cols-[1.1fr_0.8fr_0.8fr_0.7fr] items-center gap-2 px-3 py-2.5 text-sm transition hover:bg-[var(--soft-surface)] md:grid-cols-[1.1fr_0.75fr_0.8fr_0.75fr_0.55fr]">
                      <div className="min-w-0">
                        <p className="truncate font-black text-[var(--foreground)]">{ingredient.name}</p>
                        <p className="truncate text-[11px] font-bold text-[var(--muted-foreground)]">{ingredient.categoryName || "Chưa nhóm"} · {ingredient.unit}</p>
                      </div>
                      <div>
                        <p className="font-black text-[var(--foreground)]">{formatQuantity(ingredient.onHandQuantity, ingredient.unit)}</p>
                        <p className="text-[11px] font-bold text-[var(--muted-foreground)]">min {formatQuantity(ingredient.minimumQuantity, ingredient.unit)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-[var(--primary)]">{ingredientLocationLabel(ingredient)}</p>
                        <p className="truncate text-[11px] font-semibold text-[var(--muted-foreground)]">{ingredient.storageNote || "Chưa có ghi chú"}</p>
                      </div>
                      <p className="metric-number text-sm font-black text-[var(--foreground)]">{formatVnd(ingredient.referenceUnitCost)}</p>
                      <div className="hidden items-center gap-2 md:flex">
                        <Pencil className="h-4 w-4 text-[var(--primary)]" />
                        <span className="text-xs font-black text-[var(--muted-foreground)] group-open:hidden">Mở</span>
                        <span className="hidden text-xs font-black text-[var(--primary)] group-open:inline">Đang sửa</span>
                      </div>
                    </summary>
                    <div className="border-t border-[var(--border)] bg-[var(--soft-surface)] p-3">
                      <form action={updateInventoryIngredientAction} className="grid gap-2">
                        <input type="hidden" name="ingredientId" value={ingredient.id} />
                        <input type="hidden" name="onHandQuantity" value={ingredient.onHandQuantity} />
                        <div className="grid gap-2 lg:grid-cols-[1fr_0.7fr_0.5fr_0.55fr_0.65fr]">
                          <Input name="name" defaultValue={ingredient.name} required />
                          <select name="categoryId" defaultValue={ingredient.categoryId ?? ""} className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold">
                            <option value="">Chưa nhóm</option>
                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>{category.name}</option>
                            ))}
                          </select>
                          <Input name="unit" defaultValue={ingredient.unit} required />
                          <Input name="minimumQuantity" type="number" min="0" step="0.001" defaultValue={ingredient.minimumQuantity} required />
                          <Input name="referenceUnitCost" type="number" min="0" step="1" defaultValue={ingredient.referenceUnitCost} required />
                        </div>
                        <div className="grid gap-2 lg:grid-cols-[0.8fr_0.6fr_1fr_0.45fr_auto_auto]">
                          <Input name="storageArea" defaultValue={ingredient.storageArea} placeholder="Khu vực" />
                          <Input name="shelfCode" defaultValue={ingredient.shelfCode} placeholder="Kệ/mã vị trí" />
                          <Input name="storageNote" defaultValue={ingredient.storageNote} placeholder="Ghi chú vị trí" />
                          <Input name="reorderLeadDays" type="number" min="0" max="60" step="1" defaultValue={ingredient.reorderLeadDays || ""} placeholder="Lead" />
                          <Button type="submit" size="sm" className="h-11 rounded-lg">Lưu sửa</Button>
                          <button
                            form={`archive-${ingredient.id}`}
                            type="submit"
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-black text-red-700"
                          >
                            <Trash2 className="h-4 w-4" /> Xóa
                          </button>
                        </div>
                      </form>
                      <form id={`archive-${ingredient.id}`} action={deactivateInventoryIngredientAction}>
                        <input type="hidden" name="ingredientId" value={ingredient.id} />
                      </form>
                    </div>
                  </details>
                ))
              )}
            </div>
          </div>
        </div>

        <aside className="grid gap-3">
          <FormPanel icon={MapPin} title="Bản đồ vị trí kho" subtitle="Nhóm theo khu vực lưu trữ thật">
            <div className="space-y-2">
              {storageAreas.length === 0 ? (
                <p className="rounded-xl bg-[var(--surface-container-high)] p-3 text-sm font-semibold text-[var(--muted-foreground)]">Chưa có dữ liệu vị trí. Hãy gán khu vực/kệ khi thêm hoặc sửa nguyên liệu.</p>
              ) : (
                storageAreas.map(([area, stats]) => (
                  <div key={area} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-black text-[var(--foreground)]">{area}</p>
                      <Badge tone={area === "Chưa định vị" ? "yellow" : "green"}>{stats.count} SKU</Badge>
                    </div>
                    <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">Giá trị tồn {formatVnd(stats.value)}</p>
                  </div>
                ))
              )}
            </div>
          </FormPanel>

          <FormPanel icon={AlertTriangle} title="Cảnh báo sớm" subtitle="Ưu tiên xử lý trước khi hết hàng">
            <div className="space-y-2">
              {topReorderSuggestions.length === 0 ? (
                <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900">Chưa có nguyên liệu nào chạm ngưỡng cảnh báo.</p>
              ) : (
                topReorderSuggestions.slice(0, 4).map((item) => {
                  const ingredient = ingredients.find((entry) => entry.id === item.ingredientId);
                  return (
                    <div key={`early-${item.ingredientId}`} className="rounded-xl bg-[var(--surface-container-high)] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-[var(--foreground)]">{item.name}</p>
                          <p className="truncate text-xs font-bold text-[var(--muted-foreground)]">
                            {ingredient ? ingredientLocationLabel(ingredient) : "Chưa định vị"} · còn {formatDaysLeft(item.daysLeft)}
                          </p>
                        </div>
                        <Badge tone={priorityTone(item.urgency)}>{priorityLabel(item.urgency)}</Badge>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </FormPanel>
        </aside>
      </section>
      ) : null}

      {activeDesk === "receive" ? (
      <section className="dashboard-panel p-3 md:p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">AI Intake</p>
            <h2 className="mt-0.5 text-lg font-bold text-[var(--foreground)]">Nhập hàng đa phương thức</h2>
          </div>
          <span className="dashboard-stat-icon shrink-0">
            <BrainCircuit size={18} />
          </span>
        </div>

        <input ref={fileInputRef} className="hidden" type="file" accept=".txt,.json,.csv,image/*" onChange={handleFileUpload} />
        <div className="grid gap-3 xl:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)]">
          <div className="space-y-2.5">
            <div className="grid grid-cols-4 gap-2">
              <ModeButton active={intakeMode === "text"} icon={Wand2} label="Text AI" onClick={() => setIntakeMode("text")} />
              <ModeButton active={intakeMode === "file"} icon={Upload} label="File" onClick={() => fileInputRef.current?.click()} />
              <ModeButton active={intakeMode === "voice"} icon={AudioLines} label="Voice" onClick={() => setIntakeMode("voice")} />
              <ModeButton active={intakeMode === "ocr"} icon={Camera} label="OCR" onClick={() => fileInputRef.current?.click()} />
            </div>
            <Textarea
              className="min-h-20 rounded-xl bg-[var(--soft-surface)] py-2 text-sm"
              value={rawIntake}
              onChange={(event) => setRawIntake(event.target.value)}
              placeholder="Dán hóa đơn, danh sách nhập hàng, JSON hoặc nói bằng giọng nói..."
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => runParser()} disabled={isParsing} size="sm" className="rounded-lg">
                <Sparkles className="h-4 w-4" /> Phân tích
              </Button>
              <Button type="button" variant="secondary" onClick={() => runInventoryAiOcr({ rawText: rawIntake })} disabled={aiOcrLoading} size="sm" className="rounded-lg">
                <BrainCircuit className="h-4 w-4" /> {aiOcrLoading ? "Đang đọc..." : "AI đọc nâng cao"}
              </Button>
              <Button type="button" variant="secondary" onClick={startVoiceInput} size="sm" className="rounded-lg">
                <AudioLines className="h-4 w-4" /> {isListening ? "Đang nghe..." : "Voice"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => fileInputRef.current?.click()} size="sm" className="rounded-lg">
                <FileJson className="h-4 w-4" /> File/OCR
              </Button>
            </div>
            <p className="rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2 text-xs font-semibold text-[var(--muted-foreground)]">{parserMessage}</p>
            {aiOcrError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{aiOcrError}</p> : null}
          </div>

          <form action={importAction} className="space-y-2.5">
            <input type="hidden" name="rowsJson" value={rowsJson} />
            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">Bảng nháp</p>
                  <p className="text-[11px] font-medium text-[var(--muted-foreground)]">{draftRows.length} dòng · {formatVnd(importTotalValue)}</p>
                </div>
                <Badge tone={draftRows.length > 0 ? "green" : "neutral"}>{draftRows.length > 0 ? "Sẵn sàng" : "Trống"}</Badge>
              </div>
              <div className="max-h-40 overflow-auto">
                {draftRows.length === 0 ? (
                  <div className="grid min-h-20 place-items-center px-4 text-center text-sm font-medium text-[var(--muted-foreground)]">
                    Chưa có dòng hợp lệ.
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border)]">
                    {draftRows.map((row, index) => (
                      <div key={`${row.name}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[var(--foreground)]">{row.name}</p>
                          <p className="truncate text-[11px] font-medium text-[var(--muted-foreground)]">
                            {row.categoryName || "Chưa nhóm"} · min {row.minimumQuantity.toLocaleString("vi-VN")} · giá {formatVnd(row.referenceUnitCost)}
                          </p>
                        </div>
                        <p className="metric-number text-right text-sm font-bold text-[var(--primary)]">{formatQuantity(row.quantity, row.unit)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {importState?.error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{importState.error}</p> : null}
            {importState?.success ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{importState.success}</p> : null}
            <Button type="submit" disabled={draftRows.length === 0 || importPending} className="w-full rounded-lg">
              <PackagePlus className="h-4 w-4" /> {importPending ? "Đang nhập vào kho..." : "Nhập vào kho thật"}
            </Button>
          </form>
        </div>
      </section>
      ) : null}

      {activeDesk === "alerts" ? (
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SignalCard icon={AlertTriangle} label="Thiếu hàng cần xử lý" value={snapshot.lowStockCount.toLocaleString("vi-VN")} hint={`Min-gap ${formatVnd(lowStockValue)}`} tone={snapshot.lowStockCount > 0 ? "danger" : "safe"} />
        <SignalCard icon={PackagePlus} label="AI đề xuất mua" value={formatVnd(intelligence.projectedPurchaseValue)} hint={`${intelligence.reorderSuggestions.length} nguyên liệu`} tone={intelligence.projectedPurchaseValue > 0 ? "danger" : "safe"} />
        <SignalCard icon={Activity} label="Burn 7 ngày" value={formatVnd(intelligence.weeklyUsageValue)} hint="Ước tính theo ledger 30 ngày" />
        <SignalCard icon={ReceiptText} label="Risk signals" value={`${intelligence.wasteSignals.length + intelligence.priceSignals.length}`} hint={`${intelligence.wasteSignals.length} hao hụt · ${intelligence.priceSignals.length} giá`} />
      </section>
      ) : null}

      {activeDesk === "ledger" ? (
      <section className="grid gap-3 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-3">
          <div className="dashboard-panel p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Control tower</p>
                <h2 className="mt-1 text-lg font-bold text-[var(--foreground)]">Tình trạng nguyên liệu</h2>
              </div>
              <Badge tone={snapshot.lowStockCount > 0 ? "red" : "green"}>{snapshot.lowStockCount > 0 ? "Cần mua ngay" : "Đủ an toàn"}</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {snapshot.lowStockIngredients.length === 0 ? (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-900 md:col-span-2">
                  <CheckCircle2 className="mb-3 h-6 w-6" />
                  <p className="font-black">Không có nguyên liệu dưới định mức.</p>
                  <p className="mt-1 text-sm font-semibold text-emerald-800">Kho đang khỏe, có thể tập trung hoàn thiện định mức món.</p>
                </div>
              ) : (
                snapshot.lowStockIngredients.slice(0, 6).map((ingredient) => {
                  const reorder = suggestedReorderQuantity(ingredient.onHandQuantity, ingredient.minimumQuantity);
                  return (
                    <div key={ingredient.id} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-[var(--foreground)]">{ingredient.name}</p>
                          <p className="text-xs font-medium text-[var(--muted-foreground)]">
                            Tồn {formatQuantity(ingredient.onHandQuantity, ingredient.unit)} / min {formatQuantity(ingredient.minimumQuantity, ingredient.unit)}
                          </p>
                        </div>
                        <Badge tone="red">Mua {formatQuantity(reorder, ingredient.unit)}</Badge>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-container-high)]">
                        <div
                          className="h-full rounded-full bg-[var(--accent)]"
                          style={{ width: `${Math.min(100, (ingredient.onHandQuantity / Math.max(ingredient.minimumQuantity, 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="grid gap-3">
            <FormPanel icon={ArrowDownUp} title="Ghi movement" subtitle="Nhập, điều chỉnh, hao hụt có ledger">
              <form action={recordInventoryMovementAction} className="grid gap-3">
                <select name="ingredientId" className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold" required>
                  <option value="">Chọn nguyên liệu</option>
                  {ingredients.map((ingredient) => (
                    <option key={ingredient.id} value={ingredient.id}>
                      {ingredient.name} · {formatQuantity(ingredient.onHandQuantity, ingredient.unit)}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <select name="movementType" className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold" required>
                    {movementTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  <Input name="quantity" type="number" min="0.001" step="0.001" placeholder="Số lượng" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input name="unitCost" type="number" min="0" step="1" placeholder="Giá vốn nếu nhập" />
                  <Input name="reason" placeholder="Lý do" />
                </div>
                <Button type="submit" className="rounded-xl">Ghi ledger</Button>
              </form>
            </FormPanel>
          </div>
        </div>

        <aside className="space-y-3">
          <FormPanel icon={Layers3} title="Nhóm nguyên liệu" subtitle="Tổ chức kho để lọc và báo cáo">
            <form action={createInventoryCategoryAction} className="flex gap-2">
              <Input name="name" placeholder="Ví dụ: Bar, Bếp nóng..." required />
              <Button type="submit" size="sm" className="h-11 rounded-xl">Thêm</Button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {categories.length === 0 ? <span className="text-sm font-bold text-[var(--muted-foreground)]">Chưa có nhóm.</span> : null}
              {categories.map((category) => (
                <Badge key={category.id} tone="blue">{category.name}</Badge>
              ))}
            </div>
          </FormPanel>

          <FormPanel icon={ClipboardCheck} title="Định mức món" subtitle="Nối menu với nguyên liệu để tự trừ kho">
            <form action={upsertInventoryRecipeLineAction} className="grid gap-3">
              <select name="menuItemId" className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold" required>
                <option value="">Chọn món</option>
                {recipeMenuItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select name="ingredientId" className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold" required>
                <option value="">Chọn nguyên liệu</option>
                {ingredients.map((ingredient) => (
                  <option key={ingredient.id} value={ingredient.id}>
                    {ingredient.name} ({ingredient.unit})
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <Input name="quantityPerItem" type="number" min="0.001" step="0.001" placeholder="Lượng / món" required />
                <Input name="wastePercent" type="number" min="0" max="100" step="0.1" placeholder="Hao hụt %" />
              </div>
              <Button type="submit" className="rounded-xl">Lưu định mức</Button>
            </form>
            {recipeBacklog.length > 0 ? (
              <div className="mt-4 rounded-xl bg-[var(--soft-surface)] p-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Cần hoàn thiện</p>
                <div className="mt-2 space-y-2">
                  {recipeBacklog.map((item) => (
                    <p key={item.id} className="text-sm font-bold text-[var(--foreground)]">{item.name}</p>
                  ))}
                </div>
              </div>
            ) : null}
          </FormPanel>

          <FormPanel icon={ScanLine} title="AI risk radar" subtitle="Hao hụt và biến động giá tự nổi lên">
            <div className="space-y-2">
              {intelligence.wasteSignals.length === 0 && intelligence.priceSignals.length === 0 ? (
                <p className="rounded-xl bg-[var(--surface-container-high)] p-3 text-sm font-semibold text-[var(--muted-foreground)]">
                  Chưa có tín hiệu bất thường trong 30 ngày. Khi có waste hoặc giá nhập lệch, AI sẽ đưa vào hàng đợi.
                </p>
              ) : null}
              {intelligence.wasteSignals.slice(0, 3).map((item) => (
                <div key={`waste-${item.ingredientId}`} className="rounded-xl bg-[var(--surface-container-high)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-black text-[var(--foreground)]">{item.name}</p>
                    <Badge tone="red">{formatVnd(item.wasteCost)}</Badge>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">
                    Hao hụt {formatQuantity(item.wasteQuantity, item.unit)} · {item.movementCount} lần ghi nhận
                  </p>
                </div>
              ))}
              {intelligence.priceSignals.slice(0, 3).map((item) => (
                <div key={`price-${item.ingredientId}`} className="rounded-xl bg-[var(--surface-container-high)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-black text-[var(--foreground)]">{item.name}</p>
                    <Badge tone={item.changePercent > 0 ? "yellow" : "green"}>
                      {item.changePercent > 0 ? "+" : ""}
                      {item.changePercent}%
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">
                    {formatVnd(item.previousUnitCost)} → {formatVnd(item.latestUnitCost)}
                  </p>
                </div>
              ))}
            </div>
          </FormPanel>
        </aside>
      </section>
      ) : null}

      {activeDesk === "ledger" ? (
      <>
      <section className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="dashboard-panel p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Ledger</p>
              <h2 className="mt-1 text-lg font-bold">Dòng kho gần đây</h2>
            </div>
            <ReceiptText className="h-6 w-6 text-[var(--accent)]" />
          </div>
          <div className="space-y-3">
            {snapshot.recentMovements.length === 0 ? (
              <p className="rounded-2xl bg-[var(--surface-container-high)] p-4 text-sm font-bold text-[var(--muted-foreground)]">Chưa có movement nào.</p>
            ) : (
              snapshot.recentMovements.slice(0, 8).map((movement) => (
                <div key={movement.id} className="rounded-2xl border border-[var(--border)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black">{movement.ingredientName}</p>
                      <p className="text-sm font-semibold text-[var(--muted-foreground)]">
                        {formatDateTime(movement.createdAt)} · {movement.reason || movement.sourceType}
                      </p>
                    </div>
                    <Badge tone={movementTone(movement.movementType)}>{movementLabel(movement.movementType)}</Badge>
                  </div>
                  <p className="mt-2 text-lg font-black text-[var(--primary)]">
                    {movement.quantityDelta > 0 ? "+" : ""}
                    {formatQuantity(movement.quantityDelta, movement.ingredientUnit)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="dashboard-panel p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Master data</p>
              <h2 className="mt-1 text-lg font-bold">Danh mục nguyên liệu</h2>
            </div>
            <Zap className="h-6 w-6 text-[var(--accent)]" />
          </div>
          <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
            <div className="grid grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr] bg-[var(--surface-container-high)] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              <span>Nguyên liệu</span>
              <span>Tồn</span>
              <span>Min</span>
              <span>Giá vốn</span>
            </div>
            <div className="max-h-[420px] divide-y divide-[var(--border)] overflow-auto">
              {topIngredients.length === 0 ? (
                <p className="p-4 text-sm font-bold text-[var(--muted-foreground)]">Chưa có nguyên liệu. Hãy dùng AI intake hoặc tạo thủ công.</p>
              ) : (
                topIngredients.map((ingredient) => (
                  <div key={ingredient.id} className="grid grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr] items-center px-4 py-3 text-sm">
                    <div>
                      <p className="font-black">{ingredient.name}</p>
                      <p className="text-xs font-bold text-[var(--muted-foreground)]">{ingredient.categoryName || "Chưa nhóm"}</p>
                    </div>
                    <span className="font-bold">{formatQuantity(ingredient.onHandQuantity, ingredient.unit)}</span>
                    <span className="font-bold">{formatQuantity(ingredient.minimumQuantity, ingredient.unit)}</span>
                    <span className="font-bold">{formatVnd(ingredient.referenceUnitCost)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-panel p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Recipe costing</p>
            <h2 className="mt-1 text-lg font-bold">Định mức đang áp dụng</h2>
          </div>
          <FileText className="h-6 w-6 text-[var(--accent)]" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {recipeMenuItems.slice(0, 8).map((item) => (
            <div key={item.id} className="rounded-2xl border border-[var(--border)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black">{item.name}</p>
                  <p className="text-sm font-semibold text-[var(--muted-foreground)]">
                    Cost {formatVnd(item.totalRecipeCost)} · {formatPercent(item.recipeCostPercent)}
                  </p>
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
                        <button type="submit" className="font-black text-[var(--danger)]">Xóa</button>
                      </form>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
      </>
      ) : null}
    </div>
  );
}

function DeskTab({
  active,
  icon: Icon,
  label,
  helper,
  badge,
  onClick
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  helper: string;
  badge: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-h-20 items-center gap-3 rounded-xl border p-3 text-left transition ${
        active
          ? "border-[var(--primary)] bg-[var(--primary-soft)] shadow-sm"
          : "border-transparent bg-[var(--soft-surface)] hover:border-[var(--border)] hover:bg-[var(--surface)]"
      }`}
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
          active ? "bg-[var(--primary)] text-white" : "bg-[var(--surface)] text-[var(--primary)]"
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-black text-[var(--foreground)]">{label}</span>
        <span className="block truncate text-xs font-semibold text-[var(--muted-foreground)]">{helper}</span>
      </span>
      <span className={`rounded-full px-2 py-1 text-[11px] font-black ${active ? "bg-white/80 text-[var(--primary)]" : "bg-[var(--surface)] text-[var(--muted-foreground)]"}`}>
        {badge}
      </span>
    </button>
  );
}

function CommandMetric({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">{label}</p>
      <p className="metric-number mt-1 text-xl font-bold text-[var(--foreground)]">{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">{hint}</p>
    </div>
  );
}

function MiniInsight({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{label}</p>
      <p className="metric-number mt-0.5 text-base font-black text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function ModeButton({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2.5 text-xs font-bold transition ${
        active
          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--foreground)]"
      }`}
    >
      <Icon className="mx-auto mb-1 h-5 w-5" />
      {label}
    </button>
  );
}

function SignalCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default"
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "danger" | "safe";
}) {
  return (
    <div
      className={`admin-stat-tile rounded-[14px] p-4 ${
        tone === "danger"
          ? "border-[#F2C4AA] bg-[#FFF2E8]"
          : tone === "safe"
            ? "border-emerald-100 bg-emerald-50"
            : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="dashboard-stat-icon">
          <Icon size={18} />
        </span>
        <Sparkles className="h-4 w-4 text-[var(--accent)]" />
      </div>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{label}</p>
      <p className="metric-number mt-1 text-2xl font-semibold text-[var(--foreground)]">{value}</p>
      <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">{hint}</p>
    </div>
  );
}

function FormPanel({
  icon: Icon,
  title,
  subtitle,
  children
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="dashboard-panel p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="dashboard-stat-icon shrink-0">
          <Icon size={18} />
        </span>
        <div>
          <h3 className="text-lg font-bold">{title}</h3>
          <p className="text-sm font-medium text-[var(--muted-foreground)]">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock3,
  Coffee,
  CreditCard,
  Hash,
  ImagePlus,
  Info,
  Layers3,
  ListChecks,
  Loader2,
  LocateFixed,
  MapPin,
  Minus,
  Phone,
  Plus,
  PlusCircle,
  QrCode,
  Rocket,
  RotateCcw,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Table2,
  Tag,
  Utensils,
  Wand2,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { onboardingAction } from "@/app/dashboard/actions";
import { fontVars } from "@/components/landing-v2/fonts";
import { useDialogFocusTrap } from "@/components/dashboard/dialog-focus";
import { useDashboardOverlay } from "@/components/dashboard/use-dashboard-overlay";
import { featureCatalog, planCatalog } from "@/lib/billing/catalog";
import { getOnboardingTableLimit } from "@/lib/billing/plan-limits";
import type { BillingFeatureKey, BillingPlanCode } from "@/lib/billing/types";
import { buildOnboardingRunway, formatDraftSavedLabel } from "@/lib/onboarding-runway";
import { createSlug } from "@/lib/slug";
import { createMapSessionToken, fetchAddressPredictions, resolveAddressPrediction } from "@/services/maps/client-address-service";
import type { AddressAutocompletePrediction } from "@/services/maps/types";
import { InteractiveStorePreview } from "@/components/dashboard/interactive-store-preview";
import { cn } from "@/lib/utils";

type BusinessPreset = {
  id: string;
  label: string;
  value: "CAFE" | "RESTAURANT" | "FAST_FOOD" | "BAR" | "OTHER";
  icon: typeof Coffee;
};

type StepMeta = {
  eyebrow: string;
  title: string;
  description: string;
  outcome: string;
  icon: LucideIcon;
};

type OnboardingPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthly_price: number;
  trial_days: number;
  features: string[];
};

type PlanCode = string;
type AddressSuggestion = AddressAutocompletePrediction;
type PlanDisplayMode = "decision" | "compare" | "ai";
type PlanEntitlementState = "included" | "trial" | "locked";
type AdminProvince = {
  code: string;
  name: string;
  wardCount: number;
};
type AdminWard = {
  code: string;
  name: string;
  provinceCode: string;
};
type OnboardingDraft = {
  version: 2;
  updatedAt: number;
  name: string;
  slug: string;
  businessPresetId: string;
  customBusinessType: string;
  provinceCode: string;
  province: string;
  district: string;
  wardCode: string;
  ward: string;
  streetAddress: string;
  selectedAddress: string;
  storeLat: string;
  storeLng: string;
  locationAccuracy: number | null;
  hotline: string;
  planCode: string;
  tableCount: number;
  itemName: string;
  itemPrice: string;
  itemCategory: string;
  confirmedMenuItems: OcrMenuItem[];
};
type StoredOnboardingDraft = Partial<Omit<OnboardingDraft, "version">> & {
  version?: 1 | 2;
};
type OcrDraft = {
  categories: Array<{
    name: string;
    items: Array<{
      name: string;
      price: number;
      description: string | null;
      tags: string[];
    }>;
  }>;
  warnings: string[];
  confidence: number;
};
type OcrMenuItem = {
  categoryName: string;
  name: string;
  price: number;
};
type AiQuota = {
  used: number;
  limit: number;
  remaining: number;
  planCode: string;
};
type ApiResponse<T> = { ok: true; data: T } | { ok: false; error?: string };

const businessPresets: BusinessPreset[] = [
  { id: "cafe", label: "Cafe", value: "CAFE", icon: Coffee },
  { id: "tea", label: "Trà sữa", value: "CAFE", icon: Coffee },
  { id: "restaurant", label: "Nhà hàng", value: "RESTAURANT", icon: Utensils },
  { id: "food", label: "Quán ăn", value: "FAST_FOOD", icon: Store },
  { id: "custom", label: "Khác", value: "OTHER", icon: PlusCircle }
];

const steps = ["Thông tin quán", "Chọn gói", "Bàn & QR", "Menu"];

/* Motion presets — định nghĩa lại sau lần refactor trước (đang được tham chiếu ở SectionCard + step wrapper). */
const onboardingEase = [0.22, 1, 0.36, 1] as const;
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: onboardingEase } }
};
const stepTransition = { duration: 0.3, ease: onboardingEase };

const launchMessages = [
  "Đang chuẩn bị quán của bạn...",
  "Khởi tạo dashboard vận hành...",
  "Tạo bàn và QR ordering system...",
  "Lưu menu đầu tiên...",
  "Bật checklist sẵn sàng bán thật..."
];

const stepDetails: StepMeta[] = [
  {
    eyebrow: "Bước 1",
    title: "Định danh quán",
    description: "Lấy đủ thông tin cốt lõi để LogiVN tạo hồ sơ quán, vị trí và kênh liên hệ.",
    outcome: "Sau bước này dashboard biết quán của bạn là ai và phục vụ ở đâu.",
    icon: Store
  },
  {
    eyebrow: "Bước 2",
    title: "Chọn gói vận hành",
    description: "So sánh gói bằng tính năng thực tế: QR ordering, AI, báo cáo, nhân sự và mở rộng chi nhánh.",
    outcome: "Chọn gói theo cách quán vận hành hôm nay và kế hoạch tăng trưởng tháng tới.",
    icon: CreditCard
  },
  {
    eyebrow: "Bước 3",
    title: "Bàn & QR",
    description: "Tạo số bàn ban đầu để sau khi vào dashboard có thể in QR hoặc chỉnh sơ đồ phục vụ.",
    outcome: "QR ordering được dựng sẵn thay vì bắt đầu từ trang trắng.",
    icon: QrCode
  },
  {
    eyebrow: "Bước 4",
    title: "Menu đầu tiên",
    description: "Thêm món mẫu hoặc dùng AI đọc ảnh menu để LogiVN tạo danh mục bán hàng đầu tiên.",
    outcome: "Dashboard mở ra với dữ liệu thật, không phải empty state lạnh lẽo.",
    icon: Wand2
  }
];

const fallbackPlanFeatures: Record<string, string[]> = {
  pro: [
    "Tối đa 20 bàn và QR theo bàn",
    "10 tài khoản nhân viên cho ca vận hành đầu tiên",
    "Dashboard doanh thu, món bán chạy và nguồn đơn",
    "Thanh toán VietQR và đối soát bill cơ bản",
    "Tối đa 500 món menu và pickup/delivery cơ bản",
    "Checklist setup và hướng dẫn vận hành ngày đầu"
  ],
  premium: [
    "Tất cả tính năng của Pro",
    "Mở rộng đến 300 bàn và 50 nhân viên",
    "AI gợi ý menu, vận hành và cơ hội tăng trưởng",
    "Báo cáo nâng cao cho doanh thu, giờ cao điểm và chi nhánh",
    "Tối đa 2.000 món menu và phân quyền chi tiết hơn",
    "QR branding, trải nghiệm khách cao cấp hơn",
    "Sẵn sàng mở rộng theo giới hạn vận hành an toàn"
  ]
};

const planDisplayModes: Array<{ id: PlanDisplayMode; label: string; compactLabel: string; caption: string; icon: LucideIcon }> = [
  { id: "decision", label: "Tổng quan", compactLabel: "Tổng quan", caption: "Lý do chọn nhanh", icon: BadgeCheck },
  { id: "compare", label: "So sánh", compactLabel: "So sánh", caption: "Giới hạn & quota", icon: Layers3 },
  { id: "ai", label: "AI & mở rộng", compactLabel: "AI", caption: "Premium delta", icon: Sparkles }
];

const modalFeatureGroups: Array<{ title: string; keys: BillingFeatureKey[] }> = [
  {
    title: "Nền tảng bán hàng",
    keys: ["tables", "staff", "qr_ordering", "payment_qr", "menu_management", "online_ordering", "branding_basic", "advanced_permissions"]
  },
  {
    title: "AI, báo cáo & xuất dữ liệu",
    keys: ["basic_analytics", "export_pdf", "ai_menu_generation", "ai_chatbot", "ai_image_generation", "ai_analytics", "advanced_ai_assistant", "realtime_insight"]
  },
  {
    title: "Tăng trưởng & nhận diện",
    keys: ["advanced_reports", "ai_marketing", "ai_branding", "loyalty_system", "advanced_qr_branding", "custom_domain"]
  },
  {
    title: "Tự động hóa & mở rộng",
    keys: ["advanced_automation", "ai_automation", "automation_workflow"]
  }
];

const planCompareKeys: BillingFeatureKey[] = [
  "tables",
  "staff",
  "menu_management",
  "ai_menu_generation",
  "ai_chatbot",
  "ai_image_generation",
  "ai_analytics",
  "advanced_reports",
  "automation_workflow",
  "custom_domain"
];

const planAiKeys: BillingFeatureKey[] = [
  "ai_menu_generation",
  "ai_chatbot",
  "ai_image_generation",
  "ai_analytics",
  "ai_marketing",
  "advanced_ai_assistant",
  "automation_workflow"
];

const field =
  "h-11 w-full rounded-[var(--d-r-md)] border border-[var(--d-line-strong)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-medium text-[var(--d-text)] outline-none transition placeholder:text-[var(--d-text-faint)] focus:border-[var(--d-jade)] focus:ring-2 focus:ring-[var(--d-jade)]/15";
const iconField = `${field} pl-10`;
const fieldLabel = "grid gap-1.5 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]";
const microLabel = "grid gap-1.5 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]";

function formatVnd(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(value)}đ`;
}

function formatFeatureNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function normalizeBillingPlanCode(value: string): BillingPlanCode {
  return value.toLowerCase() === "premium" ? "premium" : "pro";
}

function billingPlanFor(plan: OnboardingPlan) {
  return planCatalog[normalizeBillingPlanCode(plan.code)];
}

function planDisplayName(plan: OnboardingPlan) {
  return billingPlanFor(plan).name;
}

function quotaWindowLabel(window: "daily" | "monthly" | "lifetime") {
  if (window === "daily") return "ngày";
  if (window === "lifetime") return "trọn đời";
  return "tháng";
}

function entitlementState(planCode: BillingPlanCode, featureKey: BillingFeatureKey): PlanEntitlementState {
  const entitlement = planCatalog[planCode].entitlements[featureKey];
  if (entitlement.included) return "included";
  if (entitlement.accessMode === "trial") return "trial";
  return "locked";
}

function entitlementLabel(planCode: BillingPlanCode, featureKey: BillingFeatureKey, compact = false) {
  const entitlement = planCatalog[planCode].entitlements[featureKey];
  if (entitlement.included) {
    if (typeof entitlement.limit === "number" && entitlement.unit) return `${formatFeatureNumber(entitlement.limit)} ${entitlement.unit}`;
    if (entitlement.quota) {
      const limit = entitlement.quota.limit === null ? "không giới hạn" : formatFeatureNumber(entitlement.quota.limit);
      return `${limit} ${entitlement.quota.unit}/${quotaWindowLabel(entitlement.quota.window)}`;
    }
    return compact ? "Có" : "Có trong gói";
  }

  if (entitlement.accessMode === "trial" && entitlement.quota) {
    const limit = entitlement.quota.limit === null ? "không giới hạn" : formatFeatureNumber(entitlement.quota.limit);
    return compact ? `Trial ${limit} ${entitlement.quota.unit}` : `Dùng thử ${limit} ${entitlement.quota.unit}/${quotaWindowLabel(entitlement.quota.window)}`;
  }

  return compact ? "Premium" : entitlement.preview ? `Mở khóa ở Premium: ${entitlement.preview}` : "Chỉ có ở Premium";
}

function entitlementBadgeLabel(state: PlanEntitlementState) {
  if (state === "included") return "Có trong gói";
  if (state === "trial") return "Dùng thử";
  return "Premium";
}

function entitlementDetailValue(planCode: BillingPlanCode, featureKey: BillingFeatureKey) {
  const state = entitlementState(planCode, featureKey);
  if (state === "locked") return "Nâng cấp Premium";
  return entitlementLabel(planCode, featureKey);
}

function entitlementDetailDescription(planCode: BillingPlanCode, featureKey: BillingFeatureKey) {
  const entitlement = planCatalog[planCode].entitlements[featureKey];
  if (!entitlement.included && entitlement.preview) return entitlement.preview;
  return featureCatalog[featureKey].description;
}

function planFeatureList(plan: OnboardingPlan) {
  const catalog = billingPlanFor(plan);
  const catalogItems = modalFeatureGroups.flatMap((group) =>
    group.keys.flatMap((featureKey) => {
      const state = entitlementState(catalog.code, featureKey);
      if (state === "locked") return [];
      return `${featureCatalog[featureKey].label}: ${entitlementLabel(catalog.code, featureKey)}`;
    })
  );
  const fromPlan = plan.features.map((feature) => feature.trim()).filter(Boolean);
  const fallback = fallbackPlanFeatures[plan.code.toLowerCase()] ?? fallbackPlanFeatures.pro;
  return catalogItems.length > 0 ? catalogItems : fromPlan.length > 0 ? fromPlan : fallback;
}

function planFeatureGroups(plan: OnboardingPlan) {
  const catalog = billingPlanFor(plan);
  return modalFeatureGroups.map((group) => {
    const items = group.keys.map((featureKey) => {
      const state = entitlementState(catalog.code, featureKey);
      return {
        key: featureKey,
        label: featureCatalog[featureKey].label,
        value: entitlementDetailValue(catalog.code, featureKey),
        description: entitlementDetailDescription(catalog.code, featureKey),
        state,
        badge: entitlementBadgeLabel(state)
      };
    });

    return {
      title: group.title,
      includedCount: items.filter((item) => item.state !== "locked").length,
      totalCount: items.length,
      items
    };
  });
}

function planNarrative(plan: OnboardingPlan) {
  const catalog = billingPlanFor(plan);
  const isPremium = catalog.code === "premium";
  return {
    badge: isPremium ? "Khuyến nghị cho tăng trưởng" : "Bắt đầu gọn nhẹ",
    fit: catalog.summary,
    promise: isPremium ? "AI, báo cáo sâu, automation và giới hạn vận hành lớn hơn." : "QR ordering, menu, VietQR, online, kho và AI cơ bản để bán thật ngay.",
    decision: isPremium ? "Chọn Premium nếu muốn tăng tốc bằng AI và mở rộng đội ngũ" : "Chọn Pro nếu muốn khởi động chắc chắn với chi phí gọn"
  };
}

function planModeRows(plan: OnboardingPlan, mode: PlanDisplayMode) {
  const catalog = billingPlanFor(plan);
  if (mode === "decision") {
    return catalog.highlights.slice(0, 5).map((item) => ({ label: item, value: "", state: "included" as const }));
  }

  const keys = mode === "ai" ? planAiKeys : planCompareKeys;
  return keys.map((featureKey) => ({
    label: featureCatalog[featureKey].label,
    value: entitlementLabel(catalog.code, featureKey, true),
    state: entitlementState(catalog.code, featureKey)
  }));
}

function planFeatureCount(plan: OnboardingPlan) {
  return planFeatureList(plan).length;
}

function formatTableName(index: number) {
  if (index === 2) return "Bàn VIP";
  return `Bàn ${String(index + 1).padStart(2, "0")}`;
}

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function locationQualityLabel(accuracy: number | null) {
  if (!accuracy) return "Chưa ghim vị trí";
  if (accuracy <= 25) return `Rất chính xác ±${Math.round(accuracy)}m`;
  if (accuracy <= 80) return `Khá chính xác ±${Math.round(accuracy)}m`;
  return `Cần chỉnh lại pin ±${Math.round(accuracy)}m`;
}

function shortText(value: string, fallback = "Chưa có") {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.length > 30 ? `${trimmed.slice(0, 29)}...` : trimmed;
}

function readOnboardingDraft(draftKey: string) {
  if (typeof window === "undefined") return null;

  try {
    const rawDraft = window.localStorage.getItem(draftKey);
    if (!rawDraft) return null;
    const draft = JSON.parse(rawDraft) as StoredOnboardingDraft;
    if (draft.version !== 1 && draft.version !== 2) return null;
    return {
      ...draft,
      version: 2,
      updatedAt: typeof draft.updatedAt === "number" ? draft.updatedAt : 0,
      confirmedMenuItems: Array.isArray(draft.confirmedMenuItems) ? draft.confirmedMenuItems : []
    } as Partial<OnboardingDraft>;
  } catch {
    return null;
  }
}

function flattenOcrDraft(draft: OcrDraft | null): OcrMenuItem[] {
  if (!draft) return [];
  return draft.categories.flatMap((category) =>
    category.items.map((item) => ({
      categoryName: category.name,
      name: item.name,
      price: item.price
    }))
  );
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Không đọc được ảnh menu."));
    reader.readAsDataURL(file);
  });
}

function PlanDisplayModeToggle({
  mode,
  onChange,
  compact = false
}: {
  mode: PlanDisplayMode;
  onChange: (mode: PlanDisplayMode) => void;
  compact?: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="Chọn chế độ hiển thị gói"
      className="inline-flex shrink-0 items-center gap-1 rounded-[var(--d-r-pill)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-1"
    >
      {planDisplayModes.map((item) => {
        const active = mode === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[var(--d-r-pill)] px-3 py-1.5 text-[length:var(--d-fs-xs)] font-semibold transition",
              active ? "bg-[var(--d-jade)] text-[var(--d-on-jade)] shadow-[var(--d-sh-sm)]" : "text-[var(--d-text-muted)] hover:text-[var(--d-text)]"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{compact ? item.compactLabel : item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function PlanModeContent({ plan, mode, compact = false }: { plan: OnboardingPlan; mode: PlanDisplayMode; compact?: boolean }) {
  const rows = planModeRows(plan, mode);
  const visibleRows = compact && mode !== "decision" ? rows.slice(0, 5) : rows;
  const catalog = billingPlanFor(plan);

  if (mode === "decision") {
    return (
      <div className="mt-3 grid gap-2">
        <p className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">{catalog.heroLabel}</p>
        <div className="grid gap-1.5">
          {rows.map((row) => (
            <span key={row.label} className="flex items-center gap-2 text-[length:var(--d-fs-sm)] font-medium text-[var(--d-text)]">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--d-jade)]" />
              {row.label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 grid gap-1.5">
      {visibleRows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-3 rounded-[var(--d-r-sm)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-2.5 py-1.5 text-[length:var(--d-fs-xs)]"
        >
          <span className="min-w-0 truncate font-medium text-[var(--d-text-muted)]">{row.label}</span>
          <strong className={cn("shrink-0 font-bold", row.state === "locked" ? "text-[var(--d-text-faint)]" : "text-[var(--d-text)]")}>{row.value}</strong>
        </div>
      ))}
      {visibleRows.length < rows.length ? (
        <p className="text-[length:var(--d-fs-2xs)] font-semibold text-[var(--d-text-faint)]">+{rows.length - visibleRows.length} mục trong chi tiết gói</p>
      ) : null}
    </div>
  );
}

function PlanFeaturesModal({
  plan,
  allPlans,
  onClose,
  onSelect
}: {
  plan: OnboardingPlan;
  allPlans: OnboardingPlan[];
  onClose: () => void;
  onSelect: () => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const groups = planFeatureGroups(plan);
  const narrative = planNarrative(plan);
  const comparisonPlans = allPlans.length > 0 ? allPlans : [plan];
  const portalTarget = useDashboardOverlay(true);

  useDialogFocusTrap({ containerRef: panelRef, onClose, open: true });

  if (!portalTarget) return null;

  return createPortal(
    <div
      data-dash="v2"
      className={cn(fontVars, "fixed inset-0 isolate z-[var(--d-z-modal)] grid place-items-center bg-[var(--d-jade-900)]/70 px-3 py-4 backdrop-blur-sm")}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        tabIndex={-1}
        className="flex max-h-[min(780px,92svh)] w-full max-w-[920px] flex-col overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] text-[var(--d-text)] shadow-[var(--d-sh-lg)] outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-features-title"
      >
        <div className="shrink-0 border-b border-[var(--d-line)] bg-[var(--d-surface-2)] px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="d-eyebrow text-[var(--d-jade)]">{narrative.badge}</p>
              <h3 id="plan-features-title" className="mt-1 font-[var(--d-font-display)] text-[1.5rem] font-bold">
                Toàn bộ tính năng gói {planDisplayName(plan)}
              </h3>
              <p className="mt-2 max-w-2xl text-[length:var(--d-fs-sm)] font-medium leading-[var(--d-lh-body)] text-[var(--d-text-muted)]">
                Đối chiếu trực tiếp theo quyền lợi vận hành thật: bán hàng, AI, báo cáo, quota, nhân sự và các phần cần Premium để mở khóa.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--d-r-md)] border border-[var(--d-line-strong)] bg-[var(--d-surface)] text-[var(--d-text-muted)] transition hover:border-[var(--d-jade)] hover:text-[var(--d-jade)]"
              aria-label="Đóng popup tính năng"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2">
              <p className="text-[length:var(--d-fs-2xs)] font-semibold text-[var(--d-text-muted)]">Giá</p>
              <p className="d-num mt-1 text-[1.0625rem] font-bold text-[var(--d-jade)]">{formatVnd(plan.monthly_price)}/tháng</p>
            </div>
            <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2">
              <p className="text-[length:var(--d-fs-2xs)] font-semibold text-[var(--d-text-muted)]">Dùng thử</p>
              <p className="d-num mt-1 text-[1.0625rem] font-bold text-[var(--d-text)]">{plan.trial_days} ngày</p>
            </div>
            <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-accent-soft)] px-3 py-2">
              <p className="text-[length:var(--d-fs-2xs)] font-semibold text-[var(--d-text-muted)]">Phù hợp</p>
              <p className="mt-1 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-orange-600)]">{narrative.decision}</p>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-primary-soft)] p-4">
            <p className="text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{narrative.decision}</p>
            <p className="mt-1 text-[length:var(--d-fs-sm)] font-medium leading-[var(--d-lh-body)] text-[var(--d-text-muted)]">{narrative.fit}</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {groups.map((group) => (
              <div key={group.title} className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-2 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">
                    <Sparkles className="h-4 w-4 shrink-0 text-[var(--d-jade)]" />
                    {group.title}
                  </p>
                  <span className="shrink-0 rounded-[var(--d-r-pill)] bg-[var(--d-primary-soft)] px-2 py-0.5 text-[length:var(--d-fs-2xs)] font-bold text-[var(--d-jade)]">
                    {group.includedCount}/{group.totalCount}
                  </span>
                </div>
                <ul className="mt-3 grid gap-2">
                  {group.items.map((feature) => (
                    <li key={feature.key} className="flex items-start gap-2">
                      <span className={cn("mt-0.5 shrink-0", feature.state === "locked" ? "text-[var(--d-text-faint)]" : "text-[var(--d-jade)]")}>
                        {feature.state === "included" ? <CheckCircle2 className="h-4 w-4" /> : feature.state === "trial" ? <Clock3 className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <strong className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{feature.label}</strong>
                          <em className="shrink-0 not-italic text-[length:var(--d-fs-2xs)] font-bold text-[var(--d-text-faint)]">{feature.badge}</em>
                        </span>
                        <span className="block text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-jade)]">{feature.value}</span>
                        <span className="block text-[length:var(--d-fs-xs)] leading-5 text-[var(--d-text-muted)]">{feature.description}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">So sánh nhanh các gói đang có</p>
              <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Giá, số tính năng và định hướng sử dụng</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {comparisonPlans.map((item) => {
                const active = item.code === plan.code;
                const itemNarrative = planNarrative(item);
                return (
                  <article key={item.id} className={cn("rounded-[var(--d-r-md)] border p-3", active ? "border-[var(--d-jade)] bg-[var(--d-primary-soft)]" : "border-[var(--d-line)] bg-[var(--d-surface-2)]")}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="d-eyebrow text-[var(--d-jade)]">{item.code}</p>
                        <p className="mt-1 text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{planDisplayName(item)}</p>
                      </div>
                      {active ? <BadgeCheck className="h-5 w-5 text-[var(--d-jade)]" /> : null}
                    </div>
                    <p className="d-num mt-3 text-[1.25rem] font-bold text-[var(--d-text)]">
                      {formatVnd(item.monthly_price)}
                      <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">/tháng</span>
                    </p>
                    <p className="mt-2 text-[length:var(--d-fs-xs)] font-medium leading-5 text-[var(--d-text-muted)]">{itemNarrative.promise}</p>
                    <p className="mt-2 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-jade)]">{planFeatureCount(item)} tính năng được mô tả</p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
        <div className="grid shrink-0 gap-2 border-t border-[var(--d-line)] bg-[var(--d-surface)] px-4 py-3 sm:flex sm:items-center sm:justify-end sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-[var(--d-r-md)] border border-[var(--d-line-strong)] bg-[var(--d-surface)] px-4 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)] transition hover:border-[var(--d-jade)]"
          >
            Xem lại
          </button>
          <button
            type="button"
            onClick={onSelect}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--d-r-md)] bg-[var(--d-jade)] px-5 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-on-jade)] transition hover:bg-[var(--d-jade-700)]"
          >
            Chọn {planDisplayName(plan)}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>,
    portalTarget
  );
}

function Stepper({
  step,
  furthestStep,
  onSelect
}: {
  step: number;
  furthestStep: number;
  onSelect: (next: number) => void;
}) {
  return (
    <nav
      aria-label="Các bước tạo quán"
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {steps.map((label, index) => {
        const active = step === index;
        const done = index < step;
        const disabled = index > furthestStep;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onSelect(index)}
            disabled={disabled}
            aria-current={active ? "step" : undefined}
            className={cn(
              "group inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-[var(--d-r-pill)] border px-3.5 text-[length:var(--d-fs-sm)] font-semibold transition-all duration-[var(--d-dur)]",
              active
                ? "border-transparent bg-[var(--d-jade)] text-[var(--d-on-jade)] shadow-[var(--d-sh-sm)]"
                : done
                  ? "border-[var(--d-jade)]/30 bg-[var(--d-primary-soft)] text-[var(--d-jade)] hover:bg-[var(--d-sage-100)]"
                  : disabled
                    ? "cursor-not-allowed border-[var(--d-line)] bg-[var(--d-surface-2)] text-[var(--d-text-faint)]"
                    : "border-[var(--d-line-strong)] bg-[var(--d-surface)] text-[var(--d-text-muted)] hover:border-[var(--d-jade)] hover:text-[var(--d-text)]"
            )}
          >
            <span
              className={cn(
                "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[length:var(--d-fs-2xs)] font-bold transition",
                active ? "bg-white/20 text-white" : done ? "bg-[var(--d-jade)] text-white" : "bg-[var(--d-surface-2)] text-[var(--d-text-faint)]"
              )}
            >
              {done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
            </span>
            <span className="whitespace-nowrap">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function SummaryRow({ icon: Icon, label, value, active = false }: { icon?: LucideIcon; label: string; value: string; active?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-[length:var(--d-fs-xs)] transition hover:border-[var(--d-jade)]/30">
      <span className="inline-flex items-center gap-2 font-semibold text-[var(--d-text-muted)]">
        {Icon ? <Icon className={cn("h-3.5 w-3.5", active ? "text-[var(--d-jade)]" : "text-[var(--d-text-faint)]")} /> : null}
        {label}
      </span>
      <span className={cn("min-w-0 truncate text-right font-bold", active ? "text-[var(--d-jade)]" : "text-[var(--d-text)]")}>{value}</span>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  description,
  badge,
  tone = "jade",
  children
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  badge?: ReactNode;
  tone?: "jade" | "orange";
  children: ReactNode;
}) {
  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="grid gap-4 rounded-[var(--d-r-xl)] border border-[var(--d-line)] bg-[var(--d-surface)] p-5 shadow-[var(--d-sh-sm)] transition-shadow duration-[var(--d-dur)] hover:shadow-[var(--d-sh-md)] sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {Icon ? (
            <span
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-[var(--d-r-md)]",
                tone === "orange" ? "bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]" : "bg-[var(--d-primary-soft)] text-[var(--d-jade)]"
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h3 className="text-[length:var(--d-fs-h2)] font-bold leading-[var(--d-lh-snug)] text-[var(--d-text)]">{title}</h3>
            {description ? <p className="mt-1 text-[length:var(--d-fs-sm)] leading-[var(--d-lh-body)] text-[var(--d-text-muted)]">{description}</p> : null}
          </div>
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      {children}
    </motion.section>
  );
}

export function RestaurantOnboardingFlow({
  email = "",
  initialPlanCode = "pro",
  plans
}: {
  email?: string;
  initialPlanCode?: string;
  plans: OnboardingPlan[];
}) {
  const initialAvailablePlanCode = plans.some((plan) => plan.code === initialPlanCode) ? initialPlanCode : (plans[0]?.code ?? "pro");
  const draftKey = `logivn:onboarding:${email.trim().toLowerCase() || "local"}`;
  const placeSessionTokenRef = useRef(createMapSessionToken());
  const [state, action, pending] = useActionState(onboardingAction, undefined);
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [name, setName] = useState("");
  const [slugInput, setSlugInput] = useState("quan-moi");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid" | "error">("idle");
  const [businessPresetId, setBusinessPresetId] = useState("cafe");
  const [customBusinessType, setCustomBusinessType] = useState("");
  const [provinces, setProvinces] = useState<AdminProvince[]>([]);
  const [wards, setWards] = useState<AdminWard[]>([]);
  const [provinceCode, setProvinceCode] = useState("");
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [wardCode, setWardCode] = useState("");
  const [ward, setWard] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [selectedAddress, setSelectedAddress] = useState("");
  const [addressResults, setAddressResults] = useState<AddressSuggestion[]>([]);
  const [addressSearching, setAddressSearching] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [storeLat, setStoreLat] = useState("");
  const [storeLng, setStoreLng] = useState("");
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationPending, setLocationPending] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [hotline, setHotline] = useState("");
  const [planCode, setPlanCode] = useState<PlanCode>(initialAvailablePlanCode);
  const [planDisplayMode, setPlanDisplayMode] = useState<PlanDisplayMode>("decision");
  const [tableCount, setTableCount] = useState(initialAvailablePlanCode === "premium" ? 24 : 10);
  const [itemName, setItemName] = useState("Cà phê sữa đá");
  const [itemPrice, setItemPrice] = useState("28000");
  const [itemCategory, setItemCategory] = useState("Cà phê");
  const [menuOcrText, setMenuOcrText] = useState("");
  const [menuOcrImage, setMenuOcrImage] = useState<File | null>(null);
  const [menuOcrDraft, setMenuOcrDraft] = useState<OcrDraft | null>(null);
  const [confirmedMenuItems, setConfirmedMenuItems] = useState<OcrMenuItem[]>([]);
  const [menuOcrQuota, setMenuOcrQuota] = useState<AiQuota | null>(null);
  const [menuOcrLoading, setMenuOcrLoading] = useState(false);
  const [menuOcrError, setMenuOcrError] = useState("");
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(0);
  const [draftStatusTick, setDraftStatusTick] = useState(0);
  const [featurePlan, setFeaturePlan] = useState<OnboardingPlan | null>(null);
  const [submitStarted, setSubmitStarted] = useState(false);
  const [launchMessageIndex, setLaunchMessageIndex] = useState(0);
  const selectedPreset = businessPresets.find((item) => item.id === businessPresetId) ?? businessPresets[0];
  const selectedPlan = plans.find((plan) => plan.code === planCode) ?? plans[0] ?? null;
  const selectedPlanCode = selectedPlan?.code ?? planCode;
  const selectedPlanTableLimit = getOnboardingTableLimit(selectedPlanCode);
  const tablePresetOptions = [6, 10, 16, 24].filter((count) => count <= selectedPlanTableLimit);
  const suggestedSlug = createSlug(name) || "quan-moi";
  const displayedSlugInput = slugEdited ? slugInput : suggestedSlug;
  const slug = createSlug(displayedSlugInput) || suggestedSlug;
  const slugReady = slugStatus === "available";
  const progress = [25, 55, 80, 100][step] ?? 25;
  const selectedProvince = provinces.find((item) => item.code === provinceCode) ?? null;
  const selectedWard = wards.find((item) => item.code === wardCode) ?? null;
  const provinceLabel = selectedProvince?.name || province;
  const wardLabel = selectedWard?.name || ward;
  const hasPinnedLocation = Boolean(storeLat && storeLng);
  const composedAddress = useMemo(
    () => [streetAddress, district, wardLabel, provinceLabel].map((part) => part.trim()).filter(Boolean).join(", "),
    [district, provinceLabel, streetAddress, wardLabel]
  );
  const finalAddress = selectedAddress.trim() || composedAddress;
  const hasBusinessType = selectedPreset.value !== "OTHER" || customBusinessType.trim().length >= 2;
  const hasStructuredAddress =
    selectedAddress.trim().length >= 8 ||
    Boolean(finalAddress.trim().length >= 8 && (hasPinnedLocation || provinceCode || wardCode));
  const hasValidHotline = /^[0-9+() .-]{6,24}$/.test(hotline.trim());
  const canContinueIdentity = name.trim().length >= 2 && slugReady && hasBusinessType && hasValidHotline;
  const canContinueInfo = canContinueIdentity && hasStructuredAddress;
  const dashboardPlanCode = selectedPlanCode;
  const ocrDraftItems = useMemo(() => flattenOcrDraft(menuOcrDraft), [menuOcrDraft]);
  const confirmedMenuItemsJson = useMemo(() => JSON.stringify(confirmedMenuItems), [confirmedMenuItems]);
  const setupRunway = useMemo(
    () =>
      buildOnboardingRunway({
        hasRestaurantInfo: canContinueInfo,
        hasPlan: Boolean(selectedPlan),
        tableCount,
        initialMenuItemName: itemName,
        confirmedMenuItemCount: confirmedMenuItems.length
      }),
    [canContinueInfo, confirmedMenuItems.length, itemName, selectedPlan, tableCount]
  );
  const setupTasks = setupRunway.tasks;
  const setupDoneCount = setupRunway.doneCount;
  const setupProgress = setupRunway.progress;
  const nextStepLabel = step === 3 ? "Hoàn tất" : "Tiếp tục";
  const nextStepDisabled = (step === 0 && !canContinueInfo) || (step === 1 && !selectedPlan);
  const canSubmitOnboarding = setupRunway.canLaunch;
  const launching = pending || submitStarted;
  const draftStatusLabel = formatDraftSavedLabel(draftSavedAt, draftStatusTick || draftSavedAt);
  const missingInfoLabels = [
    name.trim().length >= 2 ? "" : "tên quán",
    slugReady ? "" : "mã quán",
    hasBusinessType ? "" : "loại hình",
    hasStructuredAddress ? "" : "địa chỉ",
    hasValidHotline ? "" : "hotline"
  ].filter(Boolean);

  useEffect(() => {
    const draft = readOnboardingDraft(draftKey);

    queueMicrotask(() => {
      if (draft) {
        setName(draft.name ?? "");
        const draftSlug = typeof draft.slug === "string" ? createSlug(draft.slug) : "";
        if (draftSlug) {
          setSlugInput(draftSlug);
          setSlugEdited(true);
        }
        setBusinessPresetId(draft.businessPresetId ?? "cafe");
        setCustomBusinessType(draft.customBusinessType ?? "");
        setProvinceCode(draft.provinceCode ?? "");
        setProvince(draft.province ?? "");
        setDistrict(draft.district ?? "");
        setWardCode(draft.wardCode ?? "");
        setWard(draft.ward ?? "");
        setStreetAddress(draft.streetAddress ?? "");
        setSelectedAddress(draft.selectedAddress ?? "");
        setStoreLat(draft.storeLat ?? "");
        setStoreLng(draft.storeLng ?? "");
        setLocationAccuracy(draft.locationAccuracy ?? null);
        setHotline(draft.hotline ?? "");
        const draftPlanCode = draft.planCode && plans.some((plan) => plan.code === draft.planCode) ? draft.planCode : null;
        const nextPlanCode = initialAvailablePlanCode === "premium" ? initialAvailablePlanCode : (draftPlanCode ?? initialAvailablePlanCode);
        const nextTableLimit = getOnboardingTableLimit(nextPlanCode);
        const nextTableCount = Number.isInteger(draft.tableCount) ? Number(draft.tableCount) : (nextPlanCode === "premium" ? 24 : 10);
        setPlanCode(nextPlanCode);
        setTableCount(Math.min(nextTableLimit, Math.max(1, nextTableCount)));
        setItemName(draft.itemName ?? "Cà phê sữa đá");
        setItemPrice(draft.itemPrice ?? "28000");
        setItemCategory(draft.itemCategory ?? "Cà phê");
        setConfirmedMenuItems(draft.confirmedMenuItems ?? []);
        setDraftRestored(true);
        setDraftSavedAt(draft.updatedAt ?? 0);
      }

      setDraftHydrated(true);
    });
  }, [draftKey, initialAvailablePlanCode, initialPlanCode, plans]);

  useEffect(() => {
    let disposed = false;

    async function loadProvinces() {
      setAdminLoading(true);
      try {
        const response = await fetch("/api/location/vietnam-admin", { cache: "force-cache" });
        const payload = (await response.json()) as { ok?: boolean; data?: { provinces?: AdminProvince[] }; error?: string };
        if (!payload.ok) throw new Error(payload.error || "Không tải được danh mục hành chính.");
        if (!disposed) setProvinces(payload.data?.provinces ?? []);
      } catch (error) {
        if (!disposed) setAddressError(error instanceof Error ? error.message : "Không tải được danh mục hành chính.");
      } finally {
        if (!disposed) setAdminLoading(false);
      }
    }

    void loadProvinces();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!draftHydrated) return;
    if (!/^[a-z0-9-]{2,80}$/.test(slug)) {
      queueMicrotask(() => setSlugStatus("invalid"));
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSlugStatus("checking");
      try {
        const response = await fetch(`/api/restaurants/slug?slug=${encodeURIComponent(slug)}`, {
          cache: "no-store",
          signal: controller.signal
        });
        const payload = (await response.json()) as { ok?: boolean; available?: boolean; slug?: string };
        if (!payload.ok || payload.slug !== slug) {
          setSlugStatus("error");
          return;
        }
        setSlugStatus(payload.available ? "available" : "taken");
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("[onboarding] slug availability check failed", error);
          setSlugStatus("error");
        }
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [draftHydrated, slug]);

  useEffect(() => {
    if (!provinceCode) {
      queueMicrotask(() => setWards([]));
      return;
    }

    let disposed = false;

    async function loadWards() {
      setAdminLoading(true);
      try {
        const response = await fetch(`/api/location/vietnam-admin?provinceCode=${encodeURIComponent(provinceCode)}&limit=500`, {
          cache: "force-cache"
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          data?: { selectedProvince?: AdminProvince; wards?: AdminWard[] };
          error?: string;
        };

        if (!payload.ok) throw new Error(payload.error || "Không tải được danh mục xã/phường.");
        if (disposed) return;

        setProvince(payload.data?.selectedProvince?.name ?? "");
        setWards(payload.data?.wards ?? []);
        setWardCode((current) => ((payload.data?.wards ?? []).some((item) => item.code === current) ? current : ""));
        setWard((current) => ((payload.data?.wards ?? []).some((item) => item.name === current) ? current : ""));
      } catch (error) {
        if (!disposed) setAddressError(error instanceof Error ? error.message : "Không tải được danh mục xã/phường.");
      } finally {
        if (!disposed) setAdminLoading(false);
      }
    }

    void loadWards();
    return () => {
      disposed = true;
    };
  }, [provinceCode]);

  useEffect(() => {
    if (!draftHydrated) return;
    const updatedAt = Date.now();
    const draft: OnboardingDraft = {
      version: 2,
      updatedAt,
      name,
      slug,
      businessPresetId,
      customBusinessType,
      provinceCode,
      province,
      district,
      wardCode,
      ward,
      streetAddress,
      selectedAddress,
      storeLat,
      storeLng,
      locationAccuracy,
      hotline,
      planCode,
      tableCount,
      itemName,
      itemPrice,
      itemCategory,
      confirmedMenuItems
    };

    try {
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
      const timeout = window.setTimeout(() => {
        setDraftSavedAt(updatedAt);
      }, 0);
      return () => window.clearTimeout(timeout);
    } catch {
      // Ignore storage quota/private mode issues; the server flow remains authoritative.
    }
  }, [
    businessPresetId,
    customBusinessType,
    district,
    draftHydrated,
    draftKey,
    hotline,
    itemCategory,
    itemName,
    itemPrice,
    confirmedMenuItems,
    locationAccuracy,
    name,
    slug,
    planCode,
    province,
    provinceCode,
    selectedAddress,
    storeLat,
    storeLng,
    streetAddress,
    tableCount,
    ward,
    wardCode
  ]);

  useEffect(() => {
    if (!draftHydrated) return;
    const interval = window.setInterval(() => {
      setDraftStatusTick(Date.now());
    }, 15_000);

    return () => window.clearInterval(interval);
  }, [draftHydrated]);

  useEffect(() => {
    if (!state?.error) return;
    queueMicrotask(() => {
      setSubmitStarted(false);
      setLaunchMessageIndex(0);
    });
  }, [state?.error]);

  useEffect(() => {
    if (!launching) return;
    const interval = window.setInterval(() => {
      setLaunchMessageIndex((current) => (current + 1) % launchMessages.length);
    }, 1400);

    return () => window.clearInterval(interval);
  }, [launching]);

  function advanceTo(nextStep: number) {
    setFurthestStep((current) => Math.max(current, nextStep));
    setStep(nextStep);
  }

  function openStep(nextStep: number) {
    if (nextStep <= furthestStep) {
      setStep(nextStep);
    }
  }

  function clearDraft() {
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // Best effort only.
    }
    setDraftRestored(false);
    setDraftSavedAt(0);
  }

  function selectPlan(plan: OnboardingPlan) {
    const nextTableLimit = getOnboardingTableLimit(plan.code);
    setPlanCode(plan.code);
    setTableCount((value) => Math.min(nextTableLimit, Math.max(1, plan.code === "premium" ? Math.max(value, 24) : value)));
  }

  function handleMenuOcrImage(file: File | null) {
    if (file && file.size > 5 * 1024 * 1024) {
      setMenuOcrError("Ảnh menu tối đa 5MB. Vui lòng chụp/nén lại ảnh rõ hơn.");
      setMenuOcrImage(null);
      return;
    }

    setMenuOcrError("");
    setMenuOcrImage(file);
  }

  function clearSelectedAddress() {
    if (selectedAddress) setSelectedAddress("");
    if (addressError) setAddressError("");
  }

  function chooseProvince(nextProvinceCode: string) {
    const nextProvince = provinces.find((item) => item.code === nextProvinceCode);
    setProvinceCode(nextProvinceCode);
    setProvince(nextProvince?.name ?? "");
    setWardCode("");
    setWard("");
    setSelectedAddress("");
    setAddressResults([]);
  }

  function chooseWard(nextWardCode: string) {
    const nextWard = wards.find((item) => item.code === nextWardCode);
    setWardCode(nextWardCode);
    setWard(nextWard?.name ?? "");
    clearSelectedAddress();
  }

  async function searchAddressSuggestions() {
    const query = finalAddress.trim();
    if (query.length < 6) {
      setAddressError("Nhập tối thiểu số nhà, tên đường hoặc mốc gần quán để LogiVN tìm gợi ý chính xác hơn.");
      setAddressResults([]);
      return;
    }

    setAddressSearching(true);
    setAddressError("");

    try {
      const results = await fetchAddressPredictions({
        query,
        limit: 5,
        sessionToken: placeSessionTokenRef.current
      });
      setAddressResults(results);
      if (results.length === 0) setAddressError("Chưa có gợi ý phù hợp. Hãy thêm tên đường hoặc số nhà rõ hơn.");
    } catch (error) {
      setAddressResults([]);
      setAddressError(error instanceof Error ? error.message : "Không tìm được địa chỉ lúc này.");
    } finally {
      setAddressSearching(false);
    }
  }

  async function chooseAddressSuggestion(result: AddressSuggestion) {
    setSelectedAddress(result.address);
    setStreetAddress(result.shortLabel || result.address);
    setAddressResults([]);
    setAddressError("");

    try {
      setAddressSearching(true);
      const detail = await resolveAddressPrediction(result, {
        sessionToken: placeSessionTokenRef.current
      });
      placeSessionTokenRef.current = createMapSessionToken();
      setSelectedAddress(detail.address);
      setStreetAddress(detail.shortLabel || detail.address);
      setStoreLat(formatCoordinate(detail.lat));
      setStoreLng(formatCoordinate(detail.lng));
      setLocationAccuracy(null);
    } catch (error) {
      setAddressError(error instanceof Error ? error.message : "Đã chọn địa chỉ, nhưng chưa lấy được tọa độ. Hãy ghim pin trên bản đồ.");
    } finally {
      setAddressSearching(false);
    }
  }

  async function handleUseCurrentPosition() {
    if (!navigator.geolocation) {
      setLocationError("Trình duyệt không hỗ trợ định vị. Có thể nhập số nhà hoặc chọn gợi ý Mapbox thay thế.");
      return;
    }

    setLocationPending(true);
    setLocationError("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = formatCoordinate(position.coords.latitude);
        const lng = formatCoordinate(position.coords.longitude);
        setStoreLat(lat);
        setStoreLng(lng);
        setLocationAccuracy(position.coords.accuracy || null);
        setLocationPending(false);

        try {
          const response = await fetch(`/api/maps/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`, {
            cache: "no-store"
          });
          const payload = (await response.json()) as { ok?: boolean; data?: { address?: string; shortLabel?: string } };
          if (payload.ok && payload.data?.address && !streetAddress.trim()) {
            setStreetAddress(payload.data.shortLabel || payload.data.address);
          }
        } catch {
          // Coordinates are the authoritative value here; reverse geocoding is only a convenience label.
        }
      },
      () => {
        setLocationPending(false);
        setLocationError("Không lấy được vị trí. Hãy cho phép trình duyệt truy cập vị trí hoặc dùng điện thoại tại quán để ghim chính xác hơn.");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 }
    );
  }

  async function runMenuOcr() {
    if (menuOcrLoading || (!menuOcrText.trim() && !menuOcrImage)) return;
    setMenuOcrLoading(true);
    setMenuOcrError("");
    setConfirmedMenuItems([]);

    try {
      const imageBase64 = menuOcrImage ? await fileToBase64(menuOcrImage) : undefined;
      const response = await fetch("/api/onboarding/ai/menu-ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planCode: dashboardPlanCode,
          rawText: menuOcrText.trim() || undefined,
          imageBase64
        })
      });
      const result = (await response.json().catch(() => null)) as
        | ApiResponse<{
            data: OcrDraft;
            quota: AiQuota;
          }>
        | null;

      if (!result || !result.ok) throw new Error(result?.error || "Chưa đọc được menu.");
      setMenuOcrDraft(result.data.data);
      setMenuOcrQuota(result.data.quota);
    } catch (error) {
      setMenuOcrDraft(null);
      setMenuOcrError(error instanceof Error ? error.message : "Không nhập được menu từ ảnh.");
    } finally {
      setMenuOcrLoading(false);
    }
  }

  const currentStepMeta = stepDetails[step] ?? stepDetails[0];
  const selectedPlanNarrative = selectedPlan ? planNarrative(selectedPlan) : null;
  const actionHint = launching
    ? launchMessages[launchMessageIndex]
    : step === 0 && missingInfoLabels.length > 0
      ? `Cần thêm ${missingInfoLabels.slice(0, 3).join(", ")}`
      : step === 1 && !selectedPlan
        ? "Chọn một gói để tiếp tục"
        : step === 3 && !canSubmitOnboarding
          ? "Cần ít nhất một món hoặc menu đã xác nhận"
          : step === 3
            ? "Sẵn sàng tạo dashboard thật cho quán"
            : "Có thể tiếp tục bước tiếp theo";
  const slugStatusCopy =
    slugStatus === "checking"
      ? "Đang kiểm tra mã quán..."
      : slugStatus === "available"
        ? "Mã quán khả dụng."
        : slugStatus === "taken"
          ? "Mã quán đã có người dùng."
          : slugStatus === "invalid"
            ? "Mã quán cần 2-80 ký tự a-z, 0-9 hoặc dấu gạch nối."
            : slugStatus === "error"
              ? "Chưa kiểm tra được mã quán."
              : "";
  const storePreview = (
    <InteractiveStorePreview
      name={name}
      presetId={businessPresetId}
      customBusinessType={customBusinessType}
      streetAddress={streetAddress}
      district={district}
      ward={wardLabel}
      province={provinceLabel}
      selectedAddress={selectedAddress}
      planCode={planCode}
      tableCount={tableCount}
      itemName={itemName}
      itemPrice={itemPrice}
      itemCategory={itemCategory}
      confirmedMenuItems={confirmedMenuItems}
      slug={slug}
      hotline={hotline}
    />
  );

  return (
    <main data-dash="v2" className={cn(fontVars, "relative min-h-svh w-full overflow-x-hidden bg-[var(--d-bg)] text-[var(--d-text)]")}>
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-32 -top-40 h-[28rem] w-[28rem] rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(15,77,58,0.18) 0%, transparent 70%)" }}
        />
        <div
          className="absolute -right-32 top-24 h-[26rem] w-[26rem] rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(242,140,40,0.16) 0%, transparent 70%)" }}
        />
      </div>

      <form
        action={action}
        onSubmit={(event) => {
          if (!canSubmitOnboarding || launching) {
            event.preventDefault();
            return;
          }
          setSubmitStarted(true);
          setLaunchMessageIndex(0);
        }}
        className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-6 pt-5 sm:px-6"
      >
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="businessType" value={selectedPreset.value} />
        <input type="hidden" name="customBusinessType" value={customBusinessType} />
        <input type="hidden" name="tableCount" value={tableCount} />
        <input type="hidden" name="address" value={finalAddress} />
        <input type="hidden" name="storeLat" value={storeLat} />
        <input type="hidden" name="storeLng" value={storeLng} />
        <input type="hidden" name="hotline" value={hotline} />
        <input type="hidden" name="planCode" value={dashboardPlanCode} />
        <input type="hidden" name="bankCode" value="" />
        <input type="hidden" name="bankAccount" value="" />
        <input type="hidden" name="bankAccountName" value="" />
        <input type="hidden" name="initialItemName" value={confirmedMenuItems.length > 0 ? "" : itemName} />
        <input type="hidden" name="initialItemPrice" value={confirmedMenuItems.length > 0 ? "" : itemPrice} />
        <input type="hidden" name="initialItemCategory" value={confirmedMenuItems.length > 0 ? "" : itemCategory} />
        <input type="hidden" name="initialMenuItems" value={confirmedMenuItemsJson} />
        <input type="hidden" name="brandSlogan" value="" />
        <input type="hidden" name="brandDescription" value="" />
        <input type="hidden" name="generatedLogoUrl" value="" />

        {/* Header — gradient hero gọn */}
        <header
          className="relative overflow-hidden rounded-[var(--d-r-xl)] p-4 shadow-[var(--d-sh-md)] sm:p-5"
          style={{ background: "linear-gradient(135deg, var(--d-jade-900) 0%, var(--d-jade) 65%, var(--d-jade-700) 100%)" }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ backgroundImage: "radial-gradient(120% 90% at 100% 0%, rgba(242,140,40,0.26) 0%, transparent 55%)" }}
          />
          <div className="relative z-10 flex flex-col gap-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-white/65">Bước {step + 1}/{steps.length}</p>
                <h1 className="mt-1 truncate font-[var(--d-font-display)] text-[1.375rem] font-bold leading-tight tracking-[var(--d-track-tight)] text-white sm:text-[1.625rem]">
                  {launching ? "Đang khởi tạo quán..." : currentStepMeta.title}
                </h1>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-[var(--d-r-pill)] bg-white/10 px-3 py-1.5 text-[length:var(--d-fs-2xs)] font-semibold text-white/85">
                  <Clock3 className="h-3.5 w-3.5 text-[var(--d-orange-300)]" />
                  <span className="hidden sm:inline">{draftStatusLabel}</span>
                </span>
                {draftSavedAt > 0 ? (
                  <button
                    type="button"
                    onClick={clearDraft}
                    aria-label="Xoá bản nháp"
                    className="grid h-8 w-8 place-items-center rounded-[var(--d-r-md)] text-white/70 transition hover:bg-white/10 hover:text-white"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-[var(--d-r-pill)] bg-white/15">
                <motion.div
                  className="h-full rounded-[var(--d-r-pill)]"
                  style={{ background: "linear-gradient(90deg, var(--d-orange-300), var(--d-orange))" }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <span className="d-num w-9 shrink-0 text-right text-[length:var(--d-fs-xs)] font-bold text-white/90">{progress}%</span>
            </div>
          </div>
        </header>


        <Stepper step={step} furthestStep={furthestStep} onSelect={openStep} />

        {draftRestored ? (
          <p className="inline-flex w-fit items-center gap-1.5 rounded-[var(--d-r-pill)] border border-[var(--d-jade)]/20 bg-[var(--d-primary-soft)] px-3 py-1 text-[length:var(--d-fs-2xs)] font-bold text-[var(--d-jade)]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Đã khôi phục bản nháp đã lưu
          </p>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          {/* Step content */}
          <div className="min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={`step-${step}`}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={stepTransition}
                className="grid gap-4"
              >
                {step === 0 ? (
                  <>
                    <SectionCard icon={Store} title="Thông tin quán">
                      <label className={fieldLabel}>
                        Tên quán
                        <input value={name} onChange={(event) => setName(event.target.value)} className={field} placeholder="Nhập tên quán" />
                      </label>
                      <label className={fieldLabel}>
                        Mã quán & đường dẫn riêng
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                          <span className="relative min-w-0">
                            <input
                              value={displayedSlugInput}
                              onChange={(event) => {
                                setSlugEdited(true);
                                setSlugInput(createSlug(event.target.value));
                              }}
                              className={cn(field, "pr-10 font-[var(--d-font-mono)] uppercase tracking-[0.04em]")}
                              placeholder="quan-cua-ban"
                            />
                            {slugStatus === "checking" ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--d-text-faint)]" /> : null}
                            {slugStatus === "available" ? <CheckCircle2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--d-jade)]" /> : null}
                          </span>
                          <span className="flex min-h-11 items-center rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 font-[var(--d-font-mono)] text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">
                            {slug}.logivn.com
                          </span>
                        </div>
                        {slugStatusCopy ? (
                          <span className={cn("text-[length:var(--d-fs-xs)] font-semibold", slugReady ? "text-[var(--d-jade)]" : "text-[var(--d-warn-fg)]")}>{slugStatusCopy}</span>
                        ) : null}
                      </label>
                      <div className="grid gap-2">
                        <p className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">Loại hình</p>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                          {businessPresets.map((preset) => {
                            const Icon = preset.icon;
                            const active = businessPresetId === preset.id;
                            return (
                              <motion.button
                                key={preset.id}
                                type="button"
                                onClick={() => setBusinessPresetId(preset.id)}
                                aria-pressed={active}
                                whileTap={{ scale: 0.95 }}
                                className={cn(
                                  "flex h-[88px] flex-col items-center justify-center gap-2 rounded-[var(--d-r-lg)] border text-[length:var(--d-fs-xs)] font-semibold transition-all duration-[var(--d-dur)]",
                                  active
                                    ? "border-[var(--d-jade)] bg-[var(--d-primary-soft)] text-[var(--d-jade)] shadow-[0_8px_22px_rgba(15,77,58,0.16)]"
                                    : "border-[var(--d-line-strong)] bg-[var(--d-surface)] text-[var(--d-text-muted)] hover:-translate-y-0.5 hover:border-[var(--d-jade)] hover:text-[var(--d-text)]"
                                )}
                              >
                                <span
                                  className={cn(
                                    "grid h-10 w-10 place-items-center rounded-full transition",
                                    active ? "text-white" : "bg-[var(--d-surface-2)] text-[var(--d-text-faint)]"
                                  )}
                                  style={active ? { background: "linear-gradient(135deg, var(--d-jade), var(--d-jade-700))" } : undefined}
                                >
                                  <Icon className="h-[18px] w-[18px]" />
                                </span>
                                {preset.label}
                              </motion.button>
                            );
                          })}
                        </div>
                        {selectedPreset.value === "OTHER" ? (
                          <label className={fieldLabel}>
                            Danh mục riêng
                            <input value={customBusinessType} onChange={(event) => setCustomBusinessType(event.target.value)} className={field} placeholder="Ví dụ: bakery, pub, homestay cafe..." />
                          </label>
                        ) : null}
                      </div>
                      <label className={fieldLabel}>
                        Hotline
                        <input value={hotline} onChange={(event) => setHotline(event.target.value)} className={field} placeholder="0901234567" inputMode="tel" />
                      </label>
                    </SectionCard>

                    <SectionCard icon={MapPin} title="Địa điểm" description="Nhập nhanh địa chỉ hoặc mốc gần quán. Tỉnh/xã là tuỳ chọn.">
                      <label className={microLabel}>
                        Địa chỉ hoặc mốc gần quán
                        <span className="relative">
                          <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--d-text-faint)]" />
                          <input
                            value={streetAddress}
                            onChange={(event) => {
                              setStreetAddress(event.target.value);
                              clearSelectedAddress();
                            }}
                            className={iconField}
                            placeholder="12 Nguyễn Huệ, Quận 1 hoặc tên tòa nhà"
                          />
                        </span>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleUseCurrentPosition()}
                          disabled={locationPending}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line-strong)] bg-[var(--d-surface)] px-4 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-jade)] transition hover:border-[var(--d-jade)] disabled:opacity-60"
                        >
                          {locationPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                          Dùng GPS
                        </button>
                        <button
                          type="button"
                          onClick={() => void searchAddressSuggestions()}
                          disabled={addressSearching || finalAddress.trim().length < 6}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line-strong)] bg-[var(--d-surface)] px-4 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-jade)] transition hover:border-[var(--d-jade)] disabled:opacity-60"
                        >
                          {addressSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                          Tìm địa chỉ
                        </button>
                      </div>
                      {addressResults.length > 0 ? (
                        <div className="grid gap-1.5">
                          {addressResults.map((result, index) => (
                            <button
                              key={result.id}
                              type="button"
                              onClick={() => void chooseAddressSuggestion(result)}
                              className="flex items-center gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-left transition hover:border-[var(--d-jade)] hover:bg-[var(--d-surface-2)]"
                            >
                              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[var(--d-r-sm)] bg-[var(--d-primary-soft)] text-[length:var(--d-fs-2xs)] font-bold text-[var(--d-jade)]">{index + 1}</span>
                              <span className="min-w-0 truncate text-[length:var(--d-fs-sm)] font-medium text-[var(--d-text)]">{result.shortLabel || result.address}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <details className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
                        <summary className="cursor-pointer text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-jade)]">
                          Chọn tỉnh/xã thủ công nếu cần
                        </summary>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <label className={microLabel}>
                            Tỉnh/TP
                            <select value={provinceCode} onChange={(event) => chooseProvince(event.target.value)} className={field}>
                              <option value="">{adminLoading ? "Đang tải..." : "Chọn tỉnh/thành"}</option>
                              {provinces.map((item) => (
                                <option key={item.code} value={item.code}>{item.name}</option>
                              ))}
                            </select>
                          </label>
                          <label className={microLabel}>
                            Xã/Phường
                            <select value={wardCode} onChange={(event) => chooseWard(event.target.value)} className={field} disabled={!provinceCode || adminLoading}>
                              <option value="">{provinceCode ? "Chọn xã/phường" : "Chọn tỉnh trước"}</option>
                              {wards.map((item) => (
                                <option key={item.code} value={item.code}>{item.name}</option>
                              ))}
                            </select>
                          </label>
                          <label className={microLabel}>
                            Huyện cũ / thôn ấp
                            <input
                              value={district}
                              onChange={(event) => {
                                setDistrict(event.target.value);
                                clearSelectedAddress();
                              }}
                              className={field}
                              placeholder="Tuỳ chọn để dễ tìm"
                            />
                          </label>
                        </div>
                      </details>
                      <p className="truncate text-[length:var(--d-fs-xs)] font-medium text-[var(--d-text-muted)]">{finalAddress || "Chưa đủ thông tin địa chỉ"}</p>
                      {locationError || addressError ? (
                        <p className="rounded-[var(--d-r-md)] border border-[var(--d-warn-fg)]/30 bg-[var(--d-warn-bg)] px-3 py-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-warn-fg)]">{locationError || addressError}</p>
                      ) : null}
                      {hasPinnedLocation ? (
                        <p className="inline-flex w-fit items-center gap-1.5 rounded-[var(--d-r-pill)] bg-[var(--d-ok-bg)] px-3 py-1 text-[length:var(--d-fs-2xs)] font-bold text-[var(--d-ok-fg)]">
                          <LocateFixed className="h-3.5 w-3.5" />
                          {locationQualityLabel(locationAccuracy)}
                        </p>
                      ) : null}
                    </SectionCard>
                  </>
                ) : null}

                {step === 1 ? (
                  <SectionCard
                    icon={CreditCard}
                    title="Chọn gói vận hành"
                    description="Chọn theo cách quán vận hành, không chỉ theo giá. Có thể đổi gói sau."
                    badge={<PlanDisplayModeToggle mode={planDisplayMode} onChange={setPlanDisplayMode} />}
                  >
                    <p className="text-[length:var(--d-fs-sm)] font-medium text-[var(--d-text-muted)]">{selectedPlanNarrative?.fit ?? "Mở popup tính năng để xem toàn bộ quyền lợi."}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {plans.map((plan) => {
                        const active = planCode === plan.code;
                        const isPremium = plan.code.toLowerCase() === "premium";
                        const narrative = planNarrative(plan);
                        const planTableLimit = getOnboardingTableLimit(plan.code);
                        return (
                          <motion.article
                            key={plan.code}
                            aria-current={active ? "true" : undefined}
                            whileHover={{ y: -4 }}
                            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            className={cn(
                              "relative flex flex-col overflow-hidden rounded-[var(--d-r-xl)] border bg-[var(--d-surface)] p-5 text-left transition-shadow",
                              active
                                ? "border-[var(--d-jade)] shadow-[0_18px_44px_rgba(15,77,58,0.18)] ring-2 ring-[var(--d-jade)]/30"
                                : "border-[var(--d-line)] shadow-[var(--d-sh-sm)] hover:shadow-[var(--d-sh-md)]"
                            )}
                          >
                            <div
                              className="absolute inset-x-0 top-0 h-1"
                              style={{ background: isPremium ? "linear-gradient(90deg, var(--d-orange), var(--d-orange-600))" : "linear-gradient(90deg, var(--d-jade), var(--d-jade-300))" }}
                            />
                            {isPremium ? (
                              <span
                                className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-[var(--d-r-pill)] px-2.5 py-1 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-white shadow-[var(--d-sh-sm)]"
                                style={{ background: "linear-gradient(135deg, var(--d-orange), var(--d-orange-600))" }}
                              >
                                <Sparkles className="h-3 w-3" /> Khuyên dùng
                              </span>
                            ) : null}
                            <span className={cn("mt-1.5 inline-flex w-fit items-center rounded-[var(--d-r-pill)] px-2.5 py-1 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)]", isPremium ? "bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]" : "bg-[var(--d-primary-soft)] text-[var(--d-jade)]")}>
                              {isPremium ? "Scale plan" : "Starter plan"}
                            </span>
                            <h4 className="mt-3 text-[1.375rem] font-bold text-[var(--d-text)]">{planDisplayName(plan)}</h4>
                            <p className="d-num mt-1 text-[2rem] font-bold leading-none text-[var(--d-text)]">
                              {formatVnd(plan.monthly_price)}
                              <span className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)]"> /tháng</span>
                            </p>
                            <p className="mt-1.5 inline-flex items-center gap-1.5 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-jade)]">
                              <Sparkles className="h-3.5 w-3.5" />
                              Dùng thử {plan.trial_days} ngày · {planFeatureCount(plan)} tính năng
                            </p>
                            <div className="mt-4 grid grid-cols-2 gap-2 text-[length:var(--d-fs-2xs)] font-bold text-[var(--d-text)]">
                              <span className="flex min-h-9 items-center justify-center gap-1.5 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-2 text-center"><Table2 className="h-3.5 w-3.5 text-[var(--d-jade)]" />{planTableLimit} bàn</span>
                              <span className="flex min-h-9 items-center justify-center rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-2 text-center">{isPremium ? "50 nhân viên" : "10 nhân viên"}</span>
                              <span className="flex min-h-9 items-center justify-center rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-2 text-center">{isPremium ? "2.000 món" : "500 món"}</span>
                              <span className="flex min-h-9 items-center justify-center gap-1.5 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-2 text-center"><Sparkles className="h-3.5 w-3.5 text-[var(--d-orange-600)]" />{isPremium ? "AI nâng cao" : "AI cơ bản"}</span>
                            </div>
                            <PlanModeContent plan={plan} mode={planDisplayMode} />
                            <div className="mt-auto grid gap-2 pt-4">
                              <button
                                type="button"
                                onClick={() => setFeaturePlan(plan)}
                                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line-strong)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-jade)] transition hover:border-[var(--d-jade)] hover:bg-[var(--d-surface-2)]"
                              >
                                <Info className="h-4 w-4" />
                                Xem chi tiết gói
                              </button>
                              <motion.button
                                type="button"
                                onClick={() => selectPlan(plan)}
                                aria-pressed={active}
                                whileTap={{ scale: 0.98 }}
                                className={cn(
                                  "flex h-11 w-full items-center justify-center gap-2 rounded-[var(--d-r-md)] text-[length:var(--d-fs-sm)] font-bold transition",
                                  active ? "text-white shadow-[0_8px_22px_rgba(15,77,58,0.25)]" : "border border-[var(--d-jade)]/30 bg-[var(--d-surface)] text-[var(--d-jade)] hover:bg-[var(--d-primary-soft)]"
                                )}
                                style={active ? { background: "linear-gradient(135deg, var(--d-jade), var(--d-jade-700))" } : undefined}
                              >
                                {active ? "Đang chọn" : `Chọn ${planDisplayName(plan)}`}
                                {active ? <CheckCircle2 className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                              </motion.button>
                            </div>
                          </motion.article>

                        );
                      })}
                    </div>
                    {plans.length === 0 ? (
                      <p className="rounded-[var(--d-r-md)] border border-[var(--d-warn-fg)]/30 bg-[var(--d-warn-bg)] p-4 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-warn-fg)]">
                        Chưa đọc được cấu hình gói dịch vụ. Vui lòng tải lại trang trước khi tiếp tục.
                      </p>
                    ) : null}
                  </SectionCard>
                ) : null}

                {step === 2 ? (
                  <SectionCard icon={QrCode} title="Bàn & QR" description={`Giới hạn gói: tối đa ${selectedPlanTableLimit} bàn. QR mỗi bàn sẵn sàng sau khi tạo quán.`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => setTableCount((value) => Math.max(1, value - 1))} className="grid h-11 w-11 place-items-center rounded-[var(--d-r-md)] border border-[var(--d-line-strong)] bg-[var(--d-surface)] text-[length:var(--d-fs-h2)] font-bold text-[var(--d-text)] transition hover:border-[var(--d-jade)]">−</button>
                      <span className="d-num rounded-[var(--d-r-md)] bg-[var(--d-jade)] px-5 py-2.5 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-on-jade)]">{tableCount} bàn</span>
                      <button type="button" onClick={() => setTableCount((value) => Math.min(selectedPlanTableLimit, value + 1))} className="grid h-11 w-11 place-items-center rounded-[var(--d-r-md)] border border-[var(--d-line-strong)] bg-[var(--d-surface)] text-[length:var(--d-fs-h2)] font-bold text-[var(--d-text)] transition hover:border-[var(--d-jade)]">+</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tablePresetOptions.map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => setTableCount(count)}
                          className={cn(
                            "min-h-9 rounded-[var(--d-r-md)] border px-4 text-[length:var(--d-fs-sm)] font-bold transition",
                            tableCount === count ? "border-[var(--d-jade)] bg-[var(--d-primary-soft)] text-[var(--d-jade)]" : "border-[var(--d-line-strong)] bg-[var(--d-surface)] text-[var(--d-text-muted)] hover:border-[var(--d-jade)]"
                          )}
                        >
                          {count} bàn
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                      {Array.from({ length: Math.min(tableCount, 12) }).map((_, index) => (
                        <div key={index} className={cn("rounded-[var(--d-r-md)] border p-3", index === 2 ? "border-[var(--d-orange)]/40 bg-[var(--d-accent-soft)]" : "border-[var(--d-line)] bg-[var(--d-surface)]")}>
                          <Table2 className={cn("h-4 w-4", index === 2 ? "text-[var(--d-orange-600)]" : "text-[var(--d-jade)]")} />
                          <p className="mt-3 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{formatTableName(index)}</p>
                          <p className="mt-1 text-[length:var(--d-fs-xs)] font-medium text-[var(--d-text-muted)]">{index === 2 ? "Đang phục vụ" : "Trống"}</p>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                ) : null}

                {step === 3 ? (
                  <SectionCard icon={Wand2} tone="orange" title="Menu đầu tiên" description="Thêm một món nhanh hoặc dùng AI đọc ảnh menu để tạo danh mục bán hàng đầu tiên.">
                    <label className={fieldLabel}>
                      Tên món
                      <input value={itemName} onChange={(event) => setItemName(event.target.value)} className={field} placeholder="Cà phê sữa đá" />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={fieldLabel}>
                        Giá
                        <input value={itemPrice} onChange={(event) => setItemPrice(event.target.value.replace(/\D/g, ""))} className={field} placeholder="28000" inputMode="numeric" />
                      </label>
                      <label className={fieldLabel}>
                        Danh mục
                        <input value={itemCategory} onChange={(event) => setItemCategory(event.target.value)} className={field} placeholder="Cà phê, món chính, đặc sản..." />
                      </label>
                    </div>
                    <details className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-4">
                      <summary className="flex cursor-pointer items-center justify-between gap-3 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-jade)]">
                        <span className="inline-flex items-center gap-2">
                          <Wand2 className="h-4 w-4" />
                          Nhập menu từ ảnh hoặc dán menu (AI)
                        </span>
                        {menuOcrQuota ? (
                          <span className="rounded-[var(--d-r-pill)] bg-[var(--d-primary-soft)] px-2.5 py-0.5 text-[length:var(--d-fs-2xs)] font-bold text-[var(--d-jade)]">{menuOcrQuota.remaining}/{menuOcrQuota.limit}</span>
                        ) : null}
                      </summary>
                      <div className="mt-3 grid gap-3">
                        <label className={microLabel}>
                          Ảnh menu giấy
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className={cn(field, "py-2.5")}
                            onChange={(event) => handleMenuOcrImage(event.target.files?.[0] ?? null)}
                          />
                        </label>
                        <label className={microLabel}>
                          Hoặc dán menu thô
                          <textarea
                            value={menuOcrText}
                            onChange={(event) => setMenuOcrText(event.target.value)}
                            className="min-h-24 w-full rounded-[var(--d-r-md)] border border-[var(--d-line-strong)] bg-[var(--d-surface)] px-3 py-3 text-[length:var(--d-fs-sm)] font-medium normal-case tracking-normal text-[var(--d-text)] outline-none transition focus:border-[var(--d-jade)] focus:ring-2 focus:ring-[var(--d-jade)]/15"
                            placeholder={"CÀ PHÊ\nCà phê sữa đá 28000\nBạc xỉu 35000"}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => void runMenuOcr()}
                          disabled={menuOcrLoading || (!menuOcrText.trim() && !menuOcrImage)}
                          className="flex h-11 items-center justify-center gap-2 rounded-[var(--d-r-md)] border border-[var(--d-jade)]/30 bg-[var(--d-primary-soft)] text-[length:var(--d-fs-sm)] font-bold text-[var(--d-jade)] transition hover:bg-[var(--d-sage-100)] disabled:opacity-50"
                        >
                          {menuOcrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                          {menuOcrLoading ? "Đang đọc menu..." : "Quét menu"}
                        </button>
                        {menuOcrError ? <p className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-warn-fg)]">{menuOcrError}</p> : null}
                      </div>

                      {ocrDraftItems.length > 0 ? (
                        <div className="mt-4 grid gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="d-eyebrow text-[var(--d-jade)]">Đã đọc được {ocrDraftItems.length} món</p>
                            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">{Math.round((menuOcrDraft?.confidence ?? 0) * 100)}% tin cậy</span>
                          </div>
                          <div className="grid gap-1.5">
                            {ocrDraftItems.slice(0, 8).map((item) => (
                              <div key={`${item.categoryName}-${item.name}`} className="grid grid-cols-[minmax(0,1fr)_90px] gap-3 border-t border-[var(--d-line)] pt-1.5 text-[length:var(--d-fs-sm)] first:border-t-0 first:pt-0">
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-[var(--d-text)]">{item.name}</p>
                                  <p className="text-[length:var(--d-fs-xs)] font-medium text-[var(--d-text-muted)]">{item.categoryName}</p>
                                </div>
                                <p className="d-num text-right font-bold text-[var(--d-jade)]">{formatVnd(item.price)}</p>
                              </div>
                            ))}
                          </div>
                          {ocrDraftItems.length > 8 ? <p className="text-[length:var(--d-fs-xs)] font-medium text-[var(--d-text-muted)]">Còn {ocrDraftItems.length - 8} món khác sẽ được lưu cùng.</p> : null}
                          <button
                            type="button"
                            onClick={() => setConfirmedMenuItems(ocrDraftItems)}
                            className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-[var(--d-r-md)] bg-[var(--d-jade)] text-[length:var(--d-fs-sm)] font-bold text-[var(--d-on-jade)] transition hover:bg-[var(--d-jade-700)]"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Xác nhận thêm {ocrDraftItems.length} món
                          </button>
                        </div>
                      ) : null}
                      {confirmedMenuItems.length > 0 ? (
                        <p className="mt-3 rounded-[var(--d-r-md)] border border-[var(--d-jade)]/20 bg-[var(--d-primary-soft)] px-3 py-2 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-jade)]">
                          Đã xác nhận {confirmedMenuItems.length} món. Khi hoàn tất, LogiVN sẽ tạo danh mục và món thật trong menu quán.
                        </p>
                      ) : null}
                    </details>
                    {state?.error ? (
                      <p className="rounded-[var(--d-r-md)] border border-[var(--d-danger-fg)]/30 bg-[var(--d-danger-bg)] p-3 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-danger-fg)]">{state.error}</p>
                    ) : null}
                  </SectionCard>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Summary panel — chỉ hiện trên desktop để mobile gọn, tập trung từng bước */}
          <aside className="hidden gap-3 lg:grid lg:sticky lg:top-5 lg:self-start">
            <div className="overflow-hidden rounded-[var(--d-r-xl)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-md)]">
              <div
                className="relative flex items-center gap-2 px-4 py-3.5 text-white"
                style={{ background: "linear-gradient(135deg, var(--d-jade), var(--d-jade-700))" }}
              >
                <span className="grid h-8 w-8 place-items-center rounded-[var(--d-r-md)] bg-white/15">
                  <Store className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-white/70">Quán của bạn</p>
                  <p className="text-[length:var(--d-fs-sm)] font-bold">Xem trước trực tiếp</p>
                </div>
              </div>
              <div className="p-3">{storePreview}</div>
            </div>

            <div className="grid gap-1.5 rounded-[var(--d-r-xl)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3 shadow-[var(--d-sh-sm)]">
              <SummaryRow icon={Store} label="Tên" value={shortText(name)} active={name.trim().length >= 2} />
              <SummaryRow icon={Hash} label="Mã quán" value={slug} active={slugReady} />
              <SummaryRow icon={Building2} label="Loại hình" value={selectedPreset.value === "OTHER" ? shortText(customBusinessType, selectedPreset.label) : selectedPreset.label} active={hasBusinessType} />
              <SummaryRow icon={MapPin} label="Địa chỉ" value={hasStructuredAddress ? "Đã có" : "Cần nhập"} active={hasStructuredAddress} />
              <SummaryRow icon={CreditCard} label="Gói" value={selectedPlan ? planDisplayName(selectedPlan) : "Chưa chọn"} active={Boolean(selectedPlan)} />
              <SummaryRow icon={Table2} label="Bàn" value={`${tableCount} bàn`} active />
              <SummaryRow icon={Utensils} label="Món đầu" value={confirmedMenuItems.length > 0 ? `${confirmedMenuItems.length} món` : itemName.trim() ? "1 món" : "Chưa có"} active={canSubmitOnboarding} />
            </div>
          </aside>
        </div>

        {/* Sticky action bar */}
        <footer className="sticky bottom-0 z-30 -mx-4 border-t border-[var(--d-line)] bg-[var(--d-surface)]/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0 sm:flex-1">
              <p className="d-eyebrow text-[var(--d-jade)]">{currentStepMeta.title}</p>
              <p className="truncate text-[length:var(--d-fs-xs)] font-medium text-[var(--d-text-muted)] sm:text-[length:var(--d-fs-sm)]">{actionHint}</p>
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
              <button
                type="button"
                onClick={() => setStep((current) => Math.max(0, current - 1))}
                disabled={step === 0 || launching}
                className="inline-flex h-12 flex-1 items-center justify-center rounded-[var(--d-r-md)] border border-[var(--d-line-strong)] bg-[var(--d-surface)] px-4 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)] transition hover:border-[var(--d-jade)] disabled:pointer-events-none disabled:opacity-40 sm:h-11 sm:flex-none"
              >
                Quay lại
              </button>
              {step < 3 ? (
                <motion.button
                  type="button"
                  onClick={() => advanceTo(step + 1)}
                  disabled={nextStepDisabled || launching}
                  whileTap={{ scale: 0.98 }}
                  className="group inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[var(--d-r-md)] px-6 text-[length:var(--d-fs-sm)] font-bold text-white shadow-[0_10px_26px_rgba(15,77,58,0.28)] transition disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none sm:h-11 sm:flex-none"
                  style={{ background: "linear-gradient(135deg, var(--d-jade), var(--d-jade-700))" }}
                >
                  {nextStepLabel}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </motion.button>
              ) : (
                <motion.button
                  type="submit"
                  disabled={launching || !canSubmitOnboarding}
                  whileTap={{ scale: 0.98 }}
                  className="group inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[var(--d-r-md)] px-6 text-[length:var(--d-fs-sm)] font-bold text-white shadow-[0_10px_26px_rgba(242,140,40,0.30)] transition disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none sm:h-11 sm:flex-none"
                  style={{
                    background: canSubmitOnboarding && !launching
                      ? "linear-gradient(135deg, var(--d-orange), var(--d-orange-600))"
                      : "linear-gradient(135deg, var(--d-jade), var(--d-jade-700))"
                  }}
                >
                  {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />}
                  {launching ? "Đang tạo..." : "Tạo quán ngay"}
                </motion.button>
              )}
            </div>
          </div>
        </footer>

        {featurePlan ? (
          <PlanFeaturesModal
            plan={featurePlan}
            allPlans={plans}
            onClose={() => setFeaturePlan(null)}
            onSelect={() => {
              selectPlan(featurePlan);
              setFeaturePlan(null);
            }}
          />
        ) : null}

        {launching ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[var(--d-z-modal)] grid place-items-center px-4 backdrop-blur-md"
            style={{ background: "radial-gradient(circle at 50% 25%, rgba(15,77,58,0.92) 0%, rgba(7,31,24,0.97) 70%)" }}
          >
            <motion.section
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-[440px] overflow-hidden rounded-[var(--d-r-xl)] border border-white/15 bg-white/[0.08] p-6 text-white shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
            >
              <div className="flex flex-col items-center text-center">
                <div className="relative grid h-20 w-20 place-items-center">
                  <motion.span
                    className="absolute inset-0 rounded-full border-[3px] border-white/15 border-t-[var(--d-orange)]"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                  <span className="grid h-14 w-14 place-items-center rounded-full text-white" style={{ background: "linear-gradient(135deg, var(--d-orange), var(--d-orange-600))" }}>
                    <Rocket className="h-7 w-7" />
                  </span>
                </div>
                <p className="mt-5 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-white/60">Đang khởi tạo quán</p>
                <AnimatePresence mode="wait">
                  <motion.h2
                    key={launchMessageIndex}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25 }}
                    className="mt-1 font-[var(--d-font-display)] text-[1.25rem] font-bold"
                  >
                    {launchMessages[launchMessageIndex]}
                  </motion.h2>
                </AnimatePresence>
              </div>

              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/15">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "linear-gradient(90deg, var(--d-orange-300), var(--d-orange))" }}
                  animate={{ width: `${((launchMessageIndex + 1) / launchMessages.length) * 100}%` }}
                  transition={{ ease: [0.22, 1, 0.36, 1] }}
                />
              </div>

              <ul className="mt-5 grid gap-2.5">
                {launchMessages.map((message, index) => {
                  const done = index < launchMessageIndex;
                  const current = index === launchMessageIndex;
                  return (
                    <li key={message} className={cn("flex items-center gap-2.5 text-[length:var(--d-fs-sm)] font-medium transition", done || current ? "text-white" : "text-white/45")}>
                      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full", done ? "bg-[var(--d-orange)]" : current ? "bg-white/20" : "bg-white/10")}>
                        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : current ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      </span>
                      {message}
                    </li>
                  );
                })}
              </ul>

              <p className="mt-5 text-center text-[length:var(--d-fs-xs)] font-medium leading-[var(--d-lh-body)] text-white/65">
                LogiVN đang tạo dữ liệu thật cho quán. Giữ màn hình này mở trong vài giây.
              </p>
            </motion.section>
          </motion.div>
        ) : null}
      </form>
    </main>
  );
}

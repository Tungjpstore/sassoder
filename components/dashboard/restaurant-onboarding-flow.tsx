"use client";

import Image from "next/image";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  Coffee,
  CreditCard,
  Info,
  Layers3,
  ListChecks,
  RotateCcw,
  Loader2,
  LocateFixed,
  MapPin,
  MousePointerClick,
  PlusCircle,
  QrCode,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Smartphone,
  Table2,
  Utensils,
  Wand2,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { onboardingAction } from "@/app/dashboard/actions";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { useDialogFocusTrap } from "@/components/dashboard/dialog-focus";
import { getOnboardingTableLimit } from "@/lib/billing/plan-limits";
import { buildOnboardingRunway, formatDraftSavedLabel } from "@/lib/onboarding-runway";
import { createSlug } from "@/lib/slug";
import { createMapSessionToken, fetchAddressPredictions, resolveAddressPrediction } from "@/services/maps/client-address-service";
import type { AddressAutocompletePrediction } from "@/services/maps/types";
import { InteractiveStorePreview } from "@/components/dashboard/interactive-store-preview";
import { motion, AnimatePresence } from "framer-motion";

type BusinessPreset = {
  id: string;
  label: string;
  value: "CAFE" | "RESTAURANT" | "FAST_FOOD" | "BAR" | "OTHER";
  icon: typeof Coffee;
};

type OnboardingVisual = {
  src: string;
  alt: string;
  eyebrow: string;
  title: string;
  caption: string;
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
type MobileOnboardingStepId = "identity" | "location" | "plan" | "review" | "tables" | "menu";
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

const steps = ["Thông tin quán", "Chọn gói", "Thiết lập", "Bàn & QR", "Menu"];
const launchMessages = [
  "Đang chuẩn bị quán của bạn...",
  "Khởi tạo dashboard vận hành...",
  "Tạo bàn và QR ordering system...",
  "Lưu menu đầu tiên...",
  "Bật checklist sẵn sàng bán thật..."
];
const onboardingVisuals: OnboardingVisual[] = [
  {
    src: "/onboarding/flow/store-profile.png",
    alt: "Minh hoạ tạo hồ sơ quán trên LogiVN",
    eyebrow: "Hồ sơ quán",
    title: "Thông tin đủ để mở dashboard",
    caption: "Tên, loại hình, vị trí và hotline được đóng gói thành hồ sơ vận hành đầu tiên."
  },
  {
    src: "/onboarding/flow/plan-selection.png",
    alt: "Minh hoạ chọn gói vận hành LogiVN",
    eyebrow: "Gói vận hành",
    title: "Chọn gói phù hợp quy mô hiện tại",
    caption: "Mỗi gói được giải thích bằng tính năng thật, không chỉ bằng giá."
  },
  {
    src: "/onboarding/flow/setup-checklist.png",
    alt: "Minh hoạ kiểm tra tiến độ thiết lập quán",
    eyebrow: "Kiểm tra",
    title: "Rà lại các phần cần sẵn sàng",
    caption: "Checklist giúp chủ quán biết còn thiếu gì trước khi bấm khởi tạo."
  },
  {
    src: "/onboarding/flow/table-qr.png",
    alt: "Minh hoạ tạo bàn và mã QR gọi món",
    eyebrow: "Bàn & QR",
    title: "Sinh QR cho khu vực phục vụ",
    caption: "Tạo sẵn bàn mẫu để sau onboarding có thể in QR ngay."
  },
  {
    src: "/onboarding/flow/menu-import.png",
    alt: "Minh hoạ nhập menu đầu tiên",
    eyebrow: "Menu",
    title: "Tạo menu đầu tiên để bán ngay",
    caption: "Có thể nhập một món nhanh hoặc dùng AI đọc ảnh menu để tăng tốc."
  }
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
    title: "Kiểm tra sẵn sàng",
    description: "Một checklist ngắn để chắc chắn hồ sơ, gói, bàn và menu đã đủ điều kiện khởi tạo.",
    outcome: "Không bị lạc giữa nhiều thao tác trước khi mở dashboard.",
    icon: ListChecks
  },
  {
    eyebrow: "Bước 4",
    title: "Bàn & QR",
    description: "Tạo số bàn ban đầu để sau khi vào dashboard có thể in QR hoặc chỉnh sơ đồ phục vụ.",
    outcome: "QR ordering được dựng sẵn thay vì bắt đầu từ trang trắng.",
    icon: QrCode
  },
  {
    eyebrow: "Bước 5",
    title: "Menu đầu tiên",
    description: "Thêm món mẫu hoặc dùng AI đọc ảnh menu để LogiVN tạo danh mục bán hàng đầu tiên.",
    outcome: "Dashboard mở ra với dữ liệu thật, không phải empty state lạnh lẽo.",
    icon: Wand2
  }
];
const fieldClass =
  "h-11 w-full rounded-md border border-[#d8dee9] bg-[#f8fafc] px-3 text-sm font-semibold text-[#111827] outline-none transition placeholder:text-[#98a2b3] focus:border-[#0F4D3A]/70 focus:bg-white focus:ring-2 focus:ring-[#0F4D3A]/10";
const iconFieldClass = `${fieldClass} pl-10`;
const sectionLine = "border-[#d8dee9]";
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

const planVisualFeatures: Record<string, { icon: LucideIcon; title: string; subtext: string; isAi?: boolean }[]> = {
  pro: [
    {
      icon: QrCode,
      title: "Menu QR & Gọi món",
      subtext: "Tối đa 20 bàn trong gói Pro"
    },
    {
      icon: Clock3,
      title: "Vận hành Real-time",
      subtext: "Đồng bộ đơn hàng, bếp & bàn ăn"
    },
    {
      icon: CreditCard,
      title: "Thanh toán VietQR",
      subtext: "Tự sinh mã chuyển khoản & đối soát"
    },
    {
      icon: Layers3,
      title: "Báo cáo cơ bản",
      subtext: "Theo dõi doanh thu & món bán chạy"
    }
  ],
  premium: [
    {
      icon: Sparkles,
      title: "AI Co-Pilot & Insights",
      subtext: "Tự động gợi ý menu & phân tích bán chéo",
      isAi: true
    },
    {
      icon: BadgeCheck,
      title: "Báo cáo chuyên sâu",
      subtext: "Dự báo giờ cao điểm, kiểm soát chi phí"
    },
    {
      icon: Store,
      title: "Mở rộng chuỗi chi nhánh",
      subtext: "300 bàn, 50 nhân viên theo giới hạn vận hành"
    },
    {
      icon: Smartphone,
      title: "Trải nghiệm thương hiệu",
      subtext: "Trang gọi món tùy biến logo & giao diện"
    }
  ]
};

function formatVnd(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(value)}đ`;
}

function planFeatureList(plan: OnboardingPlan) {
  const fromPlan = plan.features.map((feature) => feature.trim()).filter(Boolean);
  const fallback = fallbackPlanFeatures[plan.code.toLowerCase()] ?? fallbackPlanFeatures.pro;
  return fromPlan.length > 0 ? fromPlan : fallback;
}

function planFeaturePreview(plan: OnboardingPlan) {
  return planFeatureList(plan).slice(0, 3);
}

function planFeatureGroups(plan: OnboardingPlan) {
  const features = planFeatureList(plan);
  return [
    {
      title: "Bán hàng tại quán",
      items: features.slice(0, 3)
    },
    {
      title: "Quản trị & báo cáo",
      items: features.slice(3, 6)
    },
    {
      title: plan.code.toLowerCase() === "premium" ? "AI nâng cao" : "Sẵn sàng nâng cấp",
      items: features.slice(6)
    }
  ].filter((group) => group.items.length > 0);
}

function planNarrative(plan: OnboardingPlan) {
  const isPremium = plan.code.toLowerCase() === "premium";
  return {
    badge: isPremium ? "Khuyến nghị cho tăng trưởng" : "Bắt đầu gọn nhẹ",
    fit: isPremium ? "Quán đông khách, cần đến 300 bàn, 50 nhân viên, đặt bàn, báo cáo sâu hoặc AI nâng cao." : "Quán mới triển khai QR ordering, cần setup nhanh và chi phí dễ kiểm soát.",
    promise: isPremium ? "Tự động hoá nhiều quyết định vận hành hơn sau ngày đầu." : "Có đủ nền móng để bán, nhận đơn và theo dõi doanh thu.",
    decision: isPremium ? "Chọn nếu muốn đi nhanh hơn với AI" : "Chọn nếu muốn khởi động chắc chắn"
  };
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

function StepHeader({ meta, right }: { meta: StepMeta; right?: ReactNode }) {
  const Icon = meta.icon;

  return (
    <div className={`dashboard-onboarding-step-header shrink-0 border-b ${sectionLine} bg-white px-4 py-4 sm:px-5`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="dashboard-onboarding-step-icon grid h-11 w-11 shrink-0 place-items-center rounded-md bg-[#0F4D3A] text-white">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0F4D3A]">{meta.eyebrow}</p>
            <h2 className="mt-1 text-xl font-black text-[#111827] sm:text-2xl">{meta.title}</h2>
            <p className="mt-1 max-w-2xl text-sm font-semibold leading-5 text-[#667085]">{meta.description}</p>
          </div>
        </div>
        {right ? <div className="min-w-0 shrink-0">{right}</div> : null}
      </div>
      <p className="mt-3 rounded-md border border-[#0F4D3A]/12 bg-[#eef7f2] px-3 py-2 text-xs font-black leading-5 text-[#0F4D3A]">
        {meta.outcome}
      </p>
    </div>
  );
}

function SupportLine({ label, value, active = false }: { label: string; value: string; active?: boolean }) {
  return (
    <div className={`dashboard-onboarding-support-line flex min-h-9 items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-[11px] lg:min-h-10 lg:px-3 lg:text-xs ${active ? "is-active" : ""}`}>
      <span className="font-bold text-[#667085]">{label}</span>
      <span className={`min-w-0 truncate text-right font-black ${active ? "text-[#0F4D3A]" : "text-[#111827]"}`}>{value}</span>
    </div>
  );
}

function StepSupportPanel({ step, children, preview }: { step: number; children: ReactNode; preview?: ReactNode }) {
  const visual = onboardingVisuals[step] ?? onboardingVisuals[0];

  return (
    <aside className={`dashboard-onboarding-support order-first min-h-0 rounded-lg border ${sectionLine} bg-[#f5faf7] p-3 lg:order-last lg:self-start lg:w-[330px] shrink-0`}>
      {preview && (
        <div className="hidden lg:block w-full mb-4">
          {preview}
        </div>
      )}
      <div className="dashboard-onboarding-support-inner grid grid-cols-[88px_minmax(0,1fr)] gap-3 sm:grid-cols-[124px_minmax(0,1fr)] lg:block">
        <div className={`dashboard-onboarding-visual-card relative aspect-square overflow-hidden rounded-md border border-[#d8dee9] bg-white ${preview ? "lg:hidden" : ""}`}>
          <Image
            src={visual.src}
            alt={visual.alt}
            fill
            sizes="(min-width: 1024px) 300px, 124px"
            priority={step === 0}
            className="object-cover"
          />
        </div>
        <div className="min-w-0 self-center lg:mt-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#0F4D3A]">{visual.eyebrow}</p>
          <h3 className="mt-1 text-base font-black leading-tight text-[#111827]">{visual.title}</h3>
          <p className="mt-2 hidden text-xs font-semibold leading-5 text-[#667085] sm:block">{visual.caption}</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5 lg:mt-3 lg:grid-cols-1 lg:gap-2">{children}</div>
        </div>
      </div>
    </aside>
  );
}

function OnboardingButton({
  children,
  onClick,
  disabled = false,
  type = "button",
  className = ""
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`dashboard-onboarding-primary-button inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#0F4D3A] px-5 text-sm font-black text-white transition hover:bg-[#0b3d2e] disabled:pointer-events-none disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
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
  const isPremium = plan.code.toLowerCase() === "premium";
  const narrative = planNarrative(plan);
  const comparisonPlans = allPlans.length > 0 ? allPlans : [plan];

  useDialogFocusTrap({ containerRef: panelRef, onClose, open: true });

  return (
    <div
      className="dashboard-plan-modal-backdrop fixed inset-0 z-[60] grid place-items-center bg-[#102a1f]/72 px-3 py-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        tabIndex={-1}
        className="dashboard-plan-modal max-h-[min(780px,92svh)] w-full max-w-[920px] overflow-hidden rounded-lg border border-white/20 bg-white text-[#111827] shadow-[0_26px_100px_rgba(15,42,31,0.28)] outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-features-title"
      >
        <div className="dashboard-plan-modal-head border-b border-[#d8dee9] bg-[#f5faf7] px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#0F4D3A]">{narrative.badge}</p>
              <h3 id="plan-features-title" className="mt-1 text-2xl font-black">
                Toàn bộ tính năng gói {plan.name}
              </h3>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[#667085]">
                Popup này giúp chủ quán chọn bằng quyền lợi vận hành thật: bán hàng, báo cáo, AI, nhân sự và mở rộng.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-[#d8dee9] bg-white text-[#475467] transition hover:border-[#0F4D3A]/35 hover:text-[#0F4D3A]"
              aria-label="Đóng popup tính năng"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="dashboard-plan-modal-stat rounded-md border border-[#d8dee9] bg-white px-3 py-2">
              <p className="text-[11px] font-bold text-[#667085]">Giá</p>
              <p className="mt-1 text-lg font-black text-[#0F4D3A]">{formatVnd(plan.monthly_price)}/tháng</p>
            </div>
            <div className="dashboard-plan-modal-stat rounded-md border border-[#d8dee9] bg-white px-3 py-2">
              <p className="text-[11px] font-bold text-[#667085]">Dùng thử</p>
              <p className="mt-1 text-lg font-black text-[#111827]">{plan.trial_days} ngày</p>
            </div>
            <div className={`dashboard-plan-modal-stat rounded-md border px-3 py-2 ${isPremium ? "border-[#F28C28]/35 bg-[#fff7ed]" : "border-[#0F4D3A]/20 bg-[#eef7f2]"}`}>
              <p className="text-[11px] font-bold text-[#667085]">Phù hợp</p>
              <p className={`mt-1 text-sm font-black ${isPremium ? "text-[#9a4a17]" : "text-[#0F4D3A]"}`}>
                {isPremium ? "AI nâng cao" : "QR ordering ngày đầu"}
              </p>
            </div>
          </div>
        </div>
        <div className="dashboard-plan-modal-body max-h-[52svh] overflow-y-auto px-4 py-4 sm:px-5">
          <div className={`dashboard-plan-modal-summary rounded-lg border p-4 ${isPremium ? "border-[#F28C28]/28 bg-[#fff7ed]" : "border-[#0F4D3A]/16 bg-[#eef7f2]"}`}>
            <p className="text-sm font-black text-[#111827]">{narrative.decision}</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-[#475467]">{narrative.fit}</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {groups.map((group) => (
              <div key={group.title} className="dashboard-plan-feature-group rounded-lg border border-[#d8dee9] bg-white p-3">
                <p className="flex items-center gap-2 text-sm font-black text-[#111827]">
                  <Sparkles className="h-4 w-4 text-[#0F4D3A]" />
                  {group.title}
                </p>
                <ul className="mt-3 grid gap-2">
                  {group.items.map((feature) => (
                    <li key={feature} className="flex gap-2 text-sm font-semibold leading-5 text-[#475467]">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0F4D3A]" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="dashboard-plan-modal-comparison mt-4 rounded-lg border border-[#d8dee9] bg-white p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-black text-[#111827]">So sánh nhanh các gói đang có</p>
              <span className="text-xs font-bold text-[#667085]">Giá, số tính năng và định hướng sử dụng</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {comparisonPlans.map((item) => {
                const active = item.code === plan.code;
                const itemNarrative = planNarrative(item);

                return (
                  <article key={item.id} className={`rounded-md border p-3 ${active ? "border-[#0F4D3A] bg-[#eef7f2]" : "border-[#d8dee9] bg-[#fbfcfb]"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#0F4D3A]">{item.code}</p>
                        <p className="mt-1 text-base font-black text-[#111827]">{item.name}</p>
                      </div>
                      {active ? <BadgeCheck className="h-5 w-5 text-[#0F4D3A]" /> : null}
                    </div>
                    <p className="mt-3 text-xl font-black text-[#111827]">{formatVnd(item.monthly_price)}<span className="text-xs font-bold text-[#667085]">/tháng</span></p>
                    <p className="mt-2 text-xs font-semibold leading-5 text-[#667085]">{itemNarrative.promise}</p>
                    <p className="mt-2 text-xs font-black text-[#0F4D3A]">{planFeatureCount(item)} tính năng được mô tả</p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
        <div className="grid gap-2 border-t border-[#d8dee9] bg-white px-4 py-3 sm:flex sm:items-center sm:justify-end sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-md border border-[#d8dee9] bg-white px-4 text-sm font-black text-[#475467] transition hover:border-[#0F4D3A]/35"
          >
            Xem lại
          </button>
          <button
            type="button"
            onClick={onSelect}
            className="dashboard-onboarding-primary-button inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#0F4D3A] px-5 text-sm font-black text-white transition hover:bg-[#0b3d2e]"
          >
            Chọn {plan.name}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}

function StepNavigator({
  steps,
  step,
  furthestStep,
  onSelect
}: {
  steps: string[];
  step: number;
  furthestStep: number;
  onSelect: (nextStep: number) => void;
}) {
  return (
    <nav className="dashboard-onboarding-stepper -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {steps.map((label, index) => {
        const active = step === index;
        const disabled = index > furthestStep;

        return (
          <button
            key={label}
            type="button"
            onClick={() => onSelect(index)}
            disabled={disabled}
            aria-current={active ? "step" : undefined}
            aria-label={`${label}${disabled ? " chưa mở" : active ? " đang làm" : " đã mở"}`}
            className={`dashboard-onboarding-step-button flex min-h-11 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-black transition ${
              active
                ? "is-active border-[#0F4D3A] bg-[#0F4D3A] text-white"
                : disabled
                  ? "cursor-not-allowed border-[#d8dee9] bg-[#f8fafc] text-[#98a2b3]"
                  : "border-[#d8dee9] bg-white text-[#475467] hover:border-[#0F4D3A]/35"
            }`}
          >
            <span className={`grid h-6 w-6 place-items-center rounded-md text-xs ${active ? "bg-white/20 text-white" : "bg-[#eef7f2] text-[#0F4D3A]"}`}>
              {index < step ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
            </span>
            <span className="whitespace-nowrap">{label}</span>
          </button>
        );
      })}
    </nav>
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
  const [mobileStep, setMobileStep] = useState<MobileOnboardingStepId>("identity");
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
  const progress = [22, 42, 70, 88, 100][step] ?? 22;
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
  const nextStepLabel = step === 4 ? "Hoàn tất" : "Tiếp tục";
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
  const mobileSteps: Array<{ id: MobileOnboardingStepId; label: string; progress: number }> = [
    { id: "identity", label: "Định danh", progress: 16 },
    { id: "location", label: "Vị trí", progress: 32 },
    { id: "plan", label: "Gói", progress: 50 },
    { id: "review", label: "Rà lại", progress: 66 },
    { id: "tables", label: "Bàn", progress: 82 },
    { id: "menu", label: "Menu", progress: 100 }
  ];
  const mobileStepIndex = Math.max(0, mobileSteps.findIndex((item) => item.id === mobileStep));
  const mobileCurrentStep = mobileSteps[mobileStepIndex] ?? mobileSteps[0];
  const mobileHasMenu = confirmedMenuItems.length > 0 || itemName.trim().length >= 2;
  const mobileCanContinue =
    mobileStep === "identity"
      ? canContinueIdentity
      : mobileStep === "location"
        ? canContinueInfo
        : mobileStep === "plan"
          ? Boolean(selectedPlan)
          : mobileStep === "tables"
            ? tableCount > 0
            : true;
  const mobileMissingReason =
    mobileStep === "identity"
      ? missingInfoLabels.filter((label) => label !== "địa chỉ").slice(0, 2).join(", ")
      : mobileStep === "location" && !hasStructuredAddress
        ? "địa chỉ"
        : mobileStep === "plan" && !selectedPlan
          ? "gói vận hành"
          : mobileStep === "menu" && !mobileHasMenu
            ? "một món đầu tiên"
            : "";

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
        setWardCode((current) => (payload.data?.wards ?? []).some((item) => item.code === current) ? current : "");
        setWard((current) => (payload.data?.wards ?? []).some((item) => item.name === current) ? current : "");
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

  function openMobileStep(nextStep: MobileOnboardingStepId) {
    setMobileStep(nextStep);
  }

  function advanceMobile() {
    const nextStep = mobileSteps[mobileStepIndex + 1];
    if (nextStep) setMobileStep(nextStep.id);
  }

  function retreatMobile() {
    const previousStep = mobileSteps[mobileStepIndex - 1];
    if (previousStep) setMobileStep(previousStep.id);
  }

  function mobileStepFromRunwayTarget(targetStep: number): MobileOnboardingStepId {
    if (targetStep === 1) return "plan";
    if (targetStep === 3) return "tables";
    if (targetStep === 4) return "menu";
    return "identity";
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
  const CurrentStepIcon = currentStepMeta.icon;
  const selectedPlanNarrative = selectedPlan ? planNarrative(selectedPlan) : null;
  const actionHint = launching
    ? launchMessages[launchMessageIndex]
    : step === 0 && missingInfoLabels.length > 0
      ? `Cần thêm ${missingInfoLabels.slice(0, 3).join(", ")}`
      : step === 1 && !selectedPlan
        ? "Chọn một gói để tiếp tục"
        : step === 4 && !canSubmitOnboarding
          ? "Cần ít nhất một món hoặc menu đã xác nhận"
          : step === 4
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
    <main className="dashboard-onboarding-shell min-h-svh overflow-x-hidden bg-[#f7f8fa] text-[#111827]">
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
        className="dashboard-onboarding-form mx-auto flex h-svh w-full max-w-6xl flex-col gap-3 overflow-hidden px-3 py-3 sm:px-4"
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

        <section className="onboarding-mobile-shell md:hidden" aria-label="Tạo quán mới trên mobile">
          <header className="onboarding-mobile-brandbar">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <LogiVNLogo href="/" className="h-7" priority />
              <span className="onboarding-mobile-pill">{draftSavedAt > 0 ? "Nháp đã lưu" : "Tạo quán"}</span>
            </div>
            <div className="onboarding-mobile-progress-row">
              <span>{mobileCurrentStep.label}</span>
              <strong>{mobileCurrentStep.progress}%</strong>
            </div>
            <div className="onboarding-mobile-rail" aria-hidden="true">
              {mobileSteps.map((item, index) => (
                <span key={item.id} className={index <= mobileStepIndex ? "is-active" : ""} />
              ))}
            </div>
          </header>

          <div className="onboarding-mobile-screen">
            {mobileStep === "identity" ? (
              <div className="onboarding-mobile-pane">
                <p className="onboarding-mobile-eyebrow">Bước 1</p>
                <h1>Định danh quán</h1>
                <label className="onboarding-mobile-field">
                  <span>Tên quán</span>
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nhập tên quán" />
                </label>
                <label className="onboarding-mobile-field">
                  <span>Mã quán</span>
                  <span className="onboarding-mobile-input-wrap">
                    <input
                      value={displayedSlugInput}
                      onChange={(event) => {
                        setSlugEdited(true);
                        setSlugInput(createSlug(event.target.value));
                      }}
                      placeholder="quan-cua-ban"
                    />
                    {slugStatus === "checking" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {slugStatus === "available" ? <CheckCircle2 className="h-4 w-4" /> : null}
                  </span>
                </label>
                <div className={`onboarding-mobile-inline-status ${slugReady ? "is-ok" : "is-warning"}`}>
                  <span>{slug}.logivn.com</span>
                  <strong>{slugStatus === "available" ? "Khả dụng" : slugStatus === "checking" ? "Đang kiểm tra" : slugStatus === "taken" ? "Đã dùng" : "Cần kiểm tra"}</strong>
                </div>
                <div className="onboarding-mobile-chip-grid" aria-label="Loại hình quán">
                  {businessPresets.map((preset) => {
                    const Icon = preset.icon;
                    const active = businessPresetId === preset.id;
                    return (
                      <button key={preset.id} type="button" onClick={() => setBusinessPresetId(preset.id)} className={active ? "is-active" : ""} aria-pressed={active}>
                        <Icon className="h-4 w-4" />
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
                {selectedPreset.value === "OTHER" ? (
                  <label className="onboarding-mobile-field">
                    <span>Danh mục riêng</span>
                    <input value={customBusinessType} onChange={(event) => setCustomBusinessType(event.target.value)} placeholder="Bakery, pub, homestay cafe..." />
                  </label>
                ) : null}
                <label className="onboarding-mobile-field">
                  <span>Hotline</span>
                  <input value={hotline} onChange={(event) => setHotline(event.target.value)} placeholder="0901234567" inputMode="tel" />
                </label>
              </div>
            ) : null}

            {mobileStep === "location" ? (
              <div className="onboarding-mobile-pane">
                <p className="onboarding-mobile-eyebrow">Bước 1b</p>
                <h1>Ghim nơi bán</h1>
                <label className="onboarding-mobile-field">
                  <span>Địa chỉ hoặc mốc gần quán</span>
                  <input
                    value={streetAddress}
                    onChange={(event) => {
                      setStreetAddress(event.target.value);
                      clearSelectedAddress();
                    }}
                    placeholder="12 Nguyễn Huệ, Quận 1"
                  />
                </label>
                <div className="onboarding-mobile-two-actions">
                  <button type="button" onClick={() => void handleUseCurrentPosition()} disabled={locationPending}>
                    {locationPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                    GPS
                  </button>
                  <button type="button" onClick={() => void searchAddressSuggestions()} disabled={addressSearching || finalAddress.trim().length < 6}>
                    {addressSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Tìm
                  </button>
                </div>
                {addressResults.length > 0 ? (
                  <div className="onboarding-mobile-list" aria-label="Gợi ý địa chỉ">
                    {addressResults.slice(0, 3).map((result, index) => (
                      <button key={result.id} type="button" onClick={() => void chooseAddressSuggestion(result)}>
                        <span>{index + 1}</span>
                        <strong>{result.shortLabel || result.address}</strong>
                      </button>
                    ))}
                  </div>
                ) : null}
                <details className="onboarding-mobile-details">
                  <summary>Tỉnh/xã thủ công</summary>
                  <div className="grid gap-2 pt-3">
                    <select value={provinceCode} onChange={(event) => chooseProvince(event.target.value)}>
                      <option value="">{adminLoading ? "Đang tải..." : "Chọn tỉnh/thành"}</option>
                      {provinces.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                    </select>
                    <select value={wardCode} onChange={(event) => chooseWard(event.target.value)} disabled={!provinceCode || adminLoading}>
                      <option value="">{provinceCode ? "Chọn xã/phường" : "Chọn tỉnh trước"}</option>
                      {wards.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                    </select>
                    <input value={district} onChange={(event) => { setDistrict(event.target.value); clearSelectedAddress(); }} placeholder="Huyện cũ / thôn ấp" />
                  </div>
                </details>
                {locationError || addressError ? <p className="onboarding-mobile-warning">{locationError || addressError}</p> : null}
                {hasPinnedLocation ? <p className="onboarding-mobile-success">{locationQualityLabel(locationAccuracy)}</p> : null}
              </div>
            ) : null}

            {mobileStep === "plan" ? (
              <div className="onboarding-mobile-pane">
                <p className="onboarding-mobile-eyebrow">Bước 2</p>
                <h1>Gói vận hành</h1>
                <div className="onboarding-mobile-recommendation">Phù hợp hiện tại: <strong>{selectedPlan?.name ?? "Pro"}</strong></div>
                <div className="onboarding-mobile-plan-list">
                  {plans.map((plan) => {
                    const active = plan.code === planCode;
                    return (
                      <article key={plan.id} className={active ? "is-active" : ""}>
                        <div>
                          <h2>{plan.name}</h2>
                          <p>{formatVnd(plan.monthly_price)}/tháng · dùng thử {plan.trial_days} ngày</p>
                          <p>{planFeaturePreview(plan).slice(0, 3).join(" · ")}</p>
                        </div>
                        <button type="button" onClick={() => selectPlan(plan)}>{active ? "Đã chọn" : "Chọn"}</button>
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {mobileStep === "review" ? (
              <div className="onboarding-mobile-pane">
                <p className="onboarding-mobile-eyebrow">Bước 3</p>
                <h1>{setupDoneCount}/{setupTasks.length} mục sẵn sàng</h1>
                <div className="onboarding-mobile-review-list">
                  {setupTasks.map((item) => (
                    <button key={item.id} type="button" onClick={() => openMobileStep(mobileStepFromRunwayTarget(item.targetStep))}>
                      <span>{item.label}</span>
                      {item.done ? <CheckCircle2 className="h-5 w-5" /> : <span className="onboarding-mobile-empty-dot" />}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {mobileStep === "tables" ? (
              <div className="onboarding-mobile-pane">
                <p className="onboarding-mobile-eyebrow">Bước 4</p>
                <h1>Bàn & QR</h1>
                <div className="onboarding-mobile-stepper">
                  <button type="button" onClick={() => setTableCount((value) => Math.max(1, value - 1))}>-</button>
                  <strong>{tableCount}</strong>
                  <button type="button" onClick={() => setTableCount((value) => Math.min(selectedPlanTableLimit, value + 1))}>+</button>
                </div>
                <p className="onboarding-mobile-success">Giới hạn gói: tối đa {selectedPlanTableLimit} bàn.</p>
                <div className="onboarding-mobile-preset-grid">
                  {tablePresetOptions.map((count) => (
                    <button key={count} type="button" onClick={() => setTableCount(count)} className={tableCount === count ? "is-active" : ""}>{count}</button>
                  ))}
                </div>
                <div className="onboarding-mobile-table-preview">
                  {[0, 1, 2].map((index) => <span key={index}>{formatTableName(index)}</span>)}
                </div>
                <p className="onboarding-mobile-success">QR sẵn sau khi tạo quán.</p>
              </div>
            ) : null}

            {mobileStep === "menu" ? (
              <div className="onboarding-mobile-pane">
                <p className="onboarding-mobile-eyebrow">Bước 5</p>
                <h1>Menu đầu tiên</h1>
                <div className="onboarding-mobile-segment"><span className="is-active">Nhập nhanh</span><span>AI menu</span></div>
                <label className="onboarding-mobile-field"><span>Tên món</span><input value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Cà phê sữa đá" /></label>
                <label className="onboarding-mobile-field"><span>Giá</span><input value={itemPrice} onChange={(event) => setItemPrice(event.target.value.replace(/\D/g, ""))} placeholder="28000" inputMode="numeric" /></label>
                <label className="onboarding-mobile-field"><span>Danh mục</span><input value={itemCategory} onChange={(event) => setItemCategory(event.target.value)} placeholder="Cà phê" /></label>
                <details className="onboarding-mobile-details">
                  <summary>AI đọc ảnh menu</summary>
                  <div className="grid gap-2 pt-3">
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => handleMenuOcrImage(event.target.files?.[0] ?? null)} />
                    <textarea value={menuOcrText} onChange={(event) => setMenuOcrText(event.target.value)} placeholder="Dán menu thô" />
                    <button type="button" onClick={() => void runMenuOcr()} disabled={menuOcrLoading || (!menuOcrText.trim() && !menuOcrImage)}>{menuOcrLoading ? "Đang đọc..." : "Quét menu"}</button>
                  </div>
                </details>
                {menuOcrError ? <p className="onboarding-mobile-warning">{menuOcrError}</p> : null}
                {ocrDraftItems.length > 0 ? (
                  <div className="onboarding-mobile-list" aria-label="Món AI đã đọc">
                    {ocrDraftItems.slice(0, 3).map((item) => (
                      <button key={`${item.categoryName}-${item.name}-${item.price}`} type="button" onClick={() => setConfirmedMenuItems(ocrDraftItems)}>
                        <strong>{item.name}</strong>
                        <span>{formatVnd(item.price)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {ocrDraftItems.length > 0 ? <button type="button" className="onboarding-mobile-confirm" onClick={() => setConfirmedMenuItems(ocrDraftItems)}>Xác nhận {ocrDraftItems.length} món</button> : null}
                <p className="onboarding-mobile-success">Đã xác nhận: {confirmedMenuItems.length || (itemName.trim() ? 1 : 0)} món.</p>
                {state?.error ? <p className="onboarding-mobile-warning">{state.error}</p> : null}
              </div>
            ) : null}
          </div>

          <footer className="onboarding-mobile-actionbar">
            {mobileMissingReason ? <p>Cần thêm {mobileMissingReason}</p> : <p>{launching ? launchMessages[launchMessageIndex] : "Sẵn sàng tiếp tục"}</p>}
            <div>
              <button type="button" onClick={retreatMobile} disabled={mobileStepIndex === 0 || launching}>Quay lại</button>
              {mobileStep === "menu" ? (
                <button type="submit" disabled={launching || !canSubmitOnboarding}>{launching ? "Đang tạo..." : "Tạo dashboard"}</button>
              ) : (
                <button type="button" onClick={advanceMobile} disabled={!mobileCanContinue || launching}>Tiếp tục</button>
              )}
            </div>
          </footer>
        </section>

        <header className={`dashboard-onboarding-header hidden shrink-0 rounded-lg border ${sectionLine} bg-white p-3 md:block`}>
          <div className="dashboard-onboarding-hero-bar grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-stretch">
            <div className="flex min-w-0 gap-3">
              <div className="dashboard-onboarding-logo-mark shrink-0 rounded-md border border-[#d8dee9] bg-white px-2 py-1">
                <LogiVNLogo href="/" className="h-8" priority />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#0F4D3A]">SMART ORDERING. BETTER SERVICE.</p>
                <h1 className="mt-1 text-xl font-black text-[#111827] sm:text-2xl">Tạo quán mới trong một mạch</h1>
                <p className="mt-1 max-w-2xl text-sm font-semibold leading-5 text-[#667085]">
                  {currentStepMeta.outcome}
                </p>
              </div>
            </div>
            <div className="dashboard-onboarding-live-card rounded-lg border border-[#0F4D3A]/12 bg-[#eef7f2] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#0F4D3A]">Trạng thái</p>
                  <p className="mt-1 truncate text-base font-black text-[#111827]">{launching ? "Đang khởi tạo quán" : currentStepMeta.title}</p>
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white text-[#0F4D3A] shadow-sm">
                  {launching ? <Loader2 className="h-5 w-5 animate-spin" /> : <CurrentStepIcon className="h-5 w-5" />}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-[#0F4D3A] transition-[width]" style={{ width: `${progress}%` }} />
                </div>
                <span className="w-10 text-right text-xs font-black text-[#0F4D3A]">{progress}%</span>
              </div>
            </div>
          </div>
          <div className="dashboard-onboarding-status-grid mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="dashboard-onboarding-status-card">
              <ShieldCheck className="h-4 w-4 text-[#0F4D3A]" />
              <span>Bảo mật</span>
              <strong>{email ? "Đã xác thực" : "Phiên local"}</strong>
            </div>
            <div className="dashboard-onboarding-status-card">
              <Clock3 className="h-4 w-4 text-[#0F4D3A]" />
              <span>Bản nháp</span>
              <strong>{draftStatusLabel}</strong>
            </div>
            <div className="dashboard-onboarding-status-card">
              <Layers3 className="h-4 w-4 text-[#0F4D3A]" />
              <span>Gói</span>
              <strong>{selectedPlan?.name ?? "Chưa chọn"}</strong>
            </div>
            <div className="dashboard-onboarding-status-card">
              <Smartphone className="h-4 w-4 text-[#0F4D3A]" />
              <span>Sẵn sàng</span>
              <strong>{setupDoneCount}/{setupTasks.length} mục</strong>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {draftRestored ? (
              <span className="rounded-full border border-[#0F4D3A]/20 bg-[#eef7f2] px-3 py-1 text-xs font-black text-[#0F4D3A]">
                Đã khôi phục bản nháp
              </span>
            ) : null}
            {draftSavedAt > 0 ? (
              <button
                type="button"
                onClick={clearDraft}
                className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-black text-[#667085] transition hover:bg-[#f8fafc] hover:text-[#111827]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Xoá nháp
              </button>
            ) : null}
          </div>
          <div className="mt-3">
            <StepNavigator steps={steps} step={step} furthestStep={furthestStep} onSelect={openStep} />
          </div>
        </header>

        <section className="dashboard-onboarding-main hidden min-h-0 flex-1 md:block">
          <div className={`dashboard-onboarding-frame flex h-full min-h-0 flex-col overflow-hidden rounded-lg border ${sectionLine} bg-white`}>
            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div
                  key="step-0"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  transition={{ duration: 0.22 }}
                  className="flex flex-col h-full min-h-0"
                >
                  <StepHeader
                    meta={stepDetails[0]}
                    right={
                      <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#0F4D3A]/16 bg-[#eef7f2] px-3 text-xs font-black text-[#0F4D3A]">
                        <MousePointerClick className="h-4 w-4" />
                        Nhập nhanh
                      </span>
                    }
                  />
                  <div className="dashboard-onboarding-scroll grid min-h-0 flex-1 gap-4 overflow-y-auto p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <StepSupportPanel step={0} preview={storePreview}>
                      <SupportLine label="Tên" value={shortText(name)} active={name.trim().length >= 2} />
                      <SupportLine label="Mã quán" value={slug} active={slugReady} />
                      <SupportLine label="Loại hình" value={selectedPreset.label} active />
                      <SupportLine label="Địa chỉ" value={hasStructuredAddress ? "Đã có" : "Cần nhập"} active={hasStructuredAddress} />
                      <SupportLine label="GPS" value={hasPinnedLocation ? "Đã ghim" : "Có thể chỉnh sau"} active={hasPinnedLocation} />
                    </StepSupportPanel>
                    <div className="grid min-w-0 content-start gap-4">
                    <label className="grid gap-2 text-sm font-black">
                      Tên quán
                      <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className={fieldClass}
                        placeholder="Nhập tên quán"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-black">
                      Mã quán & đường dẫn riêng
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <span className="relative min-w-0">
                          <input
                            value={displayedSlugInput}
                            onChange={(event) => {
                              setSlugEdited(true);
                              setSlugInput(createSlug(event.target.value));
                            }}
                            className={`${fieldClass} pr-10 font-mono uppercase tracking-[0.04em]`}
                            placeholder="quan-cua-ban"
                          />
                          {slugStatus === "checking" ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#98a2b3]" /> : null}
                          {slugStatus === "available" ? <CheckCircle2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0F4D3A]" /> : null}
                        </span>
                        <span className="min-h-11 rounded-md border border-[#d8dee9] bg-[#f8fafc] px-3 py-2 font-mono text-xs font-black text-[#475467] sm:flex sm:items-center">
                          {slug}.logivn.com
                        </span>
                      </div>
                      {slugStatusCopy ? (
                        <span className={`text-xs font-bold ${slugReady ? "text-[#0F4D3A]" : "text-[#9a4a17]"}`}>{slugStatusCopy}</span>
                      ) : null}
                    </label>
                    <div className="grid gap-2">
                      <p className="text-sm font-black">Loại hình</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {businessPresets.map((preset) => {
                          const Icon = preset.icon;
                          const active = businessPresetId === preset.id;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => setBusinessPresetId(preset.id)}
                              aria-pressed={active}
                              className={`flex h-14 items-center justify-center gap-2 rounded-md border px-2 text-sm font-black transition premium-glow-border ${
                                active ? "border-[#0F4D3A] bg-[#0F4D3A] text-white is-active" : "border-[#d8dee9] bg-white text-[#475467] hover:border-[#0F4D3A]/35"
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>
                      {selectedPreset.value === "OTHER" ? (
                        <label className="grid gap-2 text-sm font-black">
                          Danh mục riêng
                          <input
                            value={customBusinessType}
                            onChange={(event) => setCustomBusinessType(event.target.value)}
                            className={fieldClass}
                            placeholder="Ví dụ: bakery, pub, homestay cafe..."
                          />
                        </label>
                      ) : null}
                    </div>
                    <div className="grid gap-3">
                      <div className="grid gap-2">
                        <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                          <p className="text-sm font-black">Địa chỉ quán</p>
                          <span className="text-[11px] font-bold text-[#667085]">Tỉnh/xã là tuỳ chọn.</span>
                        </div>
                        <label className="grid gap-1.5 text-xs font-black uppercase tracking-[0.08em] text-[#667085]">
                          Nhập nhanh địa chỉ hoặc mốc gần quán
                          <span className="relative">
                            <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
                            <input
                              value={streetAddress}
                              onChange={(event) => {
                                setStreetAddress(event.target.value);
                                clearSelectedAddress();
                              }}
                              className={iconFieldClass}
                              placeholder="12 Nguyễn Huệ, Quận 1 hoặc tên tòa nhà"
                            />
                          </span>
                        </label>
                        <details className={`rounded-md border ${sectionLine} bg-white p-3`}>
                          <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.08em] text-[#0F4D3A] marker:text-[#F28C28]">
                            Chọn tỉnh/xã thủ công nếu cần
                          </summary>
                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <label className="grid gap-1.5 text-xs font-black uppercase tracking-[0.08em] text-[#667085]">
                              Tỉnh/TP
                              <select value={provinceCode} onChange={(event) => chooseProvince(event.target.value)} className={fieldClass}>
                                <option value="">{adminLoading ? "Đang tải..." : "Chọn tỉnh/thành"}</option>
                                {provinces.map((item) => (
                                  <option key={item.code} value={item.code}>
                                    {item.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="grid gap-1.5 text-xs font-black uppercase tracking-[0.08em] text-[#667085]">
                              Xã/Phường
                              <select value={wardCode} onChange={(event) => chooseWard(event.target.value)} className={fieldClass} disabled={!provinceCode || adminLoading}>
                                <option value="">{provinceCode ? "Chọn xã/phường" : "Chọn tỉnh trước"}</option>
                                {wards.map((item) => (
                                  <option key={item.code} value={item.code}>
                                    {item.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="grid gap-1.5 text-xs font-black uppercase tracking-[0.08em] text-[#667085]">
                              Huyện cũ / thôn ấp
                              <input
                                value={district}
                                onChange={(event) => {
                                  setDistrict(event.target.value);
                                  clearSelectedAddress();
                                }}
                                className={fieldClass}
                                placeholder="Tuỳ chọn để dễ tìm"
                              />
                            </label>
                          </div>
                        </details>
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                          <p className="min-w-0 truncate text-xs font-bold text-[#667085]">{finalAddress || "Chưa đủ thông tin"}</p>
                          <button
                            type="button"
                            onClick={() => void handleUseCurrentPosition()}
                            disabled={locationPending}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#0F4D3A]/20 bg-[#eef7f2] px-3 text-xs font-black text-[#0F4D3A] disabled:opacity-60"
                          >
                            {locationPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
                            GPS
                          </button>
                          <button
                            type="button"
                            onClick={() => void searchAddressSuggestions()}
                            disabled={addressSearching || finalAddress.trim().length < 6}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#0F4D3A]/20 bg-[#eef7f2] px-3 text-xs font-black text-[#0F4D3A] disabled:opacity-60"
                          >
                            {addressSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                            Kiểm tra
                          </button>
                          {locationError ? <p className="text-xs font-bold text-[#9a4a17] sm:col-span-3">{locationError}</p> : null}
                          {addressResults.length > 0 ? (
                            <div className={`divide-y ${sectionLine} border-y ${sectionLine} sm:col-span-3`}>
                              {addressResults.map((result) => (
                                <button
                                  key={result.id}
                                  type="button"
                                  onClick={() => chooseAddressSuggestion(result)}
                                  className="grid w-full gap-1 py-2 text-left transition hover:text-[#0F4D3A]"
                                >
                                  <span className="text-sm font-black">{result.shortLabel || result.address}</span>
                                  <span className="text-xs font-semibold text-[#667085]">{result.address}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                          {addressError ? <p className="text-xs font-bold text-[#9a4a17] sm:col-span-3">{addressError}</p> : null}
                          {hasPinnedLocation ? <p className="text-xs font-black text-[#0F4D3A] sm:col-span-3">{locationQualityLabel(locationAccuracy)}</p> : null}
                        </div>
                      </div>
                      <label className="grid gap-2 text-sm font-black">
                        Hotline
                        <input value={hotline} onChange={(event) => setHotline(event.target.value)} className={fieldClass} placeholder="0901234567" />
                      </label>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

              {step === 1 && (
                <motion.div
                  key="step-1"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  transition={{ duration: 0.22 }}
                  className="flex flex-col h-full min-h-0"
                >
                  <StepHeader
                    meta={stepDetails[1]}
                    right={
                      <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#F28C28]/22 bg-[#fff7ed] px-3 text-xs font-black text-[#9a4a17]">
                        <Sparkles className="h-4 w-4" />
                        {selectedPlanNarrative?.badge ?? "So sánh gói"}
                      </span>
                    }
                  />
                  <div className="dashboard-onboarding-scroll grid min-h-0 flex-1 gap-4 overflow-y-auto p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <StepSupportPanel step={1} preview={storePreview}>
                      <SupportLine label="Đang chọn" value={selectedPlan?.name ?? "Chưa chọn"} active={Boolean(selectedPlan)} />
                      <SupportLine label="Dùng thử" value={selectedPlan ? `${selectedPlan.trial_days} ngày` : "-"} active={Boolean(selectedPlan)} />
                      <SupportLine label="Chi phí" value={selectedPlan ? formatVnd(selectedPlan.monthly_price) : "-"} active={Boolean(selectedPlan)} />
                      <SupportLine label="Bàn khởi tạo" value={`${tableCount} bàn`} active />
                    </StepSupportPanel>
                  <div className="dashboard-plan-stage grid min-w-0 content-start gap-3 lg:grid-cols-2">
                    <div className="dashboard-plan-decision-panel rounded-lg border border-[#0F4D3A]/14 bg-[#f7fbf7] p-4 lg:col-span-2">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#0F4D3A]">Quyết định nhanh</p>
                          <h3 className="mt-1 text-lg font-black text-[#111827]">Chọn theo cách quán vận hành, không chỉ theo giá</h3>
                          <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-[#667085]">
                            {selectedPlanNarrative?.fit ?? "Mở popup tính năng để xem toàn bộ quyền lợi trước khi tiếp tục."}
                          </p>
                        </div>
                        <div className="grid shrink-0 grid-cols-2 gap-2 text-xs sm:min-w-[220px]">
                          <span className="rounded-md border border-white bg-white px-3 py-2 font-black text-[#0F4D3A]">{plans.length || 0} gói</span>
                          <span className="rounded-md border border-white bg-white px-3 py-2 font-black text-[#9a4a17]">Trial {selectedPlan?.trial_days ?? 0} ngày</span>
                        </div>
                      </div>
                    </div>
                    {plans.map((plan) => {
                      const active = planCode === plan.code;
                      const isPremium = plan.code.toLowerCase() === "premium";
                      const narrative = planNarrative(plan);
                      const planTableLimit = getOnboardingTableLimit(plan.code);
                      return (
                        <article
                          key={plan.code}
                          aria-current={active ? "true" : undefined}
                          className={`dashboard-plan-card rounded-lg border bg-white p-4 text-left transition premium-glow-border ${active ? "is-active" : ""} ${isPremium ? "is-premium" : ""} ${
                            active ? "border-[#0F4D3A] shadow-[0_18px_42px_rgba(15,77,58,0.10)]" : "border-[#d8dee9] hover:border-[#0F4D3A]/35"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#0F4D3A]">{plan.code}</p>
                              <h3 className="mt-1 text-xl font-black">{plan.name}</h3>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${isPremium ? "bg-[#F28C28]/12 text-[#9a4a17]" : "bg-[#eef7f2] text-[#0F4D3A]"}`}>
                              {narrative.badge}
                            </span>
                          </div>
                          <p className="mt-3 text-3xl font-black">
                            {formatVnd(plan.monthly_price)}
                            <span className="text-sm font-bold text-[#667085]"> /tháng</span>
                          </p>
                          <p className="mt-2 text-xs font-black text-[#0F4D3A]">Dùng thử {plan.trial_days} ngày · {planFeatureCount(plan)} tính năng</p>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-black text-[#111827]">
                            <span className="rounded-md border border-[#d8dee9]/60 bg-white px-3 py-2">Tối đa {planTableLimit} bàn</span>
                            <span className="rounded-md border border-[#d8dee9]/60 bg-white px-3 py-2">{isPremium ? "50 nhân viên" : "10 nhân viên"}</span>
                          </div>
                          <p className="mt-3 rounded-md border border-[#d8dee9]/60 bg-[#fbfcfb] px-3 py-2 text-xs font-black leading-relaxed text-[#556379] uppercase tracking-[0.04em]">
                            Khách hàng nhận được: {narrative.promise}
                          </p>
                          <div className="mt-4 grid gap-2.5">
                            {(planVisualFeatures[plan.code.toLowerCase()] ?? []).map((feat, idx) => {
                              const FeatIcon = feat.icon;
                              return (
                                <div
                                  key={idx}
                                  className={`flex items-start gap-3 rounded-lg border p-3 transition-all duration-200 ${
                                    feat.isAi
                                      ? "border-[#F28C28]/25 bg-[#fff7ed]/40 hover:bg-[#fff7ed]/70 shadow-[0_4px_12px_rgba(242,140,40,0.04)]"
                                      : "border-[#d8dee9]/50 bg-white hover:bg-[#f6faf7]/40"
                                  }`}
                                >
                                  <span className={`grid h-8.5 w-8.5 shrink-0 place-items-center rounded-lg ${
                                    feat.isAi
                                      ? "bg-gradient-to-tr from-[#F28C28] to-[#ea580c] text-white shadow-sm"
                                      : "bg-[#eef7f2] text-[#0F4D3A]"
                                  }`}>
                                    <FeatIcon className="h-4.5 w-4.5" />
                                  </span>
                                  <div className="min-w-0">
                                    <h4 className="flex flex-wrap items-center gap-1.5 text-sm font-black text-[#111827]">
                                      {feat.title}
                                      {feat.isAi && (
                                        <span className="inline-block rounded bg-[#F28C28]/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#9a4a17] animate-pulse">
                                          Trợ lý AI
                                        </span>
                                      )}
                                    </h4>
                                    <p className="mt-0.5 text-[11px] font-semibold leading-normal text-[#667085]">
                                      {feat.subtext}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            onClick={() => setFeaturePlan(plan)}
                            className="dashboard-plan-feature-button mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#0F4D3A]/18 bg-[#eef7f2] px-3 text-sm font-black text-[#0F4D3A] transition hover:border-[#0F4D3A]/35 hover:bg-[#e5f3ec]"
                          >
                            <Info className="h-4 w-4" />
                            Xem tất cả tính năng
                          </button>
                          <button
                            type="button"
                            onClick={() => selectPlan(plan)}
                            aria-pressed={active}
                            className={`dashboard-plan-select-button mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-md text-sm font-black ${active ? "bg-[#0F4D3A] text-white" : "bg-white text-[#0F4D3A] ring-1 ring-[#0F4D3A]/20 hover:bg-[#eef7f2]"}`}
                          >
                            Chọn {plan.name}
                            {active ? <CheckCircle2 className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                          </button>
                        </article>
                      );
                    })}
                    {plans.length > 0 ? (
                      <section className="dashboard-plan-compare rounded-lg border border-[#d8dee9] bg-white p-4 lg:col-span-2">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-black text-[#111827]">Bảng nhìn nhanh</p>
                            <p className="mt-1 text-xs font-semibold text-[#667085]">Mở popup để xem toàn bộ tính năng chi tiết của từng gói.</p>
                          </div>
                          <span className="inline-flex min-h-8 items-center gap-2 rounded-full bg-[#eef7f2] px-3 text-xs font-black text-[#0F4D3A]">
                            <ShieldCheck className="h-4 w-4" />
                            Có thể đổi gói sau
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {plans.map((plan) => {
                            const narrative = planNarrative(plan);
                            return (
                              <button
                                key={`compare-${plan.code}`}
                                type="button"
                                onClick={() => setFeaturePlan(plan)}
                                className="grid gap-1 rounded-md border border-[#d8dee9] bg-[#fbfcfb] p-3 text-left transition hover:border-[#0F4D3A]/35 hover:bg-[#f6faf7]"
                              >
                                <span className="flex items-center justify-between gap-3 text-sm font-black text-[#111827]">
                                  {plan.name}
                                  <span className="text-[#0F4D3A]">{formatVnd(plan.monthly_price)}</span>
                                </span>
                                <span className="text-xs font-semibold leading-5 text-[#667085]">{narrative.fit}</span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ) : null}
                    {plans.length === 0 ? (
                      <p className="rounded-md border border-[#F28C28]/30 bg-[#fff7ed] p-4 text-sm font-semibold text-[#9a4a17]">
                        Chưa đọc được cấu hình gói dịch vụ. Vui lòng tải lại trang trước khi tiếp tục.
                      </p>
                    ) : null}
                  </div>
                </div>
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
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step-2"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  transition={{ duration: 0.22 }}
                  className="flex flex-col h-full min-h-0"
                >
                  <StepHeader
                    meta={stepDetails[2]}
                    right={
                      <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#0F4D3A]/16 bg-[#eef7f2] px-3 text-xs font-black text-[#0F4D3A]">
                        <BadgeCheck className="h-4 w-4" />
                        {setupProgress}% sẵn sàng
                      </span>
                    }
                  />
                  <div className="dashboard-onboarding-scroll grid min-h-0 flex-1 gap-4 overflow-y-auto p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <StepSupportPanel step={2} preview={storePreview}>
                      <div className="col-span-2 rounded-md border border-white/70 bg-white px-3 py-2.5 lg:col-span-1">
                        <div className="flex items-center justify-between text-xs font-black">
                          <span className="text-[#667085]">Tiến độ</span>
                          <span className="text-[#0F4D3A]">{setupProgress}%</span>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-[#eef7f2]">
                          <div className="h-full rounded-full bg-[#0F4D3A] transition-[width]" style={{ width: `${setupProgress}%` }} />
                        </div>
                      </div>
                      <SupportLine label="Sẵn sàng" value={`${setupDoneCount}/${setupTasks.length}`} active={setupDoneCount === setupTasks.length} />
                      <SupportLine label="Mở quán" value={canSubmitOnboarding ? "Có thể tạo" : "Cần menu"} active={canSubmitOnboarding} />
                    </StepSupportPanel>
                  <div className="grid min-w-0 content-start gap-4">
                    <div className={`rounded-lg border ${sectionLine} bg-white p-4`}>
                      <div className="flex items-center justify-between text-sm font-black">
                        <span>Tiến độ hoàn tất</span>
                        <span className="text-[#0F4D3A]">{setupProgress}%</span>
                      </div>
                      <div className="mt-3 h-1.5 rounded-full bg-[#eef7f2]">
                        <div className="h-full rounded-full bg-[#0F4D3A] transition-[width]" style={{ width: `${setupProgress}%` }} />
                      </div>
                      <p className="mt-3 text-sm font-bold text-[#667085]">{setupDoneCount}/{setupTasks.length} mục sẵn sàng</p>
                    </div>
                    <div className={`divide-y ${sectionLine} border-y ${sectionLine}`}>
                      {setupTasks.map((item) => (
                        <div key={item.id} className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-3 text-sm font-black">
                          <span className="flex items-center gap-3">
                            {item.done ? <CheckCircle2 className="h-5 w-5 text-[#0F4D3A]" /> : <span className="h-5 w-5 rounded-full border border-[#98a2b3]" />}
                            <span>{item.label}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => advanceTo(item.targetStep)}
                            className={`min-h-11 rounded-md px-3 ${item.done ? "text-[#0F4D3A]" : "text-[#98a2b3] hover:text-[#0F4D3A]"}`}
                          >
                            {item.done ? "Đã áp dụng" : "Mở"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

              {step === 3 && (
                <motion.div
                  key="step-3"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  transition={{ duration: 0.22 }}
                  className="flex flex-col h-full min-h-0"
                >
                  <StepHeader
                    meta={stepDetails[3]}
                    right={
                      <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#0F4D3A]/16 bg-[#eef7f2] px-3 text-xs font-black text-[#0F4D3A]">
                        <Table2 className="h-4 w-4" />
                        {tableCount} bàn
                      </span>
                    }
                  />
                  <div className="dashboard-onboarding-scroll grid min-h-0 flex-1 gap-4 overflow-y-auto p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => setTableCount((value) => Math.max(1, value - 1))} className={`h-11 min-w-11 rounded-md border ${sectionLine} bg-white px-4 font-black`}>-</button>
                        <span className="rounded-md bg-[#0F4D3A] px-4 py-2.5 text-sm font-black text-white">Tổng bàn: {tableCount}</span>
                        <button type="button" onClick={() => setTableCount((value) => Math.min(selectedPlanTableLimit, value + 1))} className={`h-11 min-w-11 rounded-md border ${sectionLine} bg-white px-4 font-black`}>+</button>
                        <span className={`rounded-md border ${sectionLine} bg-white px-4 py-2.5 text-sm font-bold text-[#667085]`}>
                          {selectedPlan?.name ?? planCode}
                        </span>
                        <span className={`rounded-md border ${sectionLine} bg-white px-4 py-2.5 text-sm font-bold text-[#667085]`}>
                          Tối đa {selectedPlanTableLimit} bàn
                        </span>
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                        {Array.from({ length: Math.min(tableCount, 12) }).map((_, index) => (
                          <div key={index} className={`rounded-md border p-3 ${index === 2 ? "border-[#F28C28]/35 bg-[#fff7ed]" : "border-[#d8dee9] bg-white"}`}>
                            <Table2 className={`h-4 w-4 ${index === 2 ? "text-[#9a4a17]" : "text-[#0F4D3A]"}`} />
                            <p className="mt-3 text-sm font-black">{formatTableName(index)}</p>
                            <p className="mt-1 text-xs font-semibold text-[#667085]">{index === 2 ? "Đang phục vụ" : "Trống"}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <StepSupportPanel step={3} preview={storePreview}>
                    <SupportLine label="Tổng bàn" value={`${tableCount}`} active />
                    <SupportLine label="QR mẫu" value="Sẵn sàng" active />
                    <div className="col-span-2 flex items-center gap-3 rounded-md border border-white/70 bg-white px-3 py-2.5 lg:col-span-1">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-[#d8dee9] bg-white">
                        <QrCode className="h-8 w-8 text-[#111827]" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black text-[#111827]">{name || "LogiVN"} QR</p>
                        <p className="mt-0.5 text-xs font-bold text-[#667085]">In sau khi tạo quán</p>
                      </div>
                    </div>
                  </StepSupportPanel>
                </div>
              </motion.div>
            )}

              {step === 4 && (
                <motion.div
                  key="step-4"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  transition={{ duration: 0.22 }}
                  className="flex flex-col h-full min-h-0"
                >
                  <StepHeader
                    meta={stepDetails[4]}
                    right={
                      <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#F28C28]/22 bg-[#fff7ed] px-3 text-xs font-black text-[#9a4a17]">
                        <Wand2 className="h-4 w-4" />
                        AI menu tuỳ chọn
                      </span>
                    }
                  />
                  <div className="dashboard-onboarding-scroll grid min-h-0 flex-1 gap-4 overflow-y-auto p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <StepSupportPanel step={4} preview={storePreview}>
                      <SupportLine label="Món đầu" value={shortText(itemName)} active={Boolean(itemName.trim())} />
                      <SupportLine label="Menu quét" value={confirmedMenuItems.length > 0 ? `${confirmedMenuItems.length} món` : "Tuỳ chọn"} active={confirmedMenuItems.length > 0} />
                      <SupportLine label="Trạng thái" value={canSubmitOnboarding ? "Có thể tạo" : "Cần món"} active={canSubmitOnboarding} />
                      <div className="col-span-2 hidden items-center gap-3 rounded-md border border-white/70 bg-white px-3 py-2.5 sm:flex lg:col-span-1">
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-[#d8dee9] bg-white">
                          <Image
                            src="/onboarding/flow/launch-dashboard.png"
                            alt="Minh hoạ dashboard sẵn sàng vận hành"
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black text-[#111827]">Dashboard</p>
                          <p className="mt-0.5 text-xs font-bold text-[#667085]">Mở sau khi hoàn tất</p>
                        </div>
                      </div>
                    </StepSupportPanel>
                    <div className="grid min-w-0 content-start gap-4">
                    <div className={`grid gap-4 rounded-lg border ${sectionLine} bg-white p-4`}>
                    <label className="grid gap-2 text-sm font-black">
                      Tên món
                      <input value={itemName} onChange={(event) => setItemName(event.target.value)} className={fieldClass} placeholder="Cà phê sữa đá" />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-2 text-sm font-black">
                        Giá
                        <input value={itemPrice} onChange={(event) => setItemPrice(event.target.value.replace(/\D/g, ""))} className={fieldClass} placeholder="28000" />
                      </label>
                      <label className="grid gap-2 text-sm font-black">
                        Danh mục
                        <input value={itemCategory} onChange={(event) => setItemCategory(event.target.value)} className={fieldClass} placeholder="Cà phê, món chính, đặc sản..." />
                      </label>
                    </div>
                    <details className={`rounded-lg border ${sectionLine} bg-white p-4`}>
                      <summary className="cursor-pointer text-sm font-black text-[#0F4D3A] marker:text-[#F28C28]">
                        Nhập menu từ ảnh hoặc dán menu
                      </summary>
                      <div className="mt-2 flex items-start justify-end gap-3">
                        {menuOcrQuota ? (
                          <span className="shrink-0 rounded-full border border-[#0F4D3A]/10 bg-[#eef7f2] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#0F4D3A]">
                            {menuOcrQuota.remaining}/{menuOcrQuota.limit}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 grid gap-3">
                        <label className="grid gap-2 text-xs font-black uppercase tracking-[0.08em] text-[#667085]">
                          Ảnh menu giấy
                          <div className="relative">
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className={fieldClass}
                              onChange={(event) => {
                                const file = event.target.files?.[0] ?? null;
                                if (file && file.size > 5 * 1024 * 1024) {
                                  setMenuOcrError("Ảnh menu tối đa 5MB. Vui lòng chụp/nén lại ảnh rõ hơn.");
                                  setMenuOcrImage(null);
                                  return;
                                }
                                setMenuOcrError("");
                                setMenuOcrImage(file);
                              }}
                            />
                            {menuOcrLoading && (
                              <div className="absolute inset-0 bg-[#0F4D3A]/5 border border-[#0f4d3a]/25 rounded-md overflow-hidden z-20 pointer-events-none">
                                <div className="animate-laser-scan" />
                              </div>
                            )}
                          </div>
                        </label>
                        <label className="grid gap-2 text-xs font-black uppercase tracking-[0.08em] text-[#667085]">
                          Hoặc dán menu thô
                          <div className="relative">
                            <textarea
                              value={menuOcrText}
                              onChange={(event) => setMenuOcrText(event.target.value)}
                              className="w-full min-h-24 rounded-md border border-[#d8dee9] bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal text-[#111827] outline-none focus:border-[#0F4D3A]/70 focus:ring-2 focus:ring-[#0F4D3A]/10"
                              placeholder={"CÀ PHÊ\nCà phê sữa đá 28000\nBạc xỉu 35000"}
                            />
                            {menuOcrLoading && (
                              <div className="absolute inset-0 bg-[#0F4D3A]/5 border border-[#0f4d3a]/25 rounded-md overflow-hidden z-20 pointer-events-none">
                                <div className="animate-laser-scan" />
                              </div>
                            )}
                          </div>
                        </label>
                        <button
                          type="button"
                          onClick={() => void runMenuOcr()}
                          disabled={menuOcrLoading || (!menuOcrText.trim() && !menuOcrImage)}
                          className="flex h-11 items-center justify-center gap-2 rounded-md border border-[#0F4D3A]/20 bg-[#eef7f2] text-sm font-black text-[#0F4D3A] disabled:opacity-50"
                        >
                          {menuOcrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {menuOcrLoading ? "Đang đọc menu..." : "Quét menu"}
                        </button>
                        {menuOcrError ? <p className="text-xs font-bold text-[#9a4a17]">{menuOcrError}</p> : null}
                      </div>

                      {ocrDraftItems.length > 0 ? (
                        <div className={`mt-4 divide-y ${sectionLine} border-y ${sectionLine}`}>
                          <div className="flex items-center justify-between gap-3 py-2">
                            <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0F4D3A]">
                              Đã đọc được {ocrDraftItems.length} món
                            </p>
                            <span className="text-xs font-bold text-[#667085]">{Math.round((menuOcrDraft?.confidence ?? 0) * 100)}% tin cậy</span>
                          </div>
                          {ocrDraftItems.slice(0, 8).map((item) => (
                            <div key={`${item.categoryName}-${item.name}`} className="grid grid-cols-[minmax(0,1fr)_90px] gap-3 py-2 text-sm">
                              <div className="min-w-0">
                                <p className="truncate font-black text-[#111827]">{item.name}</p>
                                <p className="text-xs font-semibold text-[#667085]">{item.categoryName}</p>
                              </div>
                              <p className="text-right font-black text-[#0F4D3A]">{formatVnd(item.price)}</p>
                            </div>
                          ))}
                          {ocrDraftItems.length > 8 ? <p className="py-2 text-xs font-semibold text-[#667085]">Còn {ocrDraftItems.length - 8} món khác sẽ được lưu cùng.</p> : null}
                          <button
                            type="button"
                            onClick={() => setConfirmedMenuItems(ocrDraftItems)}
                            className="my-3 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#0F4D3A] text-sm font-black text-white"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Xác nhận thêm {ocrDraftItems.length} món
                          </button>
                        </div>
                      ) : null}
                      {confirmedMenuItems.length > 0 ? (
                        <p className="mt-3 rounded-md border border-[#0F4D3A]/16 bg-[#eef7f2] px-3 py-2 text-xs font-black text-[#0F4D3A]">
                          Đã xác nhận {confirmedMenuItems.length} món. Khi hoàn tất, LogiVN sẽ tạo danh mục và món thật trong menu quán.
                        </p>
                      ) : null}
                    </details>
                    </div>
                    {state?.error ? <p className="rounded-md border border-[#F28C28]/30 bg-[#fff7ed] p-3 text-sm font-semibold text-[#9a4a17]">{state.error}</p> : null}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
            <footer className={`dashboard-onboarding-action-bar shrink-0 border-t ${sectionLine} bg-white p-3`}>
              <div className="dashboard-onboarding-action-layout flex items-center justify-between gap-3">
                <div className="dashboard-onboarding-action-summary min-w-0">
                  <p className="truncate text-xs font-black uppercase tracking-[0.12em] text-[#0F4D3A]">{currentStepMeta.title}</p>
                  <p className="mt-0.5 text-sm font-semibold leading-5 text-[#667085]">{actionHint}</p>
                </div>
                <div className="dashboard-onboarding-action-buttons flex min-w-0 shrink-0 items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setStep((current) => Math.max(0, current - 1))}
                    disabled={step === 0 || launching}
                    className={`inline-flex min-h-11 items-center justify-center rounded-md border ${sectionLine} bg-white px-4 text-sm font-black text-[#475467] transition disabled:pointer-events-none disabled:opacity-40`}
                  >
                    Quay lại
                  </button>
                  {step < 4 ? (
                    <OnboardingButton onClick={() => advanceTo(step + 1)} disabled={nextStepDisabled || launching} className="min-w-0 flex-1 sm:flex-none">
                      {nextStepLabel}
                    </OnboardingButton>
                  ) : (
                    <OnboardingButton type="submit" disabled={launching || !canSubmitOnboarding} className="min-w-0 flex-1 sm:flex-none">
                      {launching ? "Đang tạo..." : nextStepLabel}
                    </OnboardingButton>
                  )}
                </div>
              </div>
            </footer>
          </div>
        </section>
        {launching ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-[#0B2F24]/88 px-4 text-white backdrop-blur-sm">
            <section className="w-full max-w-[420px] rounded-lg border border-white/15 bg-white/10 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)]">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-md bg-white text-[#0F4D3A]">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/70">Launch</p>
                  <h2 className="truncate text-xl font-black">{launchMessages[launchMessageIndex]}</h2>
                </div>
              </div>
              <div className="mt-5 grid gap-2">
                {launchMessages.map((message, index) => (
                  <div key={message} className="flex items-center gap-2 text-sm font-bold text-white/80">
                    <span className={`h-2 w-2 rounded-full ${index <= launchMessageIndex ? "bg-[#F28C28]" : "bg-white/25"}`} />
                    <span>{message}</span>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm font-semibold leading-6 text-white/72">
                LogiVN đang tạo dữ liệu thật cho quán. Giữ màn hình này mở trong vài giây.
              </p>
            </section>
          </div>
        ) : null}
      </form>
    </main>
  );
}

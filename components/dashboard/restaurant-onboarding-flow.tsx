"use client";

import Image from "next/image";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  Coffee,
  RotateCcw,
  Loader2,
  LocateFixed,
  MapPin,
  PlusCircle,
  QrCode,
  Search,
  Store,
  Table2,
  Utensils
} from "lucide-react";
import { onboardingAction } from "@/app/dashboard/actions";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { buildOnboardingRunway, formatDraftSavedLabel } from "@/lib/onboarding-runway";
import { createMapSessionToken, fetchAddressPredictions, resolveAddressPrediction } from "@/services/maps/client-address-service";
import type { AddressAutocompletePrediction } from "@/services/maps/types";

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
    title: "Thông tin đủ để mở dashboard"
  },
  {
    src: "/onboarding/flow/plan-selection.png",
    alt: "Minh hoạ chọn gói vận hành LogiVN",
    eyebrow: "Gói vận hành",
    title: "Chọn gói phù hợp quy mô hiện tại"
  },
  {
    src: "/onboarding/flow/setup-checklist.png",
    alt: "Minh hoạ kiểm tra tiến độ thiết lập quán",
    eyebrow: "Kiểm tra",
    title: "Rà lại các phần cần sẵn sàng"
  },
  {
    src: "/onboarding/flow/table-qr.png",
    alt: "Minh hoạ tạo bàn và mã QR gọi món",
    eyebrow: "Bàn & QR",
    title: "Sinh QR cho khu vực phục vụ"
  },
  {
    src: "/onboarding/flow/menu-import.png",
    alt: "Minh hoạ nhập menu đầu tiên",
    eyebrow: "Menu",
    title: "Tạo menu đầu tiên để bán ngay"
  }
];
const fieldClass =
  "h-11 w-full rounded-md border border-[#d8dee9] bg-[#f8fafc] px-3 text-sm font-semibold text-[#111827] outline-none transition placeholder:text-[#98a2b3] focus:border-[#0F4D3A]/70 focus:bg-white focus:ring-2 focus:ring-[#0F4D3A]/10";
const iconFieldClass = `${fieldClass} pl-10`;
const sectionLine = "border-[#d8dee9]";

function formatVnd(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(value)}đ`;
}

function createSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
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

function StepHeader({ eyebrow, title, description = "" }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className={`shrink-0 border-b ${sectionLine} bg-white px-4 py-3 sm:px-5`}>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0F4D3A]">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[#111827] sm:text-2xl">{title}</h2>
      {description ? <p className="mt-1 max-w-2xl text-sm leading-5 text-[#667085]">{description}</p> : null}
    </div>
  );
}

function SupportLine({ label, value, active = false }: { label: string; value: string; active?: boolean }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-2 rounded-md border border-white/70 bg-white px-2.5 py-2 text-[11px] lg:min-h-10 lg:px-3 lg:text-xs">
      <span className="font-bold text-[#667085]">{label}</span>
      <span className={`min-w-0 truncate text-right font-black ${active ? "text-[#0F4D3A]" : "text-[#111827]"}`}>{value}</span>
    </div>
  );
}

function StepSupportPanel({ step, children }: { step: number; children: ReactNode }) {
  const visual = onboardingVisuals[step] ?? onboardingVisuals[0];

  return (
    <aside className={`dashboard-onboarding-support order-first min-h-0 rounded-lg border ${sectionLine} bg-[#f5faf7] p-3 lg:order-last lg:self-start`}>
      <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 sm:grid-cols-[124px_minmax(0,1fr)] lg:block">
        <div className="relative aspect-square overflow-hidden rounded-md border border-[#d8dee9] bg-white">
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
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#0F4D3A] px-5 text-sm font-black text-white transition hover:bg-[#0b3d2e] disabled:pointer-events-none disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
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
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-black transition ${
              active
                ? "border-[#0F4D3A] bg-[#0F4D3A] text-white"
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
  const [furthestStep, setFurthestStep] = useState(0);
  const [name, setName] = useState("");
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
  const [submitStarted, setSubmitStarted] = useState(false);
  const [launchMessageIndex, setLaunchMessageIndex] = useState(0);
  const selectedPreset = businessPresets.find((item) => item.id === businessPresetId) ?? businessPresets[0];
  const selectedPlan = plans.find((plan) => plan.code === planCode) ?? plans[0] ?? null;
  const slug = createSlug(name) || "quan-moi";
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
  const canContinueInfo = name.trim().length >= 2 && hasBusinessType && hasStructuredAddress && /^[0-9+() .-]{6,24}$/.test(hotline.trim());
  const dashboardPlanCode = selectedPlan?.code ?? planCode;
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

  useEffect(() => {
    const draft = readOnboardingDraft(draftKey);

    queueMicrotask(() => {
      if (draft) {
        setName(draft.name ?? "");
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
        setPlanCode(nextPlanCode);
        setTableCount(Number.isInteger(draft.tableCount) ? Number(draft.tableCount) : (nextPlanCode === "premium" ? 24 : 10));
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

  return (
    <main className="dashboard-onboarding-shell min-h-svh overflow-x-hidden bg-[#f7f8fa] text-[#111827]">
      <form
        action={action}
        encType="multipart/form-data"
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

        <header className={`dashboard-onboarding-header shrink-0 rounded-lg border ${sectionLine} bg-white p-3`}>
          <div className="grid gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-md border border-[#d8dee9] bg-white px-2 py-1">
                  <LogiVNLogo href="/" className="h-8" priority />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#0F4D3A]">Thiết lập</p>
                  <h1 className="truncate text-base font-black tracking-[-0.02em]">Tạo quán mới</h1>
                </div>
                <span className="ml-auto shrink-0 rounded-full bg-[#eef7f2] px-3 py-1.5 text-xs font-black text-[#0F4D3A]">
                  {launching ? "Đang tạo" : `${step + 1}/${steps.length}`}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#d8dee9] bg-[#f8fafc] px-3 py-1 text-xs font-black text-[#667085]">
                  {draftStatusLabel}
                </span>
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
              <div className="mt-3 flex items-center gap-3">
                <div className="h-1.5 flex-1 rounded-full bg-[#eef7f2]">
                  <div className="h-full rounded-full bg-[#0F4D3A] transition-[width]" style={{ width: `${progress}%` }} />
                </div>
                <span className="w-10 text-right text-xs font-black text-[#0F4D3A]">{progress}%</span>
              </div>
            </div>
          </div>
          <div className="mt-3">
            <StepNavigator steps={steps} step={step} furthestStep={furthestStep} onSelect={openStep} />
          </div>
        </header>

        <section className="dashboard-onboarding-main min-h-0 flex-1">
          <div className={`dashboard-onboarding-frame flex h-full min-h-0 flex-col overflow-hidden rounded-lg border ${sectionLine} bg-white`}>
            {step === 0 ? (
              <>
                <StepHeader eyebrow="Bước 1" title="Thông tin quán" />
                <div className="dashboard-onboarding-scroll grid min-h-0 flex-1 gap-4 overflow-y-auto p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <StepSupportPanel step={0}>
                    <SupportLine label="Tên" value={shortText(name)} active={name.trim().length >= 2} />
                    <SupportLine label="Loại hình" value={selectedPreset.label} active />
                    <SupportLine label="Địa chỉ" value={hasStructuredAddress ? "Đã có" : "Cần nhập"} active={hasStructuredAddress} />
                    <SupportLine label="GPS" value={hasPinnedLocation ? "Đã ghim" : "Có thể chỉnh sau"} active={hasPinnedLocation} />
                  </StepSupportPanel>
                  <div className="grid min-w-0 content-start gap-4">
                    <label className="grid gap-2 text-sm font-black">
                      Tên quán
                      <input value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} placeholder="Nhập tên quán" />
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
                              className={`flex h-14 items-center justify-center gap-2 rounded-md border px-2 text-sm font-black transition ${
                                active ? "border-[#0F4D3A] bg-[#0F4D3A] text-white" : "border-[#d8dee9] bg-white text-[#475467] hover:border-[#0F4D3A]/35"
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
              </>
            ) : null}

            {step === 1 ? (
              <>
                <StepHeader eyebrow="Bước 2" title="Chọn gói" />
                <div className="dashboard-onboarding-scroll grid min-h-0 flex-1 gap-4 overflow-y-auto p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <StepSupportPanel step={1}>
                    <SupportLine label="Đang chọn" value={selectedPlan?.name ?? "Chưa chọn"} active={Boolean(selectedPlan)} />
                    <SupportLine label="Dùng thử" value={selectedPlan ? `${selectedPlan.trial_days} ngày` : "-"} active={Boolean(selectedPlan)} />
                    <SupportLine label="Chi phí" value={selectedPlan ? formatVnd(selectedPlan.monthly_price) : "-"} active={Boolean(selectedPlan)} />
                    <SupportLine label="Bàn khởi tạo" value={`${tableCount} bàn`} active />
                  </StepSupportPanel>
                  <div className="grid min-w-0 content-start gap-3 lg:grid-cols-2">
                    {plans.map((plan) => {
                      const active = planCode === plan.code;
                      return (
                        <button
                          key={plan.code}
                          type="button"
                          onClick={() => {
                            setPlanCode(plan.code);
                            if (plan.code === "premium") setTableCount((value) => Math.max(value, 24));
                          }}
                          className={`group rounded-lg border bg-white p-4 text-left transition ${
                            active ? "border-[#0F4D3A]" : "border-[#d8dee9] hover:border-[#0F4D3A]/35"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#0F4D3A]">{plan.code}</p>
                              <h3 className="mt-1 text-xl font-black tracking-[-0.03em]">{plan.name}</h3>
                            </div>
                            {plan.code === "premium" ? <span className="rounded-full bg-[#F28C28]/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#9a4a17]">Nâng cao</span> : null}
                          </div>
                          <p className="mt-3 text-3xl font-black tracking-[-0.04em]">
                            {formatVnd(plan.monthly_price)}
                            <span className="text-sm font-bold text-[#667085]"> /tháng</span>
                          </p>
                          <p className="mt-2 text-xs font-black text-[#0F4D3A]">Dùng thử {plan.trial_days} ngày</p>
                          <span className={`mt-4 flex h-11 items-center justify-center rounded-md text-sm font-black ${active ? "bg-[#0F4D3A] text-white" : "bg-[#eef7f2] text-[#0F4D3A]"}`}>
                            Chọn {plan.name}
                          </span>
                        </button>
                      );
                    })}
                    {plans.length === 0 ? (
                      <p className="rounded-md border border-[#F28C28]/30 bg-[#fff7ed] p-4 text-sm font-semibold text-[#9a4a17]">
                        Chưa đọc được cấu hình gói dịch vụ. Vui lòng tải lại trang trước khi tiếp tục.
                      </p>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <StepHeader eyebrow="Bước 3" title="Kiểm tra" />
                <div className="dashboard-onboarding-scroll grid min-h-0 flex-1 gap-4 overflow-y-auto p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <StepSupportPanel step={2}>
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
              </>
            ) : null}

            {step === 3 ? (
              <>
                <StepHeader eyebrow="Bước 4" title="Bàn & QR" />
                <div className="dashboard-onboarding-scroll grid min-h-0 flex-1 gap-4 overflow-y-auto p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => setTableCount((value) => Math.max(1, value - 1))} className={`h-11 min-w-11 rounded-md border ${sectionLine} bg-white px-4 font-black`}>-</button>
                      <span className="rounded-md bg-[#0F4D3A] px-4 py-2.5 text-sm font-black text-white">Tổng bàn: {tableCount}</span>
                      <button type="button" onClick={() => setTableCount((value) => Math.min(300, value + 1))} className={`h-11 min-w-11 rounded-md border ${sectionLine} bg-white px-4 font-black`}>+</button>
                      <span className={`rounded-md border ${sectionLine} bg-white px-4 py-2.5 text-sm font-bold text-[#667085]`}>
                        {selectedPlan?.name ?? planCode}
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
                  <StepSupportPanel step={3}>
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
              </>
            ) : null}

            {step === 4 ? (
              <>
                <StepHeader eyebrow="Bước 5" title="Menu" />
                <div className="dashboard-onboarding-scroll grid min-h-0 flex-1 gap-4 overflow-y-auto p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <StepSupportPanel step={4}>
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
                        </label>
                        <label className="grid gap-2 text-xs font-black uppercase tracking-[0.08em] text-[#667085]">
                          Hoặc dán menu thô
                          <textarea
                            value={menuOcrText}
                            onChange={(event) => setMenuOcrText(event.target.value)}
                            className="min-h-24 rounded-md border border-[#d8dee9] bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal text-[#111827] outline-none focus:border-[#0F4D3A]/70 focus:ring-2 focus:ring-[#0F4D3A]/10"
                            placeholder={"CÀ PHÊ\nCà phê sữa đá 28000\nBạc xỉu 35000"}
                          />
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
              </>
            ) : null}
            <footer className={`dashboard-onboarding-action-bar shrink-0 border-t ${sectionLine} bg-white p-3`}>
              <div className="flex items-center justify-between gap-2">
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
                  <h2 className="truncate text-xl font-black tracking-[-0.03em]">{launchMessages[launchMessageIndex]}</h2>
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

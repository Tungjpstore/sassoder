"use client";

import Image from "next/image";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CheckCircle2,
  Coffee,
  ImagePlus,
  ListChecks,
  Loader2,
  LocateFixed,
  MapPin,
  PlusCircle,
  Printer,
  QrCode,
  Search,
  Sparkles,
  Store,
  Table2,
  Utensils
} from "lucide-react";
import { onboardingAction } from "@/app/dashboard/actions";
import { StoreLocationPicker } from "@/components/maps/store-location-picker";
import { createMapSessionToken, fetchAddressPredictions, resolveAddressPrediction } from "@/services/maps/client-address-service";
import type { AddressAutocompletePrediction } from "@/services/maps/types";

type BusinessPreset = {
  id: string;
  label: string;
  value: "CAFE" | "RESTAURANT" | "FAST_FOOD" | "BAR" | "OTHER";
  icon: typeof Coffee;
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
  version: 1;
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
};
type BrandBoard = {
  slogans: string[];
  description: string;
  brandVoice: string;
  logoPrompt: string;
  menuHeroPrompt: string;
  warnings: string[];
  constraints?: {
    sloganMaxChars: number;
    descriptionMaxChars: number;
    logoCanvas: string;
    logoRule: string;
  };
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
  { id: "tea", label: "Trà sữa", value: "CAFE", icon: Sparkles },
  { id: "restaurant", label: "Nhà hàng", value: "RESTAURANT", icon: Utensils },
  { id: "food", label: "Quán ăn", value: "FAST_FOOD", icon: Store },
  { id: "custom", label: "Khác", value: "OTHER", icon: PlusCircle }
];

const steps = ["Thông tin quán", "Chọn gói", "Thiết lập", "Bàn & QR", "Menu"];
const fieldClass =
  "h-11 w-full rounded-xl border border-[#123b2b]/12 bg-[#fffdf8] px-3 text-sm font-semibold text-[#12251c] outline-none transition placeholder:text-[#7c877b]/55 focus:border-[#0f4d3a]/70 focus:ring-2 focus:ring-[#0f4d3a]/10";
const iconFieldClass = `${fieldClass} pl-10`;
const sectionLine = "border-[#123b2b]/10";

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

function readOnboardingDraft(draftKey: string) {
  if (typeof window === "undefined") return null;

  try {
    const rawDraft = window.localStorage.getItem(draftKey);
    if (!rawDraft) return null;
    const draft = JSON.parse(rawDraft) as Partial<OnboardingDraft>;
    return draft.version === 1 ? draft : null;
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

function StepHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className={`border-b ${sectionLine} px-5 py-4 sm:px-6`}>
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#0f4d3a]">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-black tracking-[-0.04em] text-[#12251c] sm:text-3xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667266]">{description}</p>
    </div>
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
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0f4d3a] px-5 text-sm font-black text-[#fffaf1] shadow-[0_12px_28px_rgba(15,77,58,0.16)] transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
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
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);
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
  const [logoPreview, setLogoPreview] = useState("");
  const [generatedLogoUrl, setGeneratedLogoUrl] = useState("");
  const [aiLogoDraft, setAiLogoDraft] = useState<{ imageUrl: string | null; prompt: string } | null>(null);
  const [brandBoard, setBrandBoard] = useState<BrandBoard | null>(null);
  const [selectedBrandSlogan, setSelectedBrandSlogan] = useState("");
  const [appliedBrandSlogan, setAppliedBrandSlogan] = useState("");
  const [appliedBrandDescription, setAppliedBrandDescription] = useState("");
  const [brandQuota, setBrandQuota] = useState<AiQuota | null>(null);
  const [brandLoading, setBrandLoading] = useState(false);
  const [brandError, setBrandError] = useState("");
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
  const brandDescription = appliedBrandDescription;
  const brandSlogan = appliedBrandSlogan;

  const setupTasks = useMemo(() => {
    const brandApplied = Boolean(appliedBrandSlogan || appliedBrandDescription || generatedLogoUrl || logoPreview);
    const menuApplied = confirmedMenuItems.length > 0;
    return [
      {
        id: "brand",
        label: "Nhận diện quán",
        done: brandApplied,
        detail: brandApplied ? "Đã có brand/logo sẽ lưu" : brandBoard ? "AI đã tạo, cần bấm áp dụng" : "Tạo hoặc upload logo",
        targetStep: 0
      },
      {
        id: "location",
        label: "Địa chỉ vận hành",
        done: canContinueInfo,
        detail: hasPinnedLocation ? "Đã có GPS/địa chỉ đủ dùng" : "Cần hotline, địa chỉ và pin nếu có giao hàng",
        targetStep: 0
      },
      {
        id: "tables",
        label: "Bàn & QR",
        done: tableCount > 0,
        detail: `${tableCount} bàn sẽ được khởi tạo`,
        targetStep: 3
      },
      {
        id: "menu",
        label: "Menu khởi tạo",
        done: menuApplied || Boolean(itemName.trim()),
        detail: menuApplied ? `${confirmedMenuItems.length} món OCR đã áp dụng` : "Đang dùng 1 món mẫu, có thể OCR menu giấy",
        targetStep: 4
      },
      {
        id: "launch",
        label: "Sẵn sàng vào dashboard",
        done: canContinueInfo && tableCount > 0 && (menuApplied || Boolean(itemName.trim())),
        detail: "LogiVN sẽ tạo dữ liệu thật khi bấm hoàn tất",
        targetStep: 4
      }
    ];
  }, [
    appliedBrandDescription,
    appliedBrandSlogan,
    brandBoard,
    canContinueInfo,
    confirmedMenuItems.length,
    generatedLogoUrl,
    hasPinnedLocation,
    itemName,
    logoPreview,
    tableCount
  ]);
  const setupDoneCount = setupTasks.filter((item) => item.done).length;
  const setupProgress = Math.round((setupDoneCount / setupTasks.length) * 100);

  useEffect(() => {
    return () => {
      if (logoPreview && logoPreview.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

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
    const draft: OnboardingDraft = {
      version: 1,
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
      itemCategory
    };

    try {
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
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

  function advanceTo(nextStep: number) {
    setFurthestStep((current) => Math.max(current, nextStep));
    setStep(nextStep);
  }

  function openStep(nextStep: number) {
    if (nextStep <= furthestStep) {
      setStep(nextStep);
    }
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

  async function generateBrandBoard() {
    if (!name.trim() || brandLoading) return;
    setBrandLoading(true);
    setBrandError("");

    try {
      const response = await fetch("/api/onboarding/ai/branding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planCode: dashboardPlanCode,
          restaurantName: name.trim(),
          businessType: selectedPreset.label,
          customBusinessType: selectedPreset.value === "OTHER" ? customBusinessType.trim() : undefined,
          address: finalAddress || undefined,
          includeLogo: true
        })
      });
      const result = (await response.json().catch(() => null)) as
        | ApiResponse<{
            brand: { data: BrandBoard };
            image: { imageUrl: string | null; prompt: string } | null;
            quota: AiQuota;
          }>
        | null;

      if (!result || !result.ok) throw new Error(result?.error || "AI chưa tạo được bộ nhận diện.");
      setBrandBoard(result.data.brand.data);
      setSelectedBrandSlogan(result.data.brand.data.slogans[0] ?? "");
      setBrandQuota(result.data.quota);
      setAiLogoDraft(result.data.image ?? null);
    } catch (error) {
      setBrandError(error instanceof Error ? error.message : "Không chạy được CopilotAI thương hiệu.");
    } finally {
      setBrandLoading(false);
    }
  }

  function applyBrandBoard(options: { includeLogo?: boolean } = {}) {
    if (!brandBoard) return;
    const nextSlogan = selectedBrandSlogan || brandBoard.slogans[0] || "";
    setAppliedBrandSlogan(nextSlogan);
    setAppliedBrandDescription(brandBoard.description || "");
    if (options.includeLogo && aiLogoDraft?.imageUrl) {
      if (logoPreview && logoPreview.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
      if (logoFileInputRef.current) logoFileInputRef.current.value = "";
      setLogoPreview(aiLogoDraft.imageUrl);
      setGeneratedLogoUrl(aiLogoDraft.imageUrl);
    }
  }

  function applyAiLogoDraft() {
    if (!aiLogoDraft?.imageUrl) return;
    if (logoPreview && logoPreview.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
    if (logoFileInputRef.current) logoFileInputRef.current.value = "";
    setLogoPreview(aiLogoDraft.imageUrl);
    setGeneratedLogoUrl(aiLogoDraft.imageUrl);
  }

  function clearAppliedAiLogo() {
    if (logoPreview && logoPreview.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
    if (logoFileInputRef.current) logoFileInputRef.current.value = "";
    setLogoPreview("");
    setGeneratedLogoUrl("");
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

      if (!result || !result.ok) throw new Error(result?.error || "AI chưa đọc được menu.");
      setMenuOcrDraft(result.data.data);
      setMenuOcrQuota(result.data.quota);
    } catch (error) {
      setMenuOcrDraft(null);
      setMenuOcrError(error instanceof Error ? error.message : "Không chạy được OCR menu.");
    } finally {
      setMenuOcrLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fbf7ef] text-[#12251c]">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(135deg,rgba(15,77,58,0.08),transparent_28%),radial-gradient(circle_at_92%_12%,rgba(242,140,40,0.1),transparent_24%),linear-gradient(180deg,#fffcf6,#f7efe4)]" />
      <form action={action} encType="multipart/form-data" className="relative mx-auto grid min-h-screen w-full max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[250px_minmax(0,1fr)]">
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
        <input type="hidden" name="brandSlogan" value={brandSlogan} />
        <input type="hidden" name="brandDescription" value={brandDescription} />
        <input type="hidden" name="generatedLogoUrl" value={generatedLogoUrl} />

        <aside className={`rounded-[24px] border ${sectionLine} bg-[#fffdf8]/86 p-4 shadow-[0_18px_50px_rgba(15,77,58,0.06)] backdrop-blur lg:sticky lg:top-4 lg:h-[calc(100vh-32px)]`}>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#0f4d3a] text-[#fffaf1]">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#0f4d3a]">LogiVN</p>
              <h1 className="text-base font-black tracking-[-0.03em]">Tạo quán mới</h1>
            </div>
          </div>

          <div className={`mt-4 border-t ${sectionLine} pt-4`}>
            <p className="text-sm leading-6 text-[#667266]">
              {email ? `Tài khoản ${email} đã sẵn sàng.` : "Hoàn tất vài bước để mở dashboard quản trị."}
            </p>
            <div className="mt-4 flex items-center justify-between text-xs font-black text-[#0f4d3a]">
              <span>{progress}% completed</span>
              <span>{step + 1}/{steps.length}</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-[#0f4d3a]/10">
              <div className="h-full rounded-full bg-[#0f4d3a] transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <nav className={`mt-5 divide-y ${sectionLine} border-y ${sectionLine}`}>
            {steps.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => openStep(index)}
                disabled={index > furthestStep}
                className={`flex w-full items-center gap-3 py-3 text-left text-sm font-black transition ${
                  step === index
                    ? "text-[#0f4d3a]"
                    : index <= furthestStep
                      ? "text-[#395046] hover:text-[#0f4d3a]"
                      : "cursor-not-allowed text-[#a49b8d]"
                }`}
              >
                <span className={`grid h-7 w-7 place-items-center rounded-full text-xs ${step === index ? "bg-[#0f4d3a] text-[#fffaf1]" : "bg-[#0f4d3a]/8 text-[#0f4d3a]"}`}>
                  {index < step ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                </span>
                {label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="grid content-center">
          <div className={`overflow-hidden rounded-[26px] border ${sectionLine} bg-[#fffdf8]/95 shadow-[0_20px_60px_rgba(15,77,58,0.07)]`}>
            {step === 0 ? (
              <>
                <StepHeader eyebrow="Bước 1" title="Thông tin quán" description="Nhập thông tin cần thiết nhất để LogiVN tạo hồ sơ, bàn, menu mẫu và quyền quản trị." />
                <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="grid content-start gap-4">
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
                              className={`flex h-14 items-center justify-center gap-2 rounded-xl border px-2 text-sm font-black transition ${
                                active ? "border-[#0f4d3a] bg-[#0f4d3a] text-[#fffaf1]" : "border-[#123b2b]/10 bg-white/55 text-[#395046] hover:border-[#0f4d3a]/35"
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
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-black">Địa chỉ quán</p>
                          <span className="text-[11px] font-bold text-[#68766b]">
                            Nhập nhanh trước, tỉnh/xã chỉ cần khi muốn tăng độ chính xác.
                          </span>
                        </div>
                        <label className="grid gap-1.5 text-xs font-black uppercase tracking-[0.08em] text-[#526359]">
                          Nhập nhanh địa chỉ hoặc mốc gần quán
                          <span className="relative">
                            <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a877b]" />
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
                        <details className={`rounded-xl border ${sectionLine} bg-white/45 p-3`}>
                          <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.08em] text-[#0f4d3a] marker:text-[#f28c28]">
                            Chọn tỉnh/xã thủ công nếu cần
                          </summary>
                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <label className="grid gap-1.5 text-xs font-black uppercase tracking-[0.08em] text-[#526359]">
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
                            <label className="grid gap-1.5 text-xs font-black uppercase tracking-[0.08em] text-[#526359]">
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
                            <label className="grid gap-1.5 text-xs font-black uppercase tracking-[0.08em] text-[#526359]">
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
                        <div className={`rounded-xl border ${sectionLine} bg-white/50 p-3`}>
                          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                            <div className="min-w-0">
                              <p className="text-xs font-black text-[#12251c]">Địa chỉ sẽ lưu</p>
                              <p className="mt-1 text-xs font-bold leading-5 text-[#68766b]">{finalAddress || "Chưa đủ thông tin"}</p>
                              <p className="mt-1 text-xs font-bold text-[#0f4d3a]">
                                {hasPinnedLocation ? `${locationQualityLabel(locationAccuracy)} · ${storeLat}, ${storeLng}` : "Nên ghim GPS tại quán để giao hàng và chỉ đường chính xác hơn."}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleUseCurrentPosition()}
                              disabled={locationPending}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#0f4d3a]/20 bg-[#0f4d3a]/7 px-3 text-xs font-black text-[#0f4d3a] disabled:opacity-60"
                            >
                              {locationPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
                              Ghim GPS
                            </button>
                          </div>
                          {locationError ? <p className="mt-2 text-xs font-bold text-[#a55618]">{locationError}</p> : null}
                          <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 border-t ${sectionLine} pt-3`}>
                            <span className="text-xs font-bold text-[#68766b]">Goong Places kiểm tra gợi ý; pin bản đồ/GPS là tọa độ vận hành cuối cùng.</span>
                            <button
                              type="button"
                              onClick={() => void searchAddressSuggestions()}
                              disabled={addressSearching || finalAddress.trim().length < 6}
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#0f4d3a]/20 bg-[#0f4d3a]/7 px-3 text-xs font-black text-[#0f4d3a] disabled:opacity-60"
                            >
                              {addressSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                              Kiểm tra địa chỉ
                            </button>
                          </div>
                          {addressResults.length > 0 ? (
                            <div className={`mt-3 divide-y ${sectionLine} border-y ${sectionLine}`}>
                              {addressResults.map((result) => (
                                <button
                                  key={result.id}
                                  type="button"
                                  onClick={() => chooseAddressSuggestion(result)}
                                  className="grid w-full gap-1 py-2 text-left transition hover:text-[#0f4d3a]"
                                >
                                  <span className="text-sm font-black">{result.shortLabel || result.address}</span>
                                  <span className="text-xs font-semibold text-[#68766b]">{result.address}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                          {addressError ? <p className="mt-2 text-xs font-bold text-[#a55618]">{addressError}</p> : null}
                        </div>
                      </div>
                      <label className="grid gap-2 text-sm font-black">
                        Hotline
                        <input value={hotline} onChange={(event) => setHotline(event.target.value)} className={fieldClass} placeholder="0901234567" />
                      </label>
                    </div>
                  </div>

                  <div className="grid content-start gap-3">
                    <div className={`rounded-2xl border ${sectionLine} bg-white/55 p-4`}>
                      <div className="flex items-start gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#0f4d3a]/8 text-[#0f4d3a]">
                          <Bot className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-[#12251c]">CopilotAI tạo nhận diện</p>
                          <p className="mt-1 text-xs font-bold leading-5 text-[#68766b]">
                            Tạo slogan, mô tả và logo. Chỉ lưu vào quán sau khi bạn bấm áp dụng.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void generateBrandBoard()}
                        disabled={brandLoading || name.trim().length < 2}
                        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#0f4d3a]/20 bg-[#0f4d3a]/7 text-sm font-black text-[#0f4d3a] transition hover:border-[#0f4d3a]/40 disabled:opacity-50"
                      >
                        {brandLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {brandLoading ? "AI đang dựng brand..." : "AI tạo bộ nhận diện"}
                      </button>
                      {brandQuota ? (
                        <p className="mt-2 text-xs font-bold text-[#68766b]">
                        Logo AI: còn {brandQuota.remaining}/{brandQuota.limit} lượt gói {brandQuota.planCode.toUpperCase()}.
                      </p>
                    ) : null}
                      {brandError ? <p className="mt-2 text-xs font-bold text-[#a55618]">{brandError}</p> : null}
                      {brandBoard ? (
                        <div className="mt-3 grid gap-3">
                          <div className="grid gap-2">
                            {(brandBoard.slogans ?? []).slice(0, 3).map((slogan) => {
                              const active = selectedBrandSlogan === slogan;
                              return (
                                <button
                                  key={slogan}
                                  type="button"
                                  onClick={() => setSelectedBrandSlogan(slogan)}
                                  className={`rounded-xl px-3 py-2 text-left text-sm font-black transition ${
                                    active ? "bg-[#0f4d3a] text-[#fffaf1]" : `border ${sectionLine} bg-white/55 text-[#12251c] hover:border-[#0f4d3a]/40`
                                  }`}
                                >
                                  {slogan}
                                </button>
                              );
                            })}
                          </div>
                          {brandBoard.description ? (
                            <p className={`rounded-xl border ${sectionLine} bg-white/55 px-3 py-2 text-xs font-semibold leading-5 text-[#68766b]`}>
                              {brandBoard.description}
                            </p>
                          ) : null}
                          {aiLogoDraft?.imageUrl ? (
                            <div className={`grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-xl border ${sectionLine} bg-white/55 p-2`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={aiLogoDraft.imageUrl} alt="Logo AI tạo" className="h-16 w-16 rounded-xl object-cover" />
                              <div className="min-w-0">
                                <p className="text-xs font-black text-[#12251c]">Logo AI đã sẵn sàng</p>
                                <p className="mt-1 text-xs font-semibold leading-5 text-[#68766b]">Bấm áp dụng để dùng làm logo quán khi hoàn tất.</p>
                              </div>
                            </div>
                          ) : null}
                          <div className="grid gap-2 sm:grid-cols-2">
                            <button
                              type="button"
                              onClick={() => applyBrandBoard()}
                              className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0f4d3a] text-xs font-black text-[#fffaf1]"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Áp dụng chữ
                            </button>
                            <button
                              type="button"
                              onClick={() => (aiLogoDraft?.imageUrl ? applyBrandBoard({ includeLogo: true }) : applyAiLogoDraft())}
                              disabled={!aiLogoDraft?.imageUrl}
                              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[#0f4d3a]/20 bg-[#0f4d3a]/7 text-xs font-black text-[#0f4d3a] disabled:opacity-50"
                            >
                              <ImagePlus className="h-4 w-4" />
                              Áp dụng cả logo
                            </button>
                          </div>
                          {brandSlogan || generatedLogoUrl ? (
                            <p className="rounded-xl border border-[#0f4d3a]/16 bg-[#edf7eb] px-3 py-2 text-xs font-black text-[#0f4d3a]">
                              Đã áp dụng vào bản nháp. Khi hoàn tất, LogiVN sẽ lưu vào hồ sơ quán.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <label className={`grid min-h-[210px] cursor-pointer place-items-center rounded-2xl border border-dashed ${sectionLine} bg-white/45 p-4 text-center transition hover:border-[#0f4d3a]/40`}>
                      {logoPreview ? (
                        <Image src={logoPreview} alt="Logo quán" width={96} height={96} unoptimized className="h-24 w-24 rounded-2xl object-cover shadow-[0_14px_30px_rgba(15,77,58,0.12)]" />
                      ) : (
                        <span className="grid place-items-center">
                          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#0f4d3a]/8 text-[#0f4d3a]">
                            <ImagePlus className="h-6 w-6" />
                          </span>
                          <span className="mt-3 text-sm font-black">Upload logo</span>
                          <span className="mt-1 text-xs text-[#68766b]">JPG, PNG hoặc WebP</span>
                        </span>
                      )}
                      <input
                        name="logoFile"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        ref={logoFileInputRef}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          if (logoPreview && logoPreview.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
                          setGeneratedLogoUrl("");
                          setAiLogoDraft(null);
                          setLogoPreview(URL.createObjectURL(file));
                        }}
                      />
                    </label>
                    {generatedLogoUrl ? (
                      <button
                        type="button"
                        onClick={clearAppliedAiLogo}
                        className={`flex h-10 items-center justify-center gap-2 rounded-xl border ${sectionLine} bg-white text-xs font-black text-[#0f4d3a]`}
                      >
                        Đổi logo khác
                      </button>
                    ) : null}
                    <div className={`overflow-hidden rounded-2xl border ${sectionLine} bg-white/55`}>
                      <div className="border-b border-[#123b2b]/10 px-3 py-2">
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0f4d3a]">Map pin vận hành</p>
                        <p className="mt-1 text-xs font-bold text-[#68766b]">Dùng chung với đặt món, đặt bàn và chỉ đường.</p>
                      </div>
                      <StoreLocationPicker
                        compact
                        seedAddress={finalAddress}
                        latitude={storeLat}
                        longitude={storeLng}
                        onLatitudeChange={(value) => {
                          setStoreLat(value);
                          setLocationAccuracy(null);
                        }}
                        onLongitudeChange={(value) => {
                          setStoreLng(value);
                          setLocationAccuracy(null);
                        }}
                        onResolvedAddress={(value) => {
                          setSelectedAddress(value);
                          setStreetAddress((current) => current || value);
                        }}
                      />
                    </div>
                    <OnboardingButton onClick={() => advanceTo(1)} disabled={!canContinueInfo} className="w-full">
                      Tiếp tục <ArrowRight className="h-4 w-4" />
                    </OnboardingButton>
                  </div>
                </div>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <StepHeader eyebrow="Bước 2" title="Chọn gói dịch vụ" description="Dữ liệu gói được lấy trực tiếp từ cấu hình active của LogiVN, không dùng mô tả tạm." />
                <div className="p-5 sm:p-6">
                  <div className="grid gap-3 lg:grid-cols-2">
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
                          className={`group rounded-2xl border bg-white/50 p-4 text-left transition hover:-translate-y-0.5 ${
                            active ? "border-[#0f4d3a] shadow-[0_14px_36px_rgba(15,77,58,0.1)]" : "border-[#123b2b]/10 hover:border-[#0f4d3a]/35"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#0f4d3a]">{plan.code}</p>
                              <h3 className="mt-1 text-xl font-black tracking-[-0.03em]">{plan.name}</h3>
                            </div>
                            {plan.code === "premium" ? <span className="rounded-full bg-[#f28c28]/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#c36513]">Nâng cao</span> : null}
                          </div>
                          <p className="mt-3 text-3xl font-black tracking-[-0.04em]">
                            {formatVnd(plan.monthly_price)}
                            <span className="text-sm font-bold text-[#68766b]"> /tháng</span>
                          </p>
                          <p className="mt-2 min-h-10 text-sm leading-5 text-[#667266]">{plan.description}</p>
                          <p className="mt-3 text-xs font-black text-[#0f4d3a]">
                            Mọi quán bắt đầu bằng trial Pro {plan.trial_days} ngày. Chọn Premium để LogiVN ưu tiên gợi ý nâng cấp sau khi xác minh.
                          </p>
                          <ul className={`mt-4 divide-y ${sectionLine} border-y ${sectionLine}`}>
                            {plan.features.map((feature) => (
                              <li key={feature} className="flex items-center gap-2 py-2 text-sm font-semibold text-[#314338]">
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#0f4d3a]" />
                                {feature}
                              </li>
                            ))}
                          </ul>
                          <span className={`mt-4 flex h-10 items-center justify-center rounded-xl text-sm font-black ${active ? "bg-[#0f4d3a] text-[#fffaf1]" : "bg-[#0f4d3a]/8 text-[#0f4d3a]"}`}>
                            Chọn {plan.name}
                          </span>
                        </button>
                      );
                    })}
                    {plans.length === 0 ? (
                      <p className="rounded-xl border border-[#e59665]/30 bg-[#fff1e8] p-4 text-sm font-semibold text-[#9a4a17]">
                        Chưa đọc được cấu hình gói dịch vụ. Vui lòng tải lại trang trước khi tiếp tục.
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-5 flex justify-end">
                    <OnboardingButton onClick={() => advanceTo(2)} disabled={!selectedPlan}>
                      Tiếp tục <ArrowRight className="h-4 w-4" />
                    </OnboardingButton>
                  </div>
                </div>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <StepHeader eyebrow="Bước 3" title="Kiểm tra trước khi tạo quán" description="Chỉ giữ các mục sẽ thật sự được lưu vào database khi hoàn tất." />
                <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                  <div className={`rounded-2xl border ${sectionLine} bg-white/45 p-4`}>
                    <div className="flex items-center justify-between text-sm font-black">
                      <span>Tiến độ hoàn tất</span>
                      <span className="text-[#0f4d3a]">{setupProgress}%</span>
                    </div>
                    <div className="mt-3 h-1.5 rounded-full bg-[#0f4d3a]/10">
                      <div className="h-full rounded-full bg-[#0f4d3a] transition-[width]" style={{ width: `${setupProgress}%` }} />
                    </div>
                    <div className={`mt-5 grid place-items-center border-t ${sectionLine} pt-5`}>
                      <ListChecks className="h-16 w-16 text-[#0f4d3a]" />
                      <p className="mt-3 text-center text-sm font-bold text-[#647267]">
                        {setupDoneCount}/{setupTasks.length} mục đã sẵn sàng.
                      </p>
                    </div>
                  </div>
                  <div className={`divide-y ${sectionLine} border-y ${sectionLine}`}>
                    {setupTasks.map((item) => (
                      <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm font-black">
                        <span className="flex items-center gap-3">
                          {item.done ? <CheckCircle2 className="h-5 w-5 text-[#0f4d3a]" /> : <BadgeCheck className="h-5 w-5 text-[#8e978e]" />}
                          <span>
                            {item.label}
                            <span className="mt-0.5 block text-xs font-semibold text-[#68766b]">{item.detail}</span>
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => advanceTo(item.targetStep)}
                          className={item.done ? "text-[#0f4d3a]" : "text-[#8e978e] hover:text-[#0f4d3a]"}
                        >
                          {item.done ? "Đã áp dụng" : "Mở"}
                        </button>
                      </div>
                    ))}
                    <div className="flex justify-end py-4">
                      <OnboardingButton onClick={() => advanceTo(3)}>
                        Tạo bàn & QR <ArrowRight className="h-4 w-4" />
                      </OnboardingButton>
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <StepHeader eyebrow="Bước 4" title="Tạo bàn & QR" description="Chọn số bàn cần khởi tạo. QR sẽ gắn brand LogiVN và logo quán nếu đã upload." />
                <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_240px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => setTableCount((value) => Math.max(1, value - 1))} className={`h-10 rounded-xl border ${sectionLine} bg-white/55 px-4 font-black`}>-</button>
                      <span className="rounded-xl bg-[#0f4d3a] px-4 py-2.5 text-sm font-black text-[#fffaf1]">Tổng bàn: {tableCount}</span>
                      <button type="button" onClick={() => setTableCount((value) => Math.min(300, value + 1))} className={`h-10 rounded-xl border ${sectionLine} bg-white/55 px-4 font-black`}>+</button>
                      <span className={`rounded-xl border ${sectionLine} bg-white/55 px-4 py-2.5 text-sm font-bold text-[#68766b]`}>
                        {selectedPlan?.name ?? planCode}
                      </span>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                      {Array.from({ length: Math.min(tableCount, 12) }).map((_, index) => (
                        <div key={index} className={`rounded-xl border p-3 ${index === 2 ? "border-[#f28c28]/35 bg-[#fff4ea]" : "border-[#123b2b]/10 bg-white/50"}`}>
                          <Table2 className={`h-4 w-4 ${index === 2 ? "text-[#c36513]" : "text-[#0f4d3a]"}`} />
                          <p className="mt-3 text-sm font-black">{formatTableName(index)}</p>
                          <p className="mt-1 text-xs font-semibold text-[#68766b]">{index === 2 ? "Đang phục vụ" : "Trống"}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <aside className={`rounded-2xl border ${sectionLine} bg-white/50 p-4`}>
                    <div className="grid place-items-center">
                      <div className="grid h-32 w-32 place-items-center rounded-xl border border-[#123b2b]/10 bg-[#fffdf8]">
                        <QrCode className="h-20 w-20 text-[#12251c]" />
                      </div>
                      <p className="mt-3 text-sm font-black text-[#0f4d3a]">{name || "LogiVN"} QR</p>
                      <p className="mt-1 text-center text-xs text-[#68766b]">Auto branding + logo quán</p>
                    </div>
                    <div className="mt-4 grid gap-2">
                      <button type="button" className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0f4d3a] text-sm font-black text-[#fffaf1]">
                        <QrCode className="h-4 w-4" /> Tạo QR
                      </button>
                      <button type="button" className={`flex h-10 items-center justify-center gap-2 rounded-xl border ${sectionLine} bg-white text-sm font-black text-[#0f4d3a]`}>
                        <Printer className="h-4 w-4" /> In QR
                      </button>
                      <OnboardingButton onClick={() => advanceTo(4)} className="w-full">
                        Tạo menu
                      </OnboardingButton>
                    </div>
                  </aside>
                </div>
              </>
            ) : null}

            {step === 4 ? (
              <>
                <StepHeader eyebrow="Bước 5" title="Tạo menu" description="Thêm món đầu tiên hoặc dùng OCR AI để nhập menu giấy. Món OCR chỉ lưu sau khi chủ quán xác nhận." />
                <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <div className={`grid gap-4 rounded-2xl border ${sectionLine} bg-white/45 p-4`}>
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
                    <div className={`rounded-xl border ${sectionLine} bg-[#fffdf8] p-3 text-sm font-bold text-[#68766b]`}>
                      <p className="flex items-center gap-2 text-[#0f4d3a]">
                        <ImagePlus className="h-5 w-5" />
                        Ảnh món thêm ở dashboard menu sau onboarding.
                      </p>
                      <p className="mt-2 text-xs leading-5">Khuyến nghị mobile-first: ảnh vuông 1200x1200px, JPG/WebP dưới 1MB, món nằm giữa khung và không có chữ nhỏ.</p>
                    </div>

                    <div className={`rounded-2xl border ${sectionLine} bg-white/55 p-4`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="flex items-center gap-2 text-sm font-black text-[#0f4d3a]">
                            <Sparkles className="h-4 w-4" /> OCR menu bằng AI
                          </p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-[#68766b]">
                            Pro có 1 lượt OCR onboarding, Premium có 5 lượt. AI đọc xong sẽ tạo danh sách để bạn xác nhận trước khi lưu.
                          </p>
                        </div>
                        {menuOcrQuota ? (
                          <span className="shrink-0 rounded-full border border-[#0f4d3a]/10 bg-[#0f4d3a]/7 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#0f4d3a]">
                            {menuOcrQuota.remaining}/{menuOcrQuota.limit}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 grid gap-3">
                        <label className="grid gap-2 text-xs font-black uppercase tracking-[0.08em] text-[#526359]">
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
                        <label className="grid gap-2 text-xs font-black uppercase tracking-[0.08em] text-[#526359]">
                          Hoặc dán menu thô
                          <textarea
                            value={menuOcrText}
                            onChange={(event) => setMenuOcrText(event.target.value)}
                            className="min-h-24 rounded-xl border border-[#123b2b]/12 bg-[#fffdf8] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-[#12251c] outline-none focus:border-[#0f4d3a]/70 focus:ring-2 focus:ring-[#0f4d3a]/10"
                            placeholder={"CÀ PHÊ\nCà phê sữa đá 28000\nBạc xỉu 35000"}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => void runMenuOcr()}
                          disabled={menuOcrLoading || (!menuOcrText.trim() && !menuOcrImage)}
                          className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[#0f4d3a]/20 bg-[#0f4d3a]/7 text-sm font-black text-[#0f4d3a] disabled:opacity-50"
                        >
                          {menuOcrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                          {menuOcrLoading ? "AI đang đọc menu..." : "Quét menu bằng AI"}
                        </button>
                        {menuOcrError ? <p className="text-xs font-bold text-[#a55618]">{menuOcrError}</p> : null}
                      </div>

                      {ocrDraftItems.length > 0 ? (
                        <div className={`mt-4 divide-y ${sectionLine} border-y ${sectionLine}`}>
                          <div className="flex items-center justify-between gap-3 py-2">
                            <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0f4d3a]">
                              AI đọc được {ocrDraftItems.length} món
                            </p>
                            <span className="text-xs font-bold text-[#68766b]">{Math.round((menuOcrDraft?.confidence ?? 0) * 100)}% tin cậy</span>
                          </div>
                          {ocrDraftItems.slice(0, 8).map((item) => (
                            <div key={`${item.categoryName}-${item.name}`} className="grid grid-cols-[minmax(0,1fr)_90px] gap-3 py-2 text-sm">
                              <div className="min-w-0">
                                <p className="truncate font-black text-[#12251c]">{item.name}</p>
                                <p className="text-xs font-semibold text-[#68766b]">{item.categoryName}</p>
                              </div>
                              <p className="text-right font-black text-[#0f4d3a]">{formatVnd(item.price)}</p>
                            </div>
                          ))}
                          {ocrDraftItems.length > 8 ? <p className="py-2 text-xs font-semibold text-[#68766b]">Còn {ocrDraftItems.length - 8} món khác sẽ được lưu cùng.</p> : null}
                          <button
                            type="button"
                            onClick={() => setConfirmedMenuItems(ocrDraftItems)}
                            className="my-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#0f4d3a] text-sm font-black text-[#fffaf1]"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Xác nhận thêm {ocrDraftItems.length} món
                          </button>
                        </div>
                      ) : null}
                      {confirmedMenuItems.length > 0 ? (
                        <p className="mt-3 rounded-xl border border-[#0f4d3a]/16 bg-[#edf7eb] px-3 py-2 text-xs font-black text-[#0f4d3a]">
                          Đã xác nhận {confirmedMenuItems.length} món. Khi hoàn tất, LogiVN sẽ tạo danh mục và món thật trong database.
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <aside className="grid content-start gap-3">
                    <div className={`rounded-2xl border ${sectionLine} bg-white/50 p-4`}>
                      <p className="flex items-center gap-2 text-sm font-black text-[#0f4d3a]">
                        <Bot className="h-5 w-5" /> Gợi ý AI
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[#647267]">Sau khi vào dashboard, chủ quán có thể sửa ảnh từng món, thêm mô tả AI và tối ưu menu khách trên mobile.</p>
                      <div className={`mt-4 divide-y ${sectionLine} border-y ${sectionLine}`}>
                        <p className="py-2.5 text-sm font-black text-[#0f4d3a]">Ảnh món: 1200x1200px</p>
                        <p className="py-2.5 text-sm font-black text-[#0f4d3a]">OCR lưu sau xác nhận</p>
                      </div>
                    </div>
                    {state?.error ? <p className="rounded-xl border border-[#e59665]/30 bg-[#fff1e8] p-3 text-sm font-semibold text-[#9a4a17]">{state.error}</p> : null}
                    <OnboardingButton type="submit" disabled={pending || !canContinueInfo || (!itemName.trim() && confirmedMenuItems.length === 0)} className="w-full">
                      {pending ? "Đang tạo..." : "Hoàn tất & vào Dashboard"}
                      <ArrowRight className="h-4 w-4" />
                    </OnboardingButton>
                  </aside>
                </div>
              </>
            ) : null}
          </div>
        </section>
      </form>
    </main>
  );
}

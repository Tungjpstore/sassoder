"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Eye,
  EyeOff,
  Flame,
  ImageIcon,
  Layers3,
  Loader2,
  Pencil,
  Plus,
  RadioTower,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tags,
  TimerReset,
  Trash2,
  Utensils,
  X
} from "lucide-react";
import {
  createCategoryAction,
  createMenuModifierGroupAction,
  createMenuModifierOptionAction,
  createMenuItemAction,
  deleteMenuModifierGroupAction,
  deleteMenuModifierOptionAction,
  deleteMenuItemAction,
  importMenuOcrItemsAction,
  toggleMenuModifierOptionAvailabilityAction,
  toggleMenuItemAvailabilityAction,
  updateMenuModifierGroupAction,
  updateMenuModifierOptionAction,
  updateMenuItemAction
} from "@/app/dashboard/actions";
import { ConfirmActionButton } from "@/components/dashboard/confirm-action-button";
import { DashboardMetricCard } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatVnd } from "@/lib/money";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import type { AdminMenuCategory, AdminMenuItem } from "@/services/menu-service";

type MenuItemWithCategory = AdminMenuItem & { categoryName: string };
type AvailabilityFilter = "all" | "available" | "paused";
type MenuPanelMode = "closed" | "stats" | "aiOcr" | "createCategory" | "createItem" | "editItem";
type RealtimeState = "connecting" | "connected" | "error";
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
type OcrImportItem = {
  categoryName: string;
  name: string;
  price: number;
};
type OcrImportActionState = {
  error?: string;
  success?: string;
  inserted?: number;
  skipped?: number;
  categoriesCreated?: number;
  skippedNames?: string[];
};
type AiImageResponse = {
  imageUrl: string | null;
  prompt: string;
  provider: string;
  model: string;
};
type AiFoodImageDraft = AiImageResponse & {
  mode: "create" | "edit";
  itemId?: string;
};

const maxImageUploadSize = 5 * 1024 * 1024;
const menuImageBucket = "menu-images";
const menuImageAccept = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const allowedMenuImageTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", ""]);

type SignedMenuImageUpload = {
  path: string;
  token: string;
  publicUrl: string;
  contentType: string;
};

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error?: string };

function flattenOcrDraft(draft: OcrDraft | null): OcrImportItem[] {
  if (!draft) return [];
  return draft.categories.flatMap((category) =>
    category.items.map((item) => ({
      categoryName: category.name,
      name: item.name,
      price: item.price
    }))
  );
}

function menuImportDuplicateKey(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function realtimeLabel(status: RealtimeState) {
  if (status === "connected") return "Menu live";
  if (status === "error") return "Live gián đoạn";
  return "Đang nối live";
}

function realtimeTone(status: RealtimeState): "green" | "yellow" | "red" {
  if (status === "connected") return "green";
  if (status === "error") return "red";
  return "yellow";
}

function formatClock(value: Date | null) {
  if (!value) return "Đang đồng bộ";
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value);
}

export function MenuWorkspace({
  restaurantId,
  categories,
  topItemIds,
  topItemNames,
  restaurantName
}: {
  restaurantId: string;
  categories: AdminMenuCategory[];
  topItemIds: string[];
  topItemNames: string[];
  restaurantName: string;
}) {
  const router = useRouter();
  const refreshTimerRef = useRef<number | null>(null);
  const topIdSet = useMemo(() => new Set(topItemIds), [topItemIds]);
  const items = useMemo(
    () => categories.flatMap((category) => category.items.map((item) => ({ ...item, categoryName: category.name }))),
    [categories]
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<MenuPanelMode>("closed");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>("all");
  const [query, setQuery] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [aiOcrText, setAiOcrText] = useState("");
  const [aiOcrImage, setAiOcrImage] = useState<File | null>(null);
  const [aiOcrDraft, setAiOcrDraft] = useState<OcrDraft | null>(null);
  const [aiOcrError, setAiOcrError] = useState<string | null>(null);
  const [aiOcrLoading, setAiOcrLoading] = useState(false);
  const [aiFoodImageDraft, setAiFoodImageDraft] = useState<AiFoodImageDraft | null>(null);
  const [aiFoodImageError, setAiFoodImageError] = useState<string | null>(null);
  const [aiFoodImageLoading, setAiFoodImageLoading] = useState<"create" | "edit" | null>(null);
  const [appliedAiFoodImageUrl, setAppliedAiFoodImageUrl] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("connecting");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(() => new Date());
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [ocrImportState, importOcrFormAction, ocrImportPending] = useActionState<OcrImportActionState | undefined, FormData>(importMenuOcrItemsAction, undefined);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const scheduleRefresh = (delay = 260) => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        startRefreshTransition(() => {
          router.refresh();
          setLastSyncedAt(new Date());
        });
      }, delay);
    };
    const scheduleRealtimeRefresh = () => {
      setRealtimeState("connected");
      scheduleRefresh();
    };

    const channel = supabase
      .channel(`admin-menu:${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_categories", filter: `restaurant_id=eq.${restaurantId}` }, scheduleRealtimeRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items", filter: `restaurant_id=eq.${restaurantId}` }, scheduleRealtimeRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_modifier_groups", filter: `restaurant_id=eq.${restaurantId}` }, scheduleRealtimeRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_modifier_options", filter: `restaurant_id=eq.${restaurantId}` }, scheduleRealtimeRefresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeState("connected");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRealtimeState("error");
          scheduleRefresh(0);
        }
      });

    const refreshIfVisible = () => {
      if (document.visibilityState !== "hidden" && window.navigator.onLine) scheduleRefresh(0);
    };
    const fallbackTimer = window.setInterval(refreshIfVisible, 45_000);
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);

    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      window.clearInterval(fallbackTimer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, router]);

  function refreshMenu() {
    startRefreshTransition(() => {
      router.refresh();
      setLastSyncedAt(new Date());
    });
  }

  const selectedItem = selectedItemId ? items.find((item) => item.id === selectedItemId) ?? null : null;
  const aiOcrImportItems = useMemo(() => flattenOcrDraft(aiOcrDraft), [aiOcrDraft]);
  const aiOcrImportItemsJson = useMemo(() => JSON.stringify(aiOcrImportItems), [aiOcrImportItems]);
  const existingMenuItemKeys = useMemo(() => new Set(items.map((item) => menuImportDuplicateKey(item.name))), [items]);
  const aiOcrImportRows = useMemo(
    () =>
      aiOcrImportItems.map((item) => ({
        ...item,
        isDuplicate: existingMenuItemKeys.has(menuImportDuplicateKey(item.name))
      })),
    [aiOcrImportItems, existingMenuItemKeys]
  );
  const newOcrItemCount = aiOcrImportRows.filter((item) => !item.isDuplicate).length;
  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCategory = categoryFilter === "all" || item.category_id === categoryFilter;
      const matchesAvailability =
        availabilityFilter === "all" ||
        (availabilityFilter === "available" && item.is_available) ||
        (availabilityFilter === "paused" && !item.is_available);
      const matchesKeyword = !keyword || item.name.toLowerCase().includes(keyword) || item.categoryName.toLowerCase().includes(keyword);
      return matchesCategory && matchesAvailability && matchesKeyword;
    });
  }, [availabilityFilter, categoryFilter, items, query]);

  const availableItems = items.filter((item) => item.is_available).length;
  const pausedItems = items.length - availableItems;
  const missingImageItems = items.filter((item) => !item.image_url).length;
  const modifierGroupCount = items.reduce((sum, item) => sum + (item.modifierGroups?.length ?? 0), 0);
  const modifierOptionCount = items.reduce(
    (sum, item) => sum + (item.modifierGroups ?? []).reduce((groupSum, group) => groupSum + group.options.length, 0),
    0
  );
  const itemsWithModifiers = items.filter((item) => (item.modifierGroups?.length ?? 0) > 0).length;
  const averagePrice = items.length ? Math.round(items.reduce((sum, item) => sum + item.price, 0) / items.length) : 0;
  const menuReadiness = items.length
    ? Math.min(100, Math.round(((availableItems * 0.55 + (items.length - missingImageItems) * 0.3 + Math.min(categories.length, items.length) * 0.15) / items.length) * 100))
    : 0;
  const categoryHealth = categories.map((category) => {
    const active = category.items.filter((item) => item.is_available).length;
    const missingImage = category.items.filter((item) => !item.image_url).length;
    return {
      id: category.id,
      name: category.name,
      total: category.items.length,
      active,
      missingImage,
      paused: category.items.length - active
    };
  });
  const menuActionQueue = [
    ...items
      .filter((item) => !item.is_available)
      .slice(0, 3)
      .map((item) => ({ key: `paused-${item.id}`, label: item.name, meta: `${item.categoryName} · đang tạm hết`, tone: "yellow" as const, itemId: item.id })),
    ...items
      .filter((item) => item.is_available && !item.image_url)
      .slice(0, 3)
      .map((item) => ({ key: `image-${item.id}`, label: item.name, meta: `${item.categoryName} · thiếu ảnh menu`, tone: "blue" as const, itemId: item.id }))
  ].slice(0, 5);
  const stats = [
    { label: "Tổng món đang bán", value: availableItems, meta: "Đang hiển thị với khách", icon: Sparkles, tone: "orange" },
    { label: "Món bán chạy", value: topItemIds.length, meta: topItemNames[0] ?? "Chưa có dữ liệu bán", icon: Flame, tone: "orange" },
    { label: "Món tạm hết", value: pausedItems, meta: "Không hiển thị trên menu khách", icon: TimerReset, tone: "red" },
    { label: "Tùy chọn", value: modifierGroupCount, meta: `${modifierOptionCount} lựa chọn topping/size`, icon: SlidersHorizontal, tone: "green" },
    { label: "Danh mục", value: categories.length, meta: categories.map((category) => category.name).slice(0, 3).join(", ") || "Chưa có", icon: Utensils, tone: "green" }
  ];

  useEffect(() => {
    if (!ocrImportState?.inserted) return;
    const timeout = window.setTimeout(() => {
      setAiOcrDraft(null);
      setAiOcrText("");
      setAiOcrImage(null);
      setPanelMode("closed");
      setUploadError(null);
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [ocrImportState?.inserted]);

  function renderImage(item: MenuItemWithCategory, size: number) {
    return item.image_url ? (
      <Image src={item.image_url} alt={item.name} width={size} height={size} className="h-full w-full object-cover" />
    ) : (
      <ImageIcon className="text-[var(--outline)]" />
    );
  }

  function openPanel(mode: MenuPanelMode, itemId?: string) {
    setUploadError(null);
    setUploadingImage(false);
    setAiFoodImageError(null);
    if (mode === "createItem" || mode === "editItem") {
      setAiFoodImageDraft(null);
      setAppliedAiFoodImageUrl(null);
    }
    if (itemId) setSelectedItemId(itemId);
    if (mode === "createItem" || mode === "createCategory" || mode === "stats") setSelectedItemId(null);
    setPanelMode(mode);
  }

  function closePanel() {
    setPanelMode("closed");
    setUploadError(null);
    setUploadingImage(false);
    setAiFoodImageError(null);
    setAiFoodImageLoading(null);
    setAppliedAiFoodImageUrl(null);
  }

  function fileToBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Không đọc được ảnh menu."));
      reader.readAsDataURL(file);
    });
  }

  async function runAiMenuOcr() {
    const rawText = aiOcrText.trim();
    if ((!rawText && !aiOcrImage) || aiOcrLoading) return;
    setAiOcrLoading(true);
    setAiOcrError(null);
    setAiOcrDraft(null);
    try {
      const imageBase64 = aiOcrImage ? await fileToBase64(aiOcrImage) : undefined;
      const response = await fetch("/api/admin/ai/menu-ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rawText: rawText || undefined, imageBase64 })
      });
      const result = (await response.json().catch(() => null)) as ApiResponse<{ text?: string; data?: OcrDraft }> | null;
      if (!result || !result.ok) throw new Error(result?.error || "Chưa đọc được menu.");
      setAiOcrDraft(result.data.data ?? null);
    } catch (error) {
      setAiOcrError(error instanceof Error ? error.message : "Không nhập được menu tự động.");
    } finally {
      setAiOcrLoading(false);
    }
  }

  async function runAiFoodImage(form: HTMLFormElement | null, mode: "create" | "edit", item?: MenuItemWithCategory | null) {
    if (!form || aiFoodImageLoading) return;
    const nameInput = form.elements.namedItem("name") as HTMLInputElement | null;
    const priceInput = form.elements.namedItem("price") as HTMLInputElement | null;
    const categorySelect = form.elements.namedItem("categoryId") as HTMLSelectElement | null;
    const dishName = nameInput?.value.trim() || item?.name || "";
    const price = Number(priceInput?.value || item?.price || 0);
    const categoryName =
      categorySelect?.selectedOptions?.[0]?.textContent?.trim() ||
      categories.find((category) => category.id === categorySelect?.value)?.name ||
      item?.categoryName ||
      "Menu";

    if (dishName.length < 2) {
      setAiFoodImageError("Nhập tên món trước để tạo ảnh đúng món, tránh tốn lượt dùng cho ảnh ngẫu nhiên.");
      return;
    }

    setAiFoodImageLoading(mode);
    setAiFoodImageError(null);

    try {
      const creativePrompt = [
        `Dish name: ${dishName}.`,
        `Category: ${categoryName}.`,
        Number.isFinite(price) && price > 0 ? `Menu price context: ${formatVnd(price)}.` : "",
        "Generate a realistic appetizing Vietnamese F&B menu photo for this exact dish.",
        "The dish must be the hero subject, centered, square crop, clean table, no text, no logo, no QR, no packaging mockup.",
        "Commercial mobile menu quality, natural ingredients, honest portion size, warm side light."
      ]
        .filter(Boolean)
        .join(" ");
      const response = await fetch("/api/admin/ai/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "food_photo",
          restaurantName,
          businessType: categoryName,
          prompt: creativePrompt
        })
      });
      const result = (await response.json().catch(() => null)) as ApiResponse<AiImageResponse> | null;
      if (!result || !result.ok) throw new Error(result?.error || "Chưa tạo được ảnh món.");
      if (!result.data.imageUrl) throw new Error("Ảnh chưa sẵn sàng. Vui lòng thử lại sau.");
      setAiFoodImageDraft({
        ...result.data,
        mode,
        itemId: item?.id
      });
      setAppliedAiFoodImageUrl(null);
    } catch (error) {
      setAiFoodImageError(error instanceof Error ? error.message : "Không tạo được ảnh món.");
    } finally {
      setAiFoodImageLoading(null);
    }
  }

  function applyAiFoodImage(form: HTMLFormElement | null, imageUrl: string) {
    if (!form || !imageUrl) return;
    const imageInput = form.elements.namedItem("image") as HTMLInputElement | null;
    const fileInput = form.elements.namedItem("imageFile") as HTMLInputElement | null;
    if (imageInput) imageInput.value = imageUrl;
    if (fileInput) fileInput.value = "";
    setAppliedAiFoodImageUrl(imageUrl);
    setUploadError(null);
  }

  function getImageValidationError(file: File) {
    const hasSupportedExtension = /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!allowedMenuImageTypes.has(file.type) && !hasSupportedExtension) {
      return "Ảnh món chỉ hỗ trợ JPG, PNG hoặc WebP. Vui lòng đổi ảnh rồi thử lại.";
    }

    if (file.size > maxImageUploadSize) {
      return "Ảnh món đang lớn hơn 5MB. Vui lòng nén ảnh hoặc chọn ảnh nhẹ hơn.";
    }

    return null;
  }

  async function uploadMenuImageFromBrowser(file: File) {
    const response = await fetch("/api/admin/menu-images/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type,
        size: file.size
      })
    });
    const result = (await response.json().catch(() => null)) as ApiResponse<SignedMenuImageUpload> | null;
    if (!result) {
      throw new Error("Không tạo được quyền tải ảnh món. Vui lòng thử lại.");
    }

    if (!response.ok || !result.ok) {
      throw new Error(("error" in result && result.error) || "Không tạo được quyền tải ảnh món. Vui lòng thử lại.");
    }

    const signedUpload = result.data;
    const uploadFile = file.type === signedUpload.contentType ? file : new File([file], file.name, { type: signedUpload.contentType });
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.storage.from(menuImageBucket).uploadToSignedUrl(signedUpload.path, signedUpload.token, uploadFile, {
      cacheControl: "31536000",
      contentType: signedUpload.contentType,
      upsert: false
    });

    if (error) {
      throw new Error(error.message || "Không tải được ảnh món lên Supabase Storage.");
    }

    return signedUpload.publicUrl;
  }

  async function handleMenuFormSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    if (submitter?.dataset.skipImageUpload === "true") return;

    if (form.dataset.imageUploadReady === "true") {
      delete form.dataset.imageUploadReady;
      return;
    }

    setUploadError(null);
    const fileInput = form.elements.namedItem("imageFile") as HTMLInputElement | null;
    const imageInput = form.elements.namedItem("image") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!file) {
      if (imageInput && appliedAiFoodImageUrl) imageInput.value = appliedAiFoodImageUrl;
      return;
    }

    const validationError = getImageValidationError(file);
    if (validationError) {
      event.preventDefault();
      setUploadError(validationError);
      return;
    }

    event.preventDefault();
    setUploadingImage(true);

    try {
      const publicUrl = await uploadMenuImageFromBrowser(file);
      if (imageInput) imageInput.value = publicUrl;
      if (fileInput) fileInput.value = "";
      form.dataset.imageUploadReady = "true";
      form.requestSubmit();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Không tải được ảnh món. Vui lòng thử lại.");
      setUploadingImage(false);
    }
  }

  function renderAiFoodImageAssistant(mode: "create" | "edit", item?: MenuItemWithCategory | null) {
    const activeDraft =
      aiFoodImageDraft && aiFoodImageDraft.mode === mode && (mode === "create" || aiFoodImageDraft.itemId === item?.id)
        ? aiFoodImageDraft
        : null;
    const isLoading = aiFoodImageLoading === mode;
    const isApplied = Boolean(activeDraft?.imageUrl && appliedAiFoodImageUrl === activeDraft.imageUrl);

    return (
      <div className="rounded-xl border border-[var(--primary)]/18 bg-[linear-gradient(145deg,rgba(15,77,58,0.07),rgba(242,140,40,0.08))] p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
              <Sparkles size={15} className="text-[var(--primary)]" />
              Tạo ảnh món
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-[var(--muted-foreground)]">
              Lấy tên món và danh mục hiện tại để tạo ảnh menu vuông. Bạn xem trước rồi bấm áp dụng trước khi lưu.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={Boolean(aiFoodImageLoading)}
            onClick={(event) => void runAiFoodImage(event.currentTarget.form, mode, item)}
            className="h-10 shrink-0 shadow-none hover:shadow-none"
          >
            {isLoading ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />}
            {isLoading ? "Đang tạo..." : "Tạo ảnh gợi ý"}
          </Button>
        </div>
        {aiFoodImageError ? (
          <p className="mt-3 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--accent-strong)]">
            {aiFoodImageError}
          </p>
        ) : null}
        {activeDraft?.imageUrl ? (
          <div className="mt-3 grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 sm:grid-cols-[96px_minmax(0,1fr)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activeDraft.imageUrl} alt="Ảnh món gợi ý" className="aspect-square w-24 rounded-lg object-cover" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--foreground)]">Ảnh gợi ý đã sẵn sàng để lưu</p>
              <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">
                Bấm áp dụng để dùng ảnh này cho món. Nếu chọn file upload thủ công sau đó, ảnh upload sẽ thay ảnh gợi ý.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={isApplied}
                  onClick={(event) => applyAiFoodImage(event.currentTarget.form, activeDraft.imageUrl!)}
                  className="h-9 shadow-none hover:shadow-none"
                >
                  <Save size={14} />
                  {isApplied ? "Đã áp dụng" : "Áp dụng làm ảnh món"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={Boolean(aiFoodImageLoading)}
                  onClick={(event) => void runAiFoodImage(event.currentTarget.form, mode, item)}
                  className="h-9 shadow-none hover:shadow-none"
                >
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Tạo lại
                </Button>
              </div>
              {isApplied ? (
                <p className="mt-2 rounded-lg border border-[var(--primary)]/16 bg-[var(--primary-soft)] px-3 py-2 text-xs font-semibold text-[var(--primary-strong)]">
                  Đã gắn ảnh vào form. Bấm {mode === "create" ? "Thêm món" : "Lưu thay đổi"} để lưu vào database và hiển thị trên menu khách.
                </p>
              ) : null}
              <p className="mt-2 truncate text-[10px] font-semibold uppercase text-[var(--muted-foreground)]">Sẵn sàng áp dụng</p>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function modifierRuleText(group: NonNullable<MenuItemWithCategory["modifierGroups"]>[number]) {
    const minText = group.minSelect > 0 ? `chọn ${group.minSelect}` : "không bắt buộc";
    const maxText = group.maxSelect === null ? "không giới hạn" : `tối đa ${group.maxSelect}`;
    return `${minText} · ${maxText}`;
  }

  function renderModifierManager(item: MenuItemWithCategory) {
    const groups = item.modifierGroups ?? [];

    return (
      <section className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
              <SlidersHorizontal size={15} className="text-[var(--primary)]" />
              Topping & tùy chọn
            </p>
            <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">
              {groups.length ? `${groups.length} nhóm · ${groups.reduce((sum, group) => sum + group.options.length, 0)} lựa chọn` : "Chưa có tùy chọn cho món này"}
            </p>
          </div>
          <Badge tone={groups.length ? "green" : "yellow"}>{groups.length ? "Đã cấu hình" : "Chưa có"}</Badge>
        </div>

        <form action={createMenuModifierGroupAction} className="grid gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-3">
          <input type="hidden" name="itemId" value={item.id} />
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_86px_86px]">
            <Input name="name" placeholder="Size, Đá, Đường, Topping..." required />
            <Input name="minSelect" type="number" min={0} max={20} defaultValue={0} aria-label="Tối thiểu" />
            <Input name="maxSelect" type="number" min={0} max={20} placeholder="Tối đa" aria-label="Tối đa" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex min-h-11 items-center gap-2 text-xs font-semibold text-[var(--muted-foreground)]">
              <input type="checkbox" name="isRequired" value="true" className="h-4 w-4 accent-[var(--primary)]" />
              Bắt buộc chọn
            </label>
            <Button size="sm" className="shadow-none hover:shadow-none">
              <Plus size={14} />
              Thêm nhóm
            </Button>
          </div>
        </form>

        <div className="grid gap-3">
          {groups.map((group) => (
            <article key={group.id} className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <form action={updateMenuModifierGroupAction} className="grid gap-2">
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="groupId" value={group.id} />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--foreground)]">{group.name}</p>
                    <p className="mt-0.5 text-xs font-semibold text-[var(--muted-foreground)]">{modifierRuleText(group)}</p>
                  </div>
                  {group.required ? <Badge tone="yellow">Bắt buộc</Badge> : <Badge>Tuỳ chọn</Badge>}
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_76px_76px]">
                  <Input name="name" defaultValue={group.name} required />
                  <Input name="minSelect" type="number" min={0} max={20} defaultValue={group.minSelect} aria-label="Tối thiểu" />
                  <Input name="maxSelect" type="number" min={0} max={20} defaultValue={group.maxSelect ?? ""} aria-label="Tối đa" />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex min-h-11 items-center gap-2 text-xs font-semibold text-[var(--muted-foreground)]">
                    <input type="checkbox" name="isRequired" value="true" defaultChecked={group.required} className="h-4 w-4 accent-[var(--primary)]" />
                    Bắt buộc
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" className="shadow-none hover:shadow-none">
                      <Save size={14} />
                      Lưu nhóm
                    </Button>
                  </div>
                </div>
              </form>

              <div className="grid gap-2">
                {group.options.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-3 text-xs font-semibold text-[var(--muted-foreground)]">
                    Chưa có lựa chọn trong nhóm này.
                  </div>
                ) : (
                  group.options.map((option) => (
                    <div key={option.id} className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-2">
                      <form action={updateMenuModifierOptionAction} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_112px]">
                        <input type="hidden" name="groupId" value={group.id} />
                        <input type="hidden" name="optionId" value={option.id} />
                        <Input name="name" defaultValue={option.name} required />
                        <Input name="priceDelta" type="number" min={0} step={1000} defaultValue={option.priceDelta} aria-label="Giá cộng thêm" />
                        <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
                          <label className="flex min-h-11 items-center gap-2 text-xs font-semibold text-[var(--muted-foreground)]">
                            <input type="checkbox" name="isAvailable" value="true" defaultChecked={option.isAvailable !== false} className="h-4 w-4 accent-[var(--primary)]" />
                            Đang bán · {option.priceDelta > 0 ? `+${formatVnd(option.priceDelta)}` : "không phụ phí"}
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="secondary" className="shadow-none hover:shadow-none">
                              <Save size={14} />
                              Lưu
                            </Button>
                          </div>
                        </div>
                      </form>
                      <div className="flex flex-wrap gap-2">
                        <form action={toggleMenuModifierOptionAvailabilityAction}>
                          <input type="hidden" name="optionId" value={option.id} />
                          <input type="hidden" name="isAvailable" value={String(option.isAvailable === false)} />
                          <Button size="sm" variant="ghost" className="shadow-none hover:shadow-none">
                            {option.isAvailable === false ? <Eye size={14} /> : <EyeOff size={14} />}
                            {option.isAvailable === false ? "Bật bán" : "Tạm hết"}
                          </Button>
                        </form>
                        <form action={deleteMenuModifierOptionAction}>
                          <input type="hidden" name="optionId" value={option.id} />
                          <ConfirmActionButton
                            size="sm"
                            variant="danger"
                            className="shadow-none hover:shadow-none"
                            confirmTitle="Xóa tùy chọn"
                            confirmDescription={`Xóa "${option.name}" khỏi nhóm ${group.name}. Các đơn cũ vẫn giữ snapshot đã đặt.`}
                            confirmLabel="Xóa tùy chọn"
                          >
                            <Trash2 size={14} />
                            Xóa
                          </ConfirmActionButton>
                        </form>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form action={createMenuModifierOptionAction} className="grid gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-2 sm:grid-cols-[minmax(0,1fr)_112px]">
                <input type="hidden" name="groupId" value={group.id} />
                <Input name="name" placeholder="Trân châu, size L, ít đá..." required />
                <Input name="priceDelta" type="number" min={0} step={1000} defaultValue={0} aria-label="Giá cộng thêm" />
                <input type="hidden" name="isAvailable" value="true" />
                <Button size="sm" className="shadow-none hover:shadow-none sm:col-span-2">
                  <Plus size={14} />
                  Thêm lựa chọn
                </Button>
              </form>

              <form action={deleteMenuModifierGroupAction} className="border-t border-[var(--border)] pt-2">
                <input type="hidden" name="groupId" value={group.id} />
                <ConfirmActionButton
                  size="sm"
                  variant="ghost"
                  className="text-[var(--accent-strong)] shadow-none hover:shadow-none"
                  confirmTitle="Xóa nhóm tùy chọn"
                  confirmDescription={`Nhóm "${group.name}" sẽ không còn hiển thị trong menu khách.`}
                  confirmLabel="Xóa nhóm"
                >
                  <Trash2 size={14} />
                  Xóa nhóm này
                </ConfirmActionButton>
              </form>
            </article>
          ))}
        </div>
      </section>
    );
  }

  const topMenuItems = items.filter((item) => topIdSet.has(item.id)).slice(0, 5);
  const activeCategoryName = categoryFilter === "all" ? "Tất cả danh mục" : categories.find((category) => category.id === categoryFilter)?.name ?? "Danh mục";

  return (
    <div className="dashboard-menu-workspace grid gap-3">
      <section className="admin-hero-panel dashboard-mobile-hide rounded-[14px] p-4">
        <div className="relative z-[1] flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={realtimeTone(realtimeState)}>
                <span className="inline-flex items-center gap-1.5">
                  <RadioTower size={13} />
                  {realtimeLabel(realtimeState)}
                </span>
              </Badge>
              <Badge tone={menuReadiness >= 85 ? "green" : menuReadiness >= 65 ? "yellow" : "red"}>{menuReadiness}% sẵn sàng</Badge>
              <Badge tone={pausedItems ? "yellow" : "green"}>{pausedItems ? `${pausedItems} món tạm hết` : "Không thiếu món"}</Badge>
            </div>
            <h2 className="dashboard-page-title mt-3">Menu vận hành & QR ordering</h2>
            <p className="dashboard-body-copy mt-2 max-w-3xl">
              Quản lý món, ảnh, giá và tình trạng bán theo nhịp vận hành thực tế. Menu sạch giúp khách gọi món nhanh hơn, bếp ít nhầm hơn và AI có dữ liệu tốt hơn để upsell.
            </p>
          </div>
          <div className="dashboard-hero-action-panel grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/80 p-3 text-sm font-semibold text-[var(--muted-foreground)] shadow-sm sm:min-w-[280px]">
            <div className="flex items-center justify-between gap-3">
              <span>Cập nhật</span>
              <strong className="text-[var(--foreground)]">{formatClock(lastSyncedAt)}</strong>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-container-high)]">
              <div className={cn("h-full rounded-full", menuReadiness >= 85 ? "bg-[var(--primary)]" : menuReadiness >= 65 ? "bg-[var(--accent)]" : "bg-[var(--tertiary)]")} style={{ width: `${menuReadiness}%` }} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={refreshMenu} disabled={isRefreshing} className="h-10 flex-1 shadow-none hover:shadow-none">
                <RefreshCw size={15} className={isRefreshing ? "animate-spin" : undefined} />
                Làm mới
              </Button>
              <Button type="button" onClick={() => openPanel("createItem")} className="h-10 flex-1 shadow-none hover:shadow-none">
                <Plus size={15} />
                Thêm món
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-menu-metric-grid grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <DashboardMetricCard icon={Utensils} label="Tổng món" value={items.length} meta={`${availableItems} đang bán, ${pausedItems} tạm hết`} tone={pausedItems ? "yellow" : "green"} />
        <DashboardMetricCard icon={Flame} label="Bán chạy" value={topItemIds.length} meta={topItemNames[0] ?? "Chưa có dữ liệu bán"} tone={topItemIds.length ? "green" : "yellow"} />
        <DashboardMetricCard icon={ImageIcon} label="Thiếu ảnh" value={missingImageItems} meta={missingImageItems ? "Nên bổ sung ảnh vuông cho menu mobile" : "Ảnh món đã đủ"} tone={missingImageItems ? "yellow" : "green"} />
        <DashboardMetricCard icon={SlidersHorizontal} label="Topping" value={modifierGroupCount} meta={`${itemsWithModifiers} món có tùy chọn`} tone={modifierGroupCount ? "green" : "yellow"} />
        <DashboardMetricCard icon={BarChart3} label="Giá TB" value={formatVnd(averagePrice)} meta={`${categories.length} danh mục đang quản lý`} tone="blue" />
      </section>

      <section className="dashboard-panel dashboard-menu-panel p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="dashboard-eyebrow text-[var(--muted-foreground)]">Menu operations</p>
            <h2 className="dashboard-section-title mt-1">Danh sách món đang quản lý</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {availableItems} món đang bán · {pausedItems} món tạm hết · {categories.length} danh mục
            </p>
          </div>
          <div className="dashboard-menu-toolbar flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="h-10 shadow-none hover:shadow-none" onClick={() => openPanel("stats")}>
              <BarChart3 size={16} />
              Tổng quan
            </Button>
            <Button type="button" variant="secondary" className="h-10 shadow-none hover:shadow-none" onClick={() => openPanel("aiOcr")}>
              <Sparkles size={16} />
              Nhập menu nhanh
            </Button>
            <Button type="button" variant="secondary" className="h-10 shadow-none hover:shadow-none" onClick={() => openPanel("createCategory")}>
              <Tags size={16} />
              Thêm danh mục
            </Button>
            <Button type="button" className="h-10 shadow-none hover:shadow-none" onClick={() => openPanel("createItem")}>
              <Plus size={16} />
              Thêm món
            </Button>
          </div>
        </div>

        <div className="dashboard-menu-filter-grid mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_210px_190px]">
            <label className="relative grid gap-1 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
              Tìm món
              <Search className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-[var(--outline)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tên món hoặc danh mục..."
                className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-10 pr-3 text-sm font-medium normal-case tracking-normal outline-none focus:border-[var(--primary)]"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
              Danh mục
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold normal-case tracking-normal outline-none">
                <option value="all">Tất cả danh mục</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
              Trạng thái
              <select value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value as AvailabilityFilter)} className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold normal-case tracking-normal outline-none">
                <option value="all">Tất cả</option>
                <option value="available">Đang bán</option>
                <option value="paused">Tạm hết</option>
              </select>
            </label>
        </div>

        <div className="dashboard-menu-insight-grid mb-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Layers3 size={16} className="text-[var(--primary)]" />
                <h3 className="text-sm font-semibold text-[var(--foreground)]">Danh mục & độ phủ</h3>
              </div>
              <Badge tone={categories.length ? "green" : "yellow"}>{categories.length || "Chưa có"}</Badge>
            </div>
            {categoryHealth.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm font-semibold text-[var(--muted-foreground)]">
                Chưa có danh mục. Tạo danh mục trước để menu khách dễ quét và bếp dễ đọc.
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                {categoryHealth.map((category) => {
                  const activeRate = Math.round((category.active / Math.max(category.total, 1)) * 100);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setCategoryFilter(category.id)}
                      className={cn(
                        "rounded-lg border bg-[var(--surface)] p-3 text-left transition hover:border-[var(--primary)]",
                        categoryFilter === category.id ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/15" : "border-[var(--border)]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-[var(--foreground)]">{category.name}</p>
                        <span className="text-xs font-semibold text-[var(--primary)]">{category.active}/{category.total}</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-container-high)]">
                        <div className={cn("h-full rounded-full", category.paused ? "bg-[var(--accent)]" : "bg-[var(--primary)]")} style={{ width: `${activeRate}%` }} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-[var(--muted-foreground)]">
                        <span>{activeRate}% đang bán</span>
                        {category.missingImage ? <span className="text-[var(--accent-strong)]">{category.missingImage} thiếu ảnh</span> : null}
                        {category.paused ? <span>{category.paused} tạm hết</span> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className={menuActionQueue.length ? "text-[var(--accent)]" : "text-[var(--primary)]"} />
                <h3 className="text-sm font-semibold text-[var(--foreground)]">Cần hoàn thiện</h3>
              </div>
              <Badge tone={menuActionQueue.length ? "yellow" : "green"}>{menuActionQueue.length || "Ổn"}</Badge>
            </div>
            <div className="grid gap-2">
              {menuActionQueue.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-4 text-sm font-semibold text-[var(--muted-foreground)]">
                  Menu đã đủ trạng thái cơ bản. Có thể tập trung tối ưu giá, combo và upsell.
                </div>
              ) : (
                menuActionQueue.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => openPanel("editItem", item.itemId)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-left transition hover:border-[var(--primary)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-[var(--foreground)]">{item.label}</span>
                      <Badge tone={item.tone}>{item.tone === "yellow" ? "Tạm hết" : "Thiếu ảnh"}</Badge>
                    </div>
                    <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">{item.meta}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="dashboard-menu-category-rail mb-3 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={`h-11 shrink-0 rounded-lg border px-3 text-sm font-semibold ${categoryFilter === "all" ? "border-[var(--primary)]/20 bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]"}`}
          >
            Tất cả ({items.length})
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setCategoryFilter(category.id)}
              className={`h-11 shrink-0 rounded-lg border px-3 text-sm font-semibold ${categoryFilter === category.id ? "border-[var(--primary)]/20 bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]"}`}
            >
              {category.name} ({category.items.length})
            </button>
          ))}
        </div>

        <div className="dashboard-menu-table overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--surface)]">
          <div className="dashboard-muted-header grid grid-cols-[64px_minmax(220px,1.5fr)_minmax(120px,0.7fr)_120px_120px_180px] gap-3 px-4 py-3 text-xs font-semibold uppercase max-lg:hidden">
            <span>Ảnh</span>
            <span>Món ăn</span>
            <span>Danh mục</span>
            <span>Giá bán</span>
            <span>Trạng thái</span>
            <span>Thao tác</span>
          </div>
          <div className="dashboard-menu-item-list divide-y divide-[var(--border)]">
            {filteredItems.length === 0 && (
              <div className="grid min-h-48 place-items-center px-5 py-8 text-sm font-semibold text-[var(--muted-foreground)]">
                Không có món phù hợp với {activeCategoryName.toLowerCase()}.
              </div>
            )}
            {filteredItems.map((item, index) => {
              const isSelected = panelMode === "editItem" && selectedItem?.id === item.id;
              return (
                <article
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openPanel("editItem", item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") openPanel("editItem", item.id);
                  }}
                  className={`dashboard-menu-item-row dashboard-selectable-row grid cursor-pointer gap-3 px-4 py-3 text-left lg:grid-cols-[64px_minmax(220px,1.5fr)_minmax(120px,0.7fr)_120px_120px_180px] ${isSelected ? "dashboard-selected-row" : ""}`}
                >
                  <span className="dashboard-menu-image grid h-12 w-12 place-items-center overflow-hidden rounded-lg bg-[var(--soft-surface)]">{renderImage(item, 48)}</span>
                  <span className="dashboard-menu-name min-w-0">
                    <span className="block truncate text-sm font-semibold">{item.name}</span>
                    <span className="font-mono text-xs font-medium text-[var(--muted-foreground)]">Mã: CF{String(index + 1).padStart(3, "0")}</span>
                    {topIdSet.has(item.id) ? <span className="mt-1 block text-xs font-semibold text-[var(--accent)]">Bán chạy</span> : null}
                    {(item.modifierGroups?.length ?? 0) > 0 ? (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--primary)]">
                        <SlidersHorizontal size={12} />
                        {item.modifierGroups?.length} nhóm tùy chọn
                      </span>
                    ) : null}
                  </span>
                  <span className="dashboard-menu-field text-sm font-medium" data-label="Danh mục">{item.categoryName}</span>
                  <span className="dashboard-menu-field metric-number text-sm font-semibold" data-label="Giá bán">{formatVnd(item.price)}</span>
                  <span className="dashboard-menu-field" data-label="Trạng thái"><Badge tone={item.is_available ? "green" : "yellow"}>{item.is_available ? "Đang bán" : "Tạm hết"}</Badge></span>
                  <span className="dashboard-menu-actions flex flex-wrap gap-2" data-label="Thao tác" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => openPanel("editItem", item.id)}
                      className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-3 text-xs font-semibold text-[var(--foreground)]"
                    >
                      <Pencil size={14} />
                      Sửa
                    </button>
                    <form action={toggleMenuItemAvailabilityAction}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="isAvailable" value={String(!item.is_available)} />
                      <button className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-3 text-xs font-semibold text-[var(--foreground)]" aria-label="Đổi trạng thái">
                        {item.is_available ? <EyeOff size={14} /> : <Eye size={14} />}
                        {item.is_available ? "Tạm hết" : "Bật bán"}
                      </button>
                    </form>
                  </span>
                </article>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">
            <span>Đang hiển thị {filteredItems.length} / {items.length} món</span>
            <span>{activeCategoryName}</span>
          </div>
        </div>
      </section>

      {panelMode !== "closed" && (
        <div className="fixed inset-0 z-[var(--z-dashboard-drawer)] overflow-hidden overscroll-contain">
          <button type="button" className="drawer-backdrop absolute inset-0 z-0" aria-label="Đóng bảng nổi" onClick={closePanel} />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-workspace-drawer-title"
            className="drawer-panel absolute inset-y-0 right-0 z-[1] flex h-dvh max-h-dvh w-full max-w-[460px] flex-col border-l border-[var(--border)] bg-[var(--surface)]"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5 sm:py-4">
              <div>
                <p className="dashboard-eyebrow text-[var(--muted-foreground)]">Menu</p>
                <h3 id="menu-workspace-drawer-title" className="dashboard-section-title mt-1">
                  {panelMode === "stats" && "Tổng quan menu"}
                  {panelMode === "aiOcr" && "Nhập menu nhanh"}
                  {panelMode === "createCategory" && "Thêm danh mục"}
                  {panelMode === "createItem" && "Thêm món mới"}
                  {panelMode === "editItem" && (selectedItem?.name ?? "Sửa món")}
                </h3>
              </div>
              <button type="button" onClick={closePanel} className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] text-[var(--muted-foreground)]" aria-label="Đóng bảng nổi">
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-5">
              {uploadError ? (
                <div role="alert" className="mb-4 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-4 py-3 text-sm font-semibold text-[var(--accent-strong)]">
                  {uploadError}
                </div>
              ) : null}

              {panelMode === "stats" && (
                <div className="grid gap-4">
                  <section className="grid gap-3 sm:grid-cols-2">
                    {stats.map((stat) => {
                      const Icon = stat.icon;
                      return (
                        <div key={stat.label} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                          <span className="dashboard-stat-icon bg-[var(--soft-surface)]"><Icon size={18} /></span>
                          <p className="mt-3 text-xs font-semibold uppercase text-[var(--muted-foreground)]">{stat.label}</p>
                          <p className="metric-number mt-1 text-2xl font-semibold text-[var(--foreground)]">{stat.value}</p>
                          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{stat.meta}</p>
                        </div>
                      );
                    })}
                  </section>
                  <section className="rounded-xl border border-[var(--border)] p-4">
                    <h4 className="text-sm font-semibold text-[var(--foreground)]">Món bán chạy</h4>
                    <div className="mt-3 grid gap-2">
                      {topMenuItems.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-3 text-sm text-[var(--muted-foreground)]">Chưa có dữ liệu bán chạy thật.</p>
                      ) : (
                        topMenuItems.map((item) => (
                          <button key={item.id} type="button" onClick={() => openPanel("editItem", item.id)} className="flex min-h-11 items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-left">
                            <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-lg bg-[var(--soft-surface)]">{renderImage(item, 40)}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">{item.name}</span>
                              <span className="metric-number text-xs text-[var(--muted-foreground)]">{formatVnd(item.price)}</span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </section>
                </div>
              )}

              {panelMode === "aiOcr" && (
                <div className="grid gap-4">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                    <div className="flex items-start gap-3">
                      <span className="dashboard-stat-icon bg-[var(--soft-surface)]">
                        <Sparkles size={18} />
                      </span>
                      <div>
                        <h4 className="text-sm font-semibold text-[var(--foreground)]">Nhập menu từ ảnh hoặc nội dung cũ</h4>
                        <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                          Dán nội dung menu cũ hoặc tải ảnh chụp menu. LogiVN sẽ chuẩn hóa thành danh mục, món và giá để chủ quán kiểm tra trước khi lưu.
                        </p>
                      </div>
                    </div>
                  </div>
                  <label className="grid gap-2 text-sm font-semibold">
                    Ảnh menu giấy
                    <Input
                      type="file"
                      accept={menuImageAccept}
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        const validationError = file ? getImageValidationError(file) : null;
                        setAiOcrError(validationError);
                        setAiOcrImage(validationError ? null : file);
                      }}
                    />
                    <span className="text-xs font-semibold text-[var(--muted-foreground)]">Có thể tải ảnh chụp menu hoặc dán nội dung menu cũ bên dưới.</span>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Nội dung menu cần chuẩn hoá
                    <textarea
                      value={aiOcrText}
                      onChange={(event) => setAiOcrText(event.target.value)}
                      placeholder={"VD:\nCÀ PHÊ\nCà phê đen đá 25000\nBạc xỉu 35000\nTRÀ\nTrà đào cam sả 39000"}
                      className="min-h-48 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm font-medium outline-none focus:border-[var(--primary)]"
                    />
                  </label>
                  {aiOcrError ? (
                    <div className="rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-4 py-3 text-sm font-semibold text-[var(--accent-strong)]">{aiOcrError}</div>
                  ) : null}
                  {ocrImportState?.success ? (
                    <div
                      role="status"
                      className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                        (ocrImportState.inserted ?? 0) > 0
                          ? "border-[var(--primary)]/20 bg-[var(--primary-soft)] text-[var(--primary-strong)]"
                          : "border-[var(--accent)]/20 bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                      }`}
                    >
                      {ocrImportState.success}
                      {ocrImportState.skippedNames?.length ? (
                        <span className="mt-1 block text-xs font-semibold opacity-80">
                          Món trùng: {ocrImportState.skippedNames.slice(0, 5).join(", ")}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {ocrImportState?.error ? (
                    <div role="alert" className="rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-4 py-3 text-sm font-semibold text-[var(--accent-strong)]">
                      {ocrImportState.error}
                    </div>
                  ) : null}
                  <Button type="button" onClick={() => void runAiMenuOcr()} disabled={aiOcrLoading || (!aiOcrText.trim() && !aiOcrImage)} className="shadow-none hover:shadow-none">
                    {aiOcrLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {aiOcrLoading ? "Đang đọc menu..." : aiOcrImage ? "Đọc ảnh menu" : "Chuẩn hoá menu"}
                  </Button>
                  {aiOcrImportItems.length > 0 ? (
                    <div className="grid gap-3 rounded-xl border border-[var(--primary)]/20 bg-[var(--soft-surface)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-[var(--foreground)]">Đã tách được {aiOcrImportItems.length} món</h4>
                          <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">
                            Độ tin cậy {Math.round((aiOcrDraft?.confidence ?? 0) * 100)}%. Chủ quán kiểm tra nhanh rồi bấm xác nhận để thêm vào menu thật.
                          </p>
                        </div>
                        <Badge tone="green">Bản nháp</Badge>
                      </div>
                      <div className="max-h-72 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                        {aiOcrImportRows.map((item) => (
                          <div key={`${item.categoryName}-${item.name}`} className="grid grid-cols-[minmax(0,1fr)_92px] gap-3 border-b border-[var(--border)] px-3 py-2 last:border-b-0">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[var(--foreground)]">{item.name}</p>
                              <p className="text-xs font-medium text-[var(--muted-foreground)]">
                                {item.categoryName}
                                {item.isDuplicate ? <span className="ml-2 font-semibold text-[var(--accent)]">Đã có, sẽ bỏ qua</span> : null}
                              </p>
                            </div>
                            <p className="metric-number text-right text-sm font-semibold">{formatVnd(item.price)}</p>
                          </div>
                        ))}
                      </div>
                      {aiOcrDraft?.warnings?.length ? (
                        <div className="rounded-lg border border-[var(--accent)]/20 bg-[var(--accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--accent-strong)]">
                          {aiOcrDraft.warnings.slice(0, 2).join(" · ")}
                        </div>
                      ) : null}
                      <form action={importOcrFormAction}>
                        <input type="hidden" name="itemsJson" value={aiOcrImportItemsJson} />
                        <Button disabled={ocrImportPending || newOcrItemCount === 0} className="w-full shadow-none hover:shadow-none">
                          {ocrImportPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                          {ocrImportPending
                            ? "Đang nhập vào menu..."
                            : newOcrItemCount === 0
                              ? "Tất cả món đã có trong menu"
                              : `Nhập ${newOcrItemCount} món mới vào menu`}
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </div>
              )}

              {panelMode === "createCategory" && (
                <form action={createCategoryAction} className="grid gap-4">
                  <label className="grid gap-2 text-sm font-semibold">
                    Tên danh mục
                    <Input name="name" placeholder="VD: Cà phê, Trà sữa, Món ăn nhẹ" required />
                  </label>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                    <h4 className="text-sm font-semibold text-[var(--foreground)]">Danh mục hiện có</h4>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {categories.map((category) => (
                        <Badge key={category.id}>{category.name} · {category.items.length}</Badge>
                      ))}
                    </div>
                  </div>
                  <Button className="shadow-none hover:shadow-none">
                    <Plus size={16} />
                    Tạo danh mục
                  </Button>
                </form>
              )}

              {panelMode === "createItem" && (
                <form action={createMenuItemAction} onSubmit={handleMenuFormSubmit} className="grid gap-4">
                  <input type="hidden" name="image" defaultValue="" />
                  <label className="grid gap-2 text-sm font-semibold">
                    Danh mục
                    <select name="categoryId" className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none" required>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Tên món
                    <Input name="name" placeholder="Cà phê sữa đá" required />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Giá bán
                    <Input name="price" type="number" min={1000} step={1000} placeholder="35000" required />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Ảnh món
                    <Input name="imageFile" type="file" accept={menuImageAccept} />
                    <span className="text-xs font-semibold text-[var(--muted-foreground)]">JPG/PNG/WebP tối đa 5MB. Khuyến nghị 1200x1200px, món nằm giữa khung để đẹp trên menu mobile.</span>
                  </label>
                  {renderAiFoodImageAssistant("create")}
                  <Button disabled={uploadingImage} className="shadow-none hover:shadow-none">
                    <Plus size={16} />
                    {uploadingImage ? "Đang tải ảnh..." : "Thêm món"}
                  </Button>
                </form>
              )}

              {panelMode === "editItem" && selectedItem && (
                <div key={selectedItem.id} className="grid gap-4">
                <form action={updateMenuItemAction} onSubmit={handleMenuFormSubmit} className="grid gap-4">
                  <input type="hidden" name="itemId" value={selectedItem.id} />
                  <input type="hidden" name="image" defaultValue="" />
                  <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                    <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-xl bg-[var(--soft-surface)]">{renderImage(selectedItem, 80)}</div>
                    <div className="min-w-0">
                      <h3 className="truncate text-xl font-semibold text-[var(--foreground)]">{selectedItem.name}</h3>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{selectedItem.categoryName}</p>
                      <Badge tone={selectedItem.is_available ? "green" : "yellow"}>{selectedItem.is_available ? "Đang bán" : "Tạm hết"}</Badge>
                    </div>
                  </div>
                  <label className="grid gap-2 text-sm font-semibold">
                    Tên món
                    <Input name="name" defaultValue={selectedItem.name} required />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Danh mục
                    <select name="categoryId" defaultValue={selectedItem.category_id} className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none">
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Giá bán
                    <Input name="price" type="number" min={1000} step={1000} defaultValue={selectedItem.price} required />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Hình ảnh món
                    <Input name="imageFile" type="file" accept={menuImageAccept} />
                    <span className="text-xs font-semibold text-[var(--muted-foreground)]">Chọn ảnh mới để thay ảnh hiện tại. Khuyến nghị 1200x1200px, JPG/WebP dưới 1MB để menu khách tải nhanh trên điện thoại.</span>
                  </label>
                  {renderAiFoodImageAssistant("edit", selectedItem)}
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" name="isAvailable" value="true" defaultChecked={selectedItem.is_available} className="h-4 w-4 accent-[var(--primary)]" />
                    Đang bán trên menu khách
                  </label>
                  <div className="grid gap-2 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
                    <Button type="submit" disabled={uploadingImage} className="shadow-none hover:shadow-none">
                      <Save size={16} />
                      {uploadingImage ? "Đang tải ảnh..." : "Lưu thay đổi"}
                    </Button>
                    <ConfirmActionButton
                      formAction={deleteMenuItemAction}
                      data-skip-image-upload="true"
                      disabled={uploadingImage}
                      variant="danger"
                      className="shadow-none hover:shadow-none"
                      confirmTitle="Xoá món khỏi menu"
                      confirmDescription={`Món "${selectedItem.name}" sẽ bị xoá khỏi menu. Thao tác này không nên dùng nếu món vẫn còn trong dữ liệu vận hành.`}
                      confirmLabel="Xoá món"
                    >
                      <Trash2 size={16} />
                      Xoá món
                    </ConfirmActionButton>
                  </div>
                </form>
                {renderModifierManager(selectedItem)}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

    </div>
  );
}

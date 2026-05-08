"use client";

import Image from "next/image";
import { useMemo, useState, type FormEvent } from "react";
import { BarChart3, Eye, EyeOff, Flame, ImageIcon, Loader2, Pencil, Plus, Save, Search, Sparkles, Tags, TimerReset, Trash2, Utensils, X } from "lucide-react";
import {
  createCategoryAction,
  createMenuItemAction,
  deleteMenuItemAction,
  toggleMenuItemAvailabilityAction,
  updateMenuItemAction
} from "@/app/dashboard/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatVnd } from "@/lib/money";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { AdminMenuCategory, AdminMenuItem } from "@/services/menu-service";

type MenuItemWithCategory = AdminMenuItem & { categoryName: string };
type AvailabilityFilter = "all" | "available" | "paused";
type MenuPanelMode = "closed" | "stats" | "aiOcr" | "createCategory" | "createItem" | "editItem";

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

export function MenuWorkspace({
  categories,
  topItemIds,
  topItemNames
}: {
  categories: AdminMenuCategory[];
  topItemIds: string[];
  topItemNames: string[];
}) {
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
  const [aiOcrResult, setAiOcrResult] = useState<string>("");
  const [aiOcrError, setAiOcrError] = useState<string | null>(null);
  const [aiOcrLoading, setAiOcrLoading] = useState(false);

  const selectedItem = selectedItemId ? items.find((item) => item.id === selectedItemId) ?? null : null;
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
  const stats = [
    { label: "Tổng món đang bán", value: availableItems, meta: "Đang hiển thị với khách", icon: Sparkles, tone: "orange" },
    { label: "Món bán chạy", value: topItemIds.length, meta: topItemNames[0] ?? "Chưa có dữ liệu bán", icon: Flame, tone: "orange" },
    { label: "Món tạm hết", value: pausedItems, meta: "Không hiển thị trên menu khách", icon: TimerReset, tone: "red" },
    { label: "Danh mục", value: categories.length, meta: categories.map((category) => category.name).slice(0, 3).join(", ") || "Chưa có", icon: Utensils, tone: "green" }
  ];

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
    if (itemId) setSelectedItemId(itemId);
    if (mode === "createItem" || mode === "createCategory" || mode === "stats") setSelectedItemId(null);
    setPanelMode(mode);
  }

  function closePanel() {
    setPanelMode("closed");
    setUploadError(null);
    setUploadingImage(false);
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
    setAiOcrResult("");
    try {
      const imageBase64 = aiOcrImage ? await fileToBase64(aiOcrImage) : undefined;
      const response = await fetch("/api/admin/ai/menu-ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rawText: rawText || undefined, imageBase64 })
      });
      const result = (await response.json().catch(() => null)) as ApiResponse<{ text?: string; data?: unknown }> | null;
      if (!result || !result.ok) throw new Error(result?.error || "AI chưa đọc được menu.");
      setAiOcrResult(JSON.stringify(result.data.data ?? result.data.text ?? {}, null, 2));
    } catch (error) {
      setAiOcrError(error instanceof Error ? error.message : "Không chạy được AI nhập menu.");
    } finally {
      setAiOcrLoading(false);
    }
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
    const file = fileInput?.files?.[0];
    if (!file) return;

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
      const imageInput = form.elements.namedItem("image") as HTMLInputElement | null;
      if (imageInput) imageInput.value = publicUrl;
      if (fileInput) fileInput.value = "";
      form.dataset.imageUploadReady = "true";
      form.requestSubmit();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Không tải được ảnh món. Vui lòng thử lại.");
      setUploadingImage(false);
    }
  }

  const topMenuItems = items.filter((item) => topIdSet.has(item.id)).slice(0, 5);
  const activeCategoryName = categoryFilter === "all" ? "Tất cả danh mục" : categories.find((category) => category.id === categoryFilter)?.name ?? "Danh mục";

  return (
    <div className="grid gap-3">
      <section className="dashboard-panel p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Menu operations</p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--foreground)]">Danh sách món đang quản lý</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {availableItems} món đang bán · {pausedItems} món tạm hết · {categories.length} danh mục
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="h-10 shadow-none hover:shadow-none" onClick={() => openPanel("stats")}>
              <BarChart3 size={16} />
              Tổng quan
            </Button>
            <Button type="button" variant="secondary" className="h-10 shadow-none hover:shadow-none" onClick={() => openPanel("aiOcr")}>
              <Sparkles size={16} />
              AI nhập menu
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

        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_210px_190px]">
            <label className="relative grid gap-1 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
              Tìm món
              <Search className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-[var(--outline)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tên món hoặc danh mục..."
                className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-10 pr-3 text-sm font-medium normal-case tracking-normal outline-none focus:border-[var(--primary)]"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
              Danh mục
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold normal-case tracking-normal outline-none">
                <option value="all">Tất cả danh mục</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
              Trạng thái
              <select value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value as AvailabilityFilter)} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold normal-case tracking-normal outline-none">
                <option value="all">Tất cả</option>
                <option value="available">Đang bán</option>
                <option value="paused">Tạm hết</option>
              </select>
            </label>
        </div>

        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={`h-9 shrink-0 rounded-lg border px-3 text-sm font-semibold ${categoryFilter === "all" ? "border-[rgba(52,211,153,0.2)] bg-[rgba(52,211,153,0.1)] text-[var(--primary)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]"}`}
          >
            Tất cả ({items.length})
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setCategoryFilter(category.id)}
              className={`h-9 shrink-0 rounded-lg border px-3 text-sm font-semibold ${categoryFilter === category.id ? "border-[rgba(52,211,153,0.2)] bg-[rgba(52,211,153,0.1)] text-[var(--primary)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]"}`}
            >
              {category.name} ({category.items.length})
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--surface)]">
          <div className="dashboard-muted-header grid grid-cols-[64px_minmax(220px,1.5fr)_minmax(120px,0.7fr)_120px_120px_180px] gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-[0.06em] max-lg:hidden">
            <span>Ảnh</span>
            <span>Món ăn</span>
            <span>Danh mục</span>
            <span>Giá bán</span>
            <span>Trạng thái</span>
            <span>Thao tác</span>
          </div>
          <div className="divide-y divide-[var(--border)]">
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
                  className={`dashboard-selectable-row grid cursor-pointer gap-3 px-4 py-3 text-left lg:grid-cols-[64px_minmax(220px,1.5fr)_minmax(120px,0.7fr)_120px_120px_180px] ${isSelected ? "dashboard-selected-row" : ""}`}
                >
                  <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-lg bg-[var(--soft-surface)]">{renderImage(item, 48)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{item.name}</span>
                    <span className="font-mono text-xs font-medium text-[var(--muted-foreground)]">Mã: CF{String(index + 1).padStart(3, "0")}</span>
                    {topIdSet.has(item.id) ? <span className="mt-1 block text-xs font-semibold text-[var(--accent)]">Bán chạy</span> : null}
                  </span>
                  <span className="text-sm font-medium">{item.categoryName}</span>
                  <span className="metric-number text-sm font-semibold">{formatVnd(item.price)}</span>
                  <span><Badge tone={item.is_available ? "green" : "yellow"}>{item.is_available ? "Đang bán" : "Tạm hết"}</Badge></span>
                  <span className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => openPanel("editItem", item.id)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-3 text-xs font-semibold text-[var(--foreground)]"
                    >
                      <Pencil size={14} />
                      Sửa
                    </button>
                    <form action={toggleMenuItemAvailabilityAction}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="isAvailable" value={String(!item.is_available)} />
                      <button className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-3 text-xs font-semibold text-[var(--foreground)]" aria-label="Đổi trạng thái">
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
        <div className="fixed inset-0 z-[80]">
          <button type="button" className="absolute inset-0 bg-slate-950/24" aria-label="Đóng bảng nổi" onClick={closePanel} />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-[460px] flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-[0_20px_80px_rgba(0,0,0,0.3)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Menu</p>
                <h3 className="mt-1 text-xl font-semibold text-[var(--foreground)]">
                  {panelMode === "stats" && "Tổng quan menu"}
                  {panelMode === "aiOcr" && "AI nhập menu"}
                  {panelMode === "createCategory" && "Thêm danh mục"}
                  {panelMode === "createItem" && "Thêm món mới"}
                  {panelMode === "editItem" && (selectedItem?.name ?? "Sửa món")}
                </h3>
              </div>
              <button type="button" onClick={closePanel} className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] text-[var(--muted-foreground)]">
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {uploadError ? (
                <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
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
                          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">{stat.label}</p>
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
                          <button key={item.id} type="button" onClick={() => openPanel("editItem", item.id)} className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-left">
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
                        <h4 className="text-sm font-semibold text-[var(--foreground)]">Quét OCR menu bằng AI</h4>
                        <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                          Dán nội dung menu cũ hoặc OCR thô. Premium có thể dùng endpoint ảnh để đọc menu thật và chuẩn hóa thành JSON danh mục/món/giá.
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
                    <span className="text-xs font-semibold text-[var(--muted-foreground)]">Có thể tải ảnh chụp menu hoặc dán nội dung OCR thô bên dưới.</span>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Nội dung menu cần AI chuẩn hoá
                    <textarea
                      value={aiOcrText}
                      onChange={(event) => setAiOcrText(event.target.value)}
                      placeholder={"VD:\nCÀ PHÊ\nCà phê đen đá 25000\nBạc xỉu 35000\nTRÀ\nTrà đào cam sả 39000"}
                      className="min-h-48 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm font-medium outline-none focus:border-[var(--primary)]"
                    />
                  </label>
                  {aiOcrError ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{aiOcrError}</div>
                  ) : null}
                  <Button type="button" onClick={() => void runAiMenuOcr()} disabled={aiOcrLoading || (!aiOcrText.trim() && !aiOcrImage)} className="shadow-none hover:shadow-none">
                    {aiOcrLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {aiOcrLoading ? "AI đang đọc menu..." : aiOcrImage ? "Đọc ảnh menu bằng AI" : "Chuẩn hoá bằng AI"}
                  </Button>
                  {aiOcrResult ? (
                    <div className="rounded-xl border border-[var(--border)] bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                      <pre className="max-h-80 overflow-auto whitespace-pre-wrap">{aiOcrResult}</pre>
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
                    <select name="categoryId" className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none" required>
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
                    <span className="text-xs font-semibold text-[var(--muted-foreground)]">Tải ảnh trực tiếp, JPG/PNG/WebP tối đa 5MB.</span>
                  </label>
                  <Button disabled={uploadingImage} className="shadow-none hover:shadow-none">
                    <Plus size={16} />
                    {uploadingImage ? "Đang tải ảnh..." : "Thêm món"}
                  </Button>
                </form>
              )}

              {panelMode === "editItem" && selectedItem && (
                <form key={selectedItem.id} action={updateMenuItemAction} onSubmit={handleMenuFormSubmit} className="grid gap-4">
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
                    <select name="categoryId" defaultValue={selectedItem.category_id} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none">
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
                    <span className="text-xs font-semibold text-[var(--muted-foreground)]">Tải ảnh mới nếu muốn thay ảnh hiện tại.</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" name="isAvailable" value="true" defaultChecked={selectedItem.is_available} className="h-4 w-4 accent-[var(--primary)]" />
                    Đang bán trên menu khách
                  </label>
                  <div className="grid gap-2 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
                    <Button type="submit" disabled={uploadingImage} className="shadow-none hover:shadow-none">
                      <Save size={16} />
                      {uploadingImage ? "Đang tải ảnh..." : "Lưu thay đổi"}
                    </Button>
                    <Button
                      formAction={deleteMenuItemAction}
                      data-skip-image-upload="true"
                      disabled={uploadingImage}
                      variant="danger"
                      className="shadow-none hover:shadow-none"
                      onClick={(event) => {
                        if (!window.confirm(`Xoá món "${selectedItem.name}"?`)) event.preventDefault();
                      }}
                    >
                      <Trash2 size={16} />
                      Xoá món
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </aside>
        </div>
      )}

    </div>
  );
}

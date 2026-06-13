"use client";

/* RealMenuWorkspaceV2 — production /dashboard/menu.
 * Layout: Toolbar + KPI + FilterTabs + grid card + Drawer chi tiết với edit
 * inline (đổi tên/giá/danh mục/ảnh/trạng thái/xoá) + Modal tạo món + Modal
 * tạo danh mục mới. Backend giữ 1:1.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Coffee,
  FolderPlus,
  ImageIcon,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Utensils
} from "lucide-react";
import { MetricCard, Badge, EmptyState, SwitchControl } from "../primitives";
import { FilterTabs, Toolbar } from "../workspace-ui";
import { Button } from "../button";
import { Drawer, Modal } from "../overlay";
import { NextSteps } from "../cross-link";
import { RealtimeStatusBadge } from "../realtime";
import { useDashboardRealtime } from "@/hooks/use-dashboard-realtime";
import { useToast } from "@/components/dashboard/toast-provider";
import {
  createCategoryAction,
  createMenuItemAction,
  deleteMenuItemAction,
  toggleMenuItemAvailabilityAction,
  updateMenuItemAction,
  upsertInventoryRecipeLineAction,
  deleteInventoryRecipeLineAction
} from "@/app/dashboard/actions";
import type { AdminMenuCategory, AdminMenuItem } from "@/services/menu-service";
import type { InventoryIngredient, InventoryRecipeMenuItem } from "@/services/inventory-service";
import { cn } from "@/lib/utils";

function formatVnd(n: number) {
  return `${n.toLocaleString("vi-VN")}₫`;
}

type Props = {
  restaurantId: string;
  categories: AdminMenuCategory[];
  topItemIds: string[];
  topItemNames: string[];
  restaurantName: string;
  ingredients: InventoryIngredient[];
  recipeMenuItems: InventoryRecipeMenuItem[];
};

export function RealMenuWorkspaceV2({ restaurantId, categories, topItemIds, topItemNames, ingredients, recipeMenuItems }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const rtState = useDashboardRealtime({
    restaurantId,
    workspace: "menu",
    tables: [{ table: "menu_items" }, { table: "menu_categories" }]
  });

  const itemsWithCategory = useMemo(
    () =>
      categories.flatMap((c) =>
        c.items.map((item) => ({ ...item, categoryName: c.name }))
      ),
    [categories]
  );

  const visible = useMemo(() => {
    let list = tab === "all" ? itemsWithCategory : itemsWithCategory.filter((i) => i.category_id === tab);
    if (q.trim()) {
      const query = q.trim().toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(query));
    }
    return list;
  }, [itemsWithCategory, tab, q]);

  const selected = selectedId ? itemsWithCategory.find((i) => i.id === selectedId) ?? null : null;
  const availableCount = itemsWithCategory.filter((i) => i.is_available).length;
  const unavailableCount = itemsWithCategory.length - availableCount;
  const avgPrice = itemsWithCategory.length > 0
    ? Math.round(itemsWithCategory.reduce((s, i) => s + i.price, 0) / itemsWithCategory.length)
    : 0;

  function toggleItem(id: string, checked: boolean) {
    const fd = new FormData();
    fd.set("itemId", id);
    fd.set("isAvailable", String(checked));
    startTransition(async () => {
      try {
        await toggleMenuItemAvailabilityAction(fd);
        toast.success(checked ? "Đã bật bán món" : "Đã tạm ngừng bán món");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không cập nhật được trạng thái món");
      }
    });
  }

  function deleteItem(id: string) {
    if (!window.confirm("Xoá món này khỏi menu? Hành động không thể hoàn tác.")) return;
    const fd = new FormData();
    fd.set("itemId", id);
    startTransition(async () => {
      try {
        await deleteMenuItemAction(fd);
        toast.success("Đã xoá món");
        setSelectedId(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không xoá được món");
      }
    });
  }

  function saveItem(fd: FormData) {
    startTransition(async () => {
      try {
        await updateMenuItemAction(fd);
        toast.success("Đã lưu thay đổi");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không lưu được món");
      }
    });
  }

  return (
    <div className="flex flex-col gap-[var(--d-s-5)]">
      <Toolbar eyebrow="Quản lý" title="Menu món">
        <RealtimeStatusBadge state={rtState} />
        <a
          href="/dashboard/ai-menu"
          className="inline-flex h-10 items-center gap-1.5 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-4 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)] transition hover:border-[var(--d-jade)] hover:text-[var(--d-primary)]"
        >
          <Sparkles size={15} /> AI Menu Studio
        </a>
        <Button variant="secondary" size="md" onClick={() => setCreateCategoryOpen(true)}>
          <FolderPlus size={15} /> Thêm danh mục
        </Button>
        <Button variant="primary" size="md" onClick={() => setCreateOpen(true)}>
          <Plus size={15} /> Thêm món
        </Button>
      </Toolbar>

      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        <MetricCard icon={<Utensils size={18} />} label="Tổng món" value={String(itemsWithCategory.length)} helper={`${categories.length} danh mục`} tone="jade" />
        <MetricCard icon={<Coffee size={18} />} label="Đang bán" value={String(availableCount)} helper={`${unavailableCount} tạm hết`} tone="info" />
        <MetricCard icon={<Sparkles size={18} />} label="Best seller" value={String(topItemIds.length)} helper={topItemNames[0] ?? "Chưa có dữ liệu"} tone="orange" />
        <MetricCard icon={<Utensils size={18} />} label="Giá trung bình" value={formatVnd(avgPrice)} helper="Giá niêm yết" tone="neutral" />
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "all", label: "Tất cả", count: itemsWithCategory.length },
            ...categories.map((c) => ({ key: c.id, label: c.name, count: c.items.length }))
          ]}
        />
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--d-text-faint)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm món..."
            className="h-10 w-56 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] pl-9 pr-3 text-[length:var(--d-fs-sm)] outline-none transition focus:border-[var(--d-jade)]"
          />
        </div>
      </section>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Search size={20} />}
          title={q.trim() ? "Không tìm thấy món nào khớp" : "Chưa có món nào"}
          description={q.trim() ? "Đổi từ khoá hoặc đổi danh mục lọc." : "Bấm Thêm món để bắt đầu xây menu."}
          action={!q.trim() ? <Button variant="primary" size="md" onClick={() => setCreateOpen(true)}><Plus size={15} /> Thêm món đầu tiên</Button> : null}
        />
      ) : (
        <section className="grid gap-[var(--d-s-3)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((item) => (
            <MenuCard
              key={item.id}
              item={item}
              isTop={topItemIds.includes(item.id)}
              pending={pending}
              onOpen={() => setSelectedId(item.id)}
              onToggle={(v) => toggleItem(item.id, v)}
            />
          ))}
        </section>
      )}

      {selected ? (
        <MenuItemDrawer
          item={selected}
          categories={categories}
          ingredients={ingredients}
          recipeLines={recipeMenuItems.find((r) => r.id === selected.id)?.recipeLines ?? []}
          recipeSummary={recipeMenuItems.find((r) => r.id === selected.id) ?? null}
          pending={pending}
          onClose={() => setSelectedId(null)}
          onToggle={(v) => toggleItem(selected.id, v)}
          onSave={saveItem}
          onDelete={() => deleteItem(selected.id)}
          onRefresh={() => router.refresh()}
        />
      ) : null}

      <CreateMenuItemModal
        open={createOpen}
        categories={categories}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          router.refresh();
          toast.success("Đã thêm món mới");
        }}
        onError={(msg) => toast.error(msg)}
      />

      <CreateCategoryModal
        open={createCategoryOpen}
        onClose={() => setCreateCategoryOpen(false)}
        onCreated={() => {
          setCreateCategoryOpen(false);
          router.refresh();
          toast.success("Đã thêm danh mục");
        }}
        onError={(msg) => toast.error(msg)}
      />

      <NextSteps
        items={[
          { href: "/dashboard/inventory", label: "Kho nguyên liệu", hint: "Liên kết công thức", icon: <Coffee size={14} /> },
          { href: "/dashboard/promotions", label: "Khuyến mãi", hint: "Tạo combo & ưu đãi", icon: <Sparkles size={14} /> },
          { href: "/dashboard/ai-menu", label: "AI Menu Studio", hint: "Tối ưu menu bằng AI", icon: <Sparkles size={14} /> },
          { href: "/dashboard/online", label: "Bán online", hint: "Hiển thị menu cho khách", icon: <Utensils size={14} /> }
        ]}
      />
    </div>
  );
}

function MenuCard({
  item,
  isTop,
  pending,
  onOpen,
  onToggle
}: {
  item: AdminMenuItem & { categoryName: string };
  isTop: boolean;
  pending: boolean;
  onOpen: () => void;
  onToggle: (checked: boolean) => void;
}) {
  const available = item.is_available;
  return (
    <article className="flex flex-col overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--d-sh-md)]">
      <button type="button" onClick={onOpen} className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-[var(--d-surface-2)]">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-[var(--d-text-faint)]">
            <ImageIcon size={32} />
            <span className="text-[length:var(--d-fs-2xs)] font-semibold">Chưa có ảnh</span>
          </div>
        )}
        {isTop ? (
          <span className="absolute left-2 top-2">
            <Badge tone="orange">
              <Sparkles size={10} className="mr-1 inline" /> Hot
            </Badge>
          </span>
        ) : null}
        {!available ? (
          <span className="absolute inset-0 grid place-items-center bg-[var(--d-surface)]/75 text-[length:var(--d-fs-sm)] font-bold uppercase text-[var(--d-text-muted)]">
            Tạm hết
          </span>
        ) : null}
      </button>
      <div className="flex flex-1 flex-col gap-2 p-[var(--d-s-3)]">
        <button
          type="button"
          onClick={onOpen}
          className="line-clamp-1 text-left text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)] hover:text-[var(--d-primary)]"
        >
          {item.name}
        </button>
        <p className="d-num text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{formatVnd(item.price)}</p>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--d-line)] pt-2">
          <span className="truncate text-[length:var(--d-fs-2xs)] font-semibold text-[var(--d-text-faint)]">{item.categoryName}</span>
          <SwitchControl
            checked={available}
            onChange={onToggle}
            label={available ? "Bán" : "Tắt"}
            disabled={pending}
            className="h-7 min-w-[70px]"
          />
        </div>
      </div>
    </article>
  );
}

function MenuItemDrawer({
  item,
  categories,
  ingredients,
  recipeLines,
  recipeSummary,
  pending,
  onClose,
  onToggle,
  onSave,
  onDelete,
  onRefresh
}: {
  item: AdminMenuItem & { categoryName: string };
  categories: AdminMenuCategory[];
  ingredients: InventoryIngredient[];
  recipeLines: InventoryRecipeMenuItem["recipeLines"];
  recipeSummary: InventoryRecipeMenuItem | null;
  pending: boolean;
  onClose: () => void;
  onToggle: (v: boolean) => void;
  onSave: (fd: FormData) => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const available = item.is_available;
  const [tab, setTab] = useState<"detail" | "recipe">("detail");
  const [editingImage, setEditingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const formId = `menu-edit-${item.id}`;

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    setRemoveExisting(false);
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={item.name}
      subtitle="Chi tiết & sửa nhanh"
      headerMeta={
        <>
          <Badge tone={available ? "ok" : "neutral"}>{available ? "Đang bán" : "Tạm hết"}</Badge>
          <Badge tone="neutral">{item.categoryName}</Badge>
          {item.modifierGroups && item.modifierGroups.length > 0 ? (
            <Badge tone="info">{item.modifierGroups.length} nhóm modifier</Badge>
          ) : null}
          {recipeLines.length > 0 ? (
            <Badge tone={recipeSummary && recipeSummary.recipeCostPercent > 45 ? "orange" : "info"}>
              Vốn {recipeSummary?.recipeCostPercent.toFixed(0) ?? 0}%
            </Badge>
          ) : null}
        </>
      }
      footer={
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" size="lg" onClick={onDelete} disabled={pending}>
            <Trash2 size={14} /> Xoá món
          </Button>
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => onToggle(!available)} disabled={pending}>
            {available ? "Tạm ngừng bán" : "Bật bán"}
          </Button>
          {tab === "detail" ? (
            <Button type="submit" form={formId} variant="primary" size="lg" className="flex-[2]" disabled={pending}>
              {pending ? "Đang lưu…" : "Lưu thay đổi"}
            </Button>
          ) : (
            <Button type="button" variant="primary" size="lg" className="flex-[2]" onClick={() => setTab("detail")}>
              Quay lại Chi tiết
            </Button>
          )}
        </div>
      }
    >
      <FilterTabs
        active={tab}
        onChange={(k) => setTab(k as typeof tab)}
        tabs={[
          { key: "detail", label: "Chi tiết" },
          { key: "recipe", label: "Công thức", count: recipeLines.length || undefined }
        ]}
      />

      {tab === "recipe" ? (
        <RecipePanel
          itemId={item.id}
          itemPrice={item.price}
          recipeLines={recipeLines}
          recipeSummary={recipeSummary}
          ingredients={ingredients}
          onRefresh={onRefresh}
        />
      ) : null}

      {tab === "detail" ? (
      <form
        id={formId}
        action={(fd) => onSave(fd)}
        className="flex flex-col gap-[var(--d-s-4)]"
        encType="multipart/form-data"
      >
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="isAvailable" value={String(available)} />
        <input type="hidden" name="image" value={removeExisting ? "" : item.image_url ?? ""} />

        {/* Image upload */}
        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
          <div className="flex items-start justify-between gap-2">
            <p className="d-eyebrow">Ảnh món</p>
            <button
              type="button"
              onClick={() => setEditingImage((v) => !v)}
              className="text-[length:var(--d-fs-xs)] font-bold text-[var(--d-primary)] hover:underline"
            >
              {editingImage ? "Đóng panel" : "Đổi ảnh"}
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div className="grid aspect-square place-items-center overflow-hidden rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)]">
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePreview} alt="" className="h-full w-full object-cover" />
              ) : !removeExisting && item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-[var(--d-text-faint)]">
                  <ImageIcon size={32} />
                  <span className="text-[length:var(--d-fs-2xs)] font-semibold">Không ảnh</span>
                </div>
              )}
            </div>
            <div className="grid gap-2">
              {editingImage ? (
                <>
                  <label className="flex h-10 cursor-pointer items-center gap-2 rounded-[var(--d-r-md)] border border-dashed border-[var(--d-jade)]/40 bg-[var(--d-surface-2)] px-3 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)] transition hover:bg-[var(--d-primary-soft)]">
                    <Upload size={14} className="text-[var(--d-primary)]" />
                    Tải ảnh mới (PNG/JPG/WebP)
                    <input
                      name="imageFile"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={onFileChange}
                      className="hidden"
                    />
                  </label>
                  {(imagePreview || item.image_url) ? (
                    <label className="flex h-9 items-center gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">
                      <input
                        type="checkbox"
                        checked={removeExisting}
                        onChange={(e) => {
                          setRemoveExisting(e.target.checked);
                          if (e.target.checked) setImagePreview(null);
                        }}
                        className="h-4 w-4 accent-[var(--d-orange)]"
                      />
                      Gỡ ảnh hiện tại (lưu menu không có ảnh)
                    </label>
                  ) : null}
                  <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Tỉ lệ vuông 1:1 hoặc 4:3 hiển thị tối ưu trên menu khách. Tối đa ~5MB.</p>
                </>
              ) : (
                <p className="text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">
                  {item.image_url ? "Đã có ảnh — bấm \"Đổi ảnh\" để tải mới hoặc gỡ." : "Chưa có ảnh — bấm \"Đổi ảnh\" để tải lên."}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Basic info */}
        <section className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Tên món</span>
            <input
              name="name"
              defaultValue={item.name}
              required
              minLength={2}
              maxLength={120}
              className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold outline-none focus:border-[var(--d-jade)]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Giá bán (₫)</span>
            <input
              name="price"
              type="number"
              min={1000}
              step={1000}
              defaultValue={item.price}
              required
              className="d-num h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-bold outline-none focus:border-[var(--d-jade)]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Danh mục</span>
            <select
              name="categoryId"
              defaultValue={item.category_id}
              required
              className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold outline-none focus:border-[var(--d-jade)]"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </section>

        {/* Modifier groups (read-only summary) */}
        {item.modifierGroups && item.modifierGroups.length > 0 ? (
          <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-4)]">
            <p className="d-eyebrow">Nhóm modifier ({item.modifierGroups.length})</p>
            <div className="mt-3 grid gap-2">
              {item.modifierGroups.map((g) => (
                <div key={g.id} className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{g.name}</p>
                    <Badge tone={g.required ? "orange" : "neutral"}>
                      {g.required ? "Bắt buộc" : "Tuỳ chọn"} · {g.options?.length ?? 0} option
                    </Badge>
                  </div>
                  {g.options && g.options.length > 0 ? (
                    <p className="mt-1 line-clamp-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
                      {g.options.map((o) => `${o.name}${o.priceDelta ? ` (+${formatVnd(o.priceDelta)})` : ""}`).join(" · ")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-faint)]">
              Quản lý chi tiết modifier (thêm / xoá option, đổi giá phụ) tại workspace nâng cao trong AI Menu Studio.
            </p>
          </section>
        ) : null}

        {/* Quick toggle */}
        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="d-eyebrow">Trạng thái bán</p>
              <p className="mt-1 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">Hiển thị trên menu QR / online</p>
            </div>
            <SwitchControl checked={available} onChange={onToggle} disabled={pending} />
          </div>
        </section>
      </form>
      ) : null}
    </Drawer>
  );
}

function CreateMenuItemModal({
  open,
  categories,
  onClose,
  onCreated,
  onError
}: {
  open: boolean;
  categories: AdminMenuCategory[];
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title="Thêm món mới" subtitle="Menu món" size="md">
      <form
        action={async (fd) => {
          if (submitting) return;
          setSubmitting(true);
          try {
            await createMenuItemAction(fd);
            setImagePreview(null);
            onCreated();
          } catch (e) {
            onError(e instanceof Error ? e.message : "Không thêm được món");
          } finally {
            setSubmitting(false);
          }
        }}
        className={cn("grid gap-3", categories.length === 0 && "opacity-60 pointer-events-none")}
        encType="multipart/form-data"
      >
        <input type="hidden" name="image" value="" />
        {categories.length === 0 ? (
          <p className="rounded-[var(--d-r-md)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)] px-3 py-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-orange-600)]">
            Cần tạo ít nhất một danh mục trước. Bấm "Thêm danh mục" trên toolbar.
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Tên món</span>
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              placeholder="Ví dụ: Cà phê sữa đá"
              className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Danh mục</span>
            <select
              name="categoryId"
              defaultValue={categories[0]?.id ?? ""}
              required
              className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold outline-none focus:border-[var(--d-jade)]"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Giá bán (₫)</span>
            <input
              name="price"
              type="number"
              min={1000}
              step={1000}
              defaultValue={35000}
              required
              className="d-num h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-bold outline-none focus:border-[var(--d-jade)]"
            />
          </label>
        </div>

        {/* Image upload + preview */}
        <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
          <div className="grid aspect-square place-items-center overflow-hidden rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)]">
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-1 text-[var(--d-text-faint)]">
                <ImageIcon size={28} />
                <span className="text-[length:var(--d-fs-2xs)] font-semibold">Preview</span>
              </div>
            )}
          </div>
          <div className="grid gap-2">
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-[var(--d-r-md)] border border-dashed border-[var(--d-jade)]/40 bg-[var(--d-surface-2)] px-3 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)] transition hover:bg-[var(--d-primary-soft)]">
              <Upload size={14} className="text-[var(--d-primary)]" />
              Tải ảnh món (tuỳ chọn)
              <input
                name="imageFile"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setImagePreview(file ? URL.createObjectURL(file) : null);
                }}
                className="hidden"
              />
            </label>
            <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">PNG / JPG / WebP, tối đa ~5MB. Bỏ qua sẽ hiện icon mặc định trên menu khách.</p>
          </div>
        </div>

        <div className="mt-1 flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={submitting || categories.length === 0}>
            <Plus size={15} /> {submitting ? "Đang thêm…" : "Thêm món"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CreateCategoryModal({
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
    <Modal open onClose={onClose} title="Thêm danh mục" subtitle="Menu món" size="sm">
      <form
        action={async (fd) => {
          if (submitting) return;
          setSubmitting(true);
          try {
            await createCategoryAction(fd);
            onCreated();
          } catch (e) {
            onError(e instanceof Error ? e.message : "Không thêm được danh mục");
          } finally {
            setSubmitting(false);
          }
        }}
        className="grid gap-3"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Tên danh mục</span>
          <input
            name="name"
            required
            minLength={2}
            maxLength={80}
            placeholder="Ví dụ: Cà phê, Trà sữa, Món chính…"
            className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
          />
        </label>
        <div className="flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={submitting}>
            <FolderPlus size={15} /> {submitting ? "Đang thêm…" : "Thêm danh mục"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RecipePanel({
  itemId,
  itemPrice,
  recipeLines,
  recipeSummary,
  ingredients,
  onRefresh
}: {
  itemId: string;
  itemPrice: number;
  recipeLines: InventoryRecipeMenuItem["recipeLines"];
  recipeSummary: InventoryRecipeMenuItem | null;
  ingredients: InventoryIngredient[];
  onRefresh: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);

  const totalCost = recipeSummary?.totalRecipeCost ?? recipeLines.reduce((s, l) => s + l.costPerItem, 0);
  const costPercent = itemPrice > 0 ? Math.round((totalCost / itemPrice) * 100) : 0;
  const margin = itemPrice - totalCost;

  function deleteLine(recipeLineId: string) {
    if (!window.confirm("Xoá dòng công thức này?")) return;
    const fd = new FormData();
    fd.set("recipeLineId", recipeLineId);
    startTransition(async () => {
      try {
        await deleteInventoryRecipeLineAction(fd);
        toast.success("Đã xoá nguyên liệu khỏi công thức");
        onRefresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không xoá được");
      }
    });
  }

  function upsertLine(fd: FormData) {
    fd.set("menuItemId", itemId);
    startTransition(async () => {
      try {
        await upsertInventoryRecipeLineAction(fd);
        toast.success("Đã lưu công thức");
        setAddOpen(false);
        onRefresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không lưu được công thức");
      }
    });
  }

  const usedIngredientIds = new Set(recipeLines.map((l) => l.ingredientId));
  const availableIngredients = ingredients.filter((i) => !usedIngredientIds.has(i.id));

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      {/* Cost summary */}
      <section className="grid grid-cols-3 gap-2">
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
          <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Giá vốn / phần</p>
          <p className="d-num mt-1 text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{formatVnd(totalCost)}</p>
        </div>
        <div className={cn("rounded-[var(--d-r-md)] border bg-[var(--d-surface-2)] p-3",
          costPercent >= 50 ? "border-[var(--d-danger-fg)]/30" : costPercent >= 35 ? "border-[var(--d-orange)]/30" : "border-[var(--d-line)]")}>
          <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">% giá vốn</p>
          <p className={cn("d-num mt-1 text-[length:var(--d-fs-h3)] font-bold",
            costPercent >= 50 ? "text-[var(--d-danger-fg)]" : costPercent >= 35 ? "text-[var(--d-orange-600)]" : "text-[var(--d-text)]")}>
            {costPercent}%
          </p>
        </div>
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
          <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Lãi gộp / phần</p>
          <p className={cn("d-num mt-1 text-[length:var(--d-fs-h3)] font-bold", margin >= 0 ? "text-[var(--d-primary)]" : "text-[var(--d-danger-fg)]")}>
            {formatVnd(margin)}
          </p>
        </div>
      </section>

      {costPercent >= 45 && itemPrice > 0 ? (
        <p className="rounded-[var(--d-r-md)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)] px-3 py-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-orange-600)]">
          ⚠ Giá vốn vượt 45% giá bán — xem xét giảm định lượng, đổi nguyên liệu rẻ hơn, hoặc tăng giá bán.
        </p>
      ) : null}

      {/* Recipe lines */}
      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
        <header className="flex items-center justify-between gap-2">
          <p className="d-eyebrow">Nguyên liệu trong công thức ({recipeLines.length})</p>
          {ingredients.length > 0 ? (
            <Button type="button" variant="primary" size="sm" onClick={() => setAddOpen(true)} disabled={pending || availableIngredients.length === 0}>
              <Plus size={13} /> Thêm nguyên liệu
            </Button>
          ) : null}
        </header>

        {ingredients.length === 0 ? (
          <p className="mt-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">
            Chưa có nguyên liệu nào trong kho. <a href="/dashboard/inventory" className="font-bold text-[var(--d-primary)] underline">Mở Kho hàng</a> để tạo nguyên liệu trước.
          </p>
        ) : recipeLines.length === 0 ? (
          <EmptyState
            icon={<ImageIcon size={20} />}
            title="Chưa có công thức"
            description="Thêm nguyên liệu vào món để tính giá vốn tự động và quản lý tồn kho."
            className="mt-3"
            action={availableIngredients.length > 0 ? <Button variant="primary" size="md" onClick={() => setAddOpen(true)}><Plus size={15} /> Thêm nguyên liệu</Button> : null}
          />
        ) : (
          <div className="mt-3 grid gap-2">
            {recipeLines.map((line) => (
              <RecipeLineRow
                key={line.id}
                line={line}
                onSave={upsertLine}
                onDelete={() => deleteLine(line.id)}
                pending={pending}
              />
            ))}
          </div>
        )}
      </section>

      {addOpen ? (
        <AddRecipeLineModal
          ingredients={availableIngredients}
          onClose={() => setAddOpen(false)}
          onSave={upsertLine}
          pending={pending}
        />
      ) : null}
    </div>
  );
}

function RecipeLineRow({
  line,
  onSave,
  onDelete,
  pending
}: {
  line: InventoryRecipeMenuItem["recipeLines"][number];
  onSave: (fd: FormData) => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{line.ingredientName}</span>
          <span className="d-num block truncate text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            {line.quantityPerItem} {line.ingredientUnit}/phần
            {line.wastePercent > 0 ? ` · hao ${line.wastePercent}%` : ""}
            {" · "}{formatVnd(line.costPerItem)}/phần
          </span>
        </span>
        <span className="flex shrink-0 gap-1">
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>Sửa</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDelete} disabled={pending}>
            <Trash2 size={13} />
          </Button>
        </span>
      </div>
    );
  }

  return (
    <form
      action={(fd) => {
        onSave(fd);
        setEditing(false);
      }}
      className="flex flex-wrap items-end gap-2 rounded-[var(--d-r-md)] border border-[var(--d-jade)]/35 bg-[var(--d-primary-soft)]/30 p-3"
    >
      <input type="hidden" name="ingredientId" value={line.ingredientId} />
      <span className="min-w-0 flex-1 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{line.ingredientName}</span>
      <label className="flex flex-col gap-1">
        <span className="text-[length:var(--d-fs-2xs)] font-bold uppercase text-[var(--d-text-faint)]">Định lượng / phần ({line.ingredientUnit})</span>
        <input
          name="quantityPerItem"
          type="number"
          min={0}
          step="0.01"
          defaultValue={line.quantityPerItem}
          required
          className="d-num h-9 w-32 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-2 text-[length:var(--d-fs-sm)] font-bold outline-none focus:border-[var(--d-jade)]"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[length:var(--d-fs-2xs)] font-bold uppercase text-[var(--d-text-faint)]">Hao hụt %</span>
        <input
          name="wastePercent"
          type="number"
          min={0}
          max={100}
          step="0.1"
          defaultValue={line.wastePercent}
          className="d-num h-9 w-24 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-2 text-[length:var(--d-fs-sm)] font-bold outline-none focus:border-[var(--d-jade)]"
        />
      </label>
      <span className="flex shrink-0 gap-1">
        <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>Huỷ</Button>
        <Button type="submit" variant="primary" size="sm" disabled={pending}>Lưu</Button>
      </span>
    </form>
  );
}

function AddRecipeLineModal({
  ingredients,
  onClose,
  onSave,
  pending
}: {
  ingredients: InventoryIngredient[];
  onClose: () => void;
  onSave: (fd: FormData) => void;
  pending: boolean;
}) {
  return (
    <Modal open onClose={onClose} title="Thêm nguyên liệu vào công thức" subtitle="Công thức món" size="md">
      <form
        action={(fd) => {
          onSave(fd);
        }}
        className="grid gap-3"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Nguyên liệu</span>
          <select
            name="ingredientId"
            required
            defaultValue={ingredients[0]?.id ?? ""}
            className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold outline-none focus:border-[var(--d-jade)]"
          >
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.unit}) — {formatVnd(i.referenceUnitCost)}/{i.unit}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Định lượng / phần</span>
            <input
              name="quantityPerItem"
              type="number"
              min={0}
              step="0.01"
              defaultValue={0.1}
              required
              className="d-num h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-bold outline-none focus:border-[var(--d-jade)]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Hao hụt % (tuỳ chọn)</span>
            <input
              name="wastePercent"
              type="number"
              min={0}
              max={100}
              step="0.1"
              defaultValue={0}
              className="d-num h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-bold outline-none focus:border-[var(--d-jade)]"
            />
          </label>
        </div>
        <p className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          Hao hụt là phần nguyên liệu mất do gọt, vỡ, ngấm dư. Ví dụ trà bị phai 5%, sữa rớt khi rót 2%.
        </p>
        <div className="mt-1 flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            <Plus size={15} /> Thêm vào công thức
          </Button>
        </div>
      </form>
    </Modal>
  );
}

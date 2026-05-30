"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  categorySchema,
  menuItemSchema,
  menuModifierGroupIdSchema,
  menuModifierGroupSchema,
  menuModifierOptionIdSchema,
  menuModifierOptionSchema,
  menuModifierOptionStatusSchema,
  updateMenuItemSchema,
  updateMenuModifierGroupSchema,
  updateMenuModifierOptionSchema
} from "@/lib/validators";
import { invalidateDashboardWorkspaceCaches } from "@/lib/dashboard-workspace-cache";
import { persistMenuImageUrl, uploadMenuImageFile } from "@/services/menu-image-service";
import {
  createMenuModifierGroup,
  createMenuModifierOption,
  createCategory,
  createMenuItem,
  deleteMenuModifierGroup,
  deleteMenuModifierOption,
  deleteMenuItem,
  importMenuItemsFromDraft,
  invalidateMenuCache,
  updateMenuModifierGroup,
  updateMenuModifierOption,
  updateMenuModifierOptionAvailability,
  updateMenuItem,
  updateMenuItemAvailability
} from "@/services/menu-service";
import { invalidateRestaurantDashboardCache } from "@/services/restaurant-service";
import { assertRestaurantResourceLimit } from "@/services/subscription-service";
import { requireOperationalAdminSession } from "./shared";

const menuOcrImportItemSchema = z.object({
  categoryName: z.string().trim().max(80).optional().or(z.literal("")),
  name: z.string().trim().min(2).max(120),
  price: z.coerce.number().int().min(1000).max(100000000)
});

async function revalidateMenuWorkspace(restaurantId: string, slug: string) {
  await invalidateDashboardWorkspaceCaches(restaurantId, ["menu", "online", "inventory", "overview"]);
  invalidateMenuCache();
  revalidatePath("/dashboard/menu");
  revalidatePath("/dashboard/online");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard");
  revalidatePath(`/r/${slug}`);
}

export async function createCategoryAction(formData: FormData) {
  const session = await requireOperationalAdminSession("menu_management");
  const parsed = categorySchema.parse({ name: formData.get("name") });
  await createCategory(session.restaurantId, parsed.name);
  invalidateRestaurantDashboardCache(session.restaurantId);
  await revalidateMenuWorkspace(session.restaurantId, session.restaurant.slug);
}

export async function createMenuItemAction(formData: FormData) {
  const session = await requireOperationalAdminSession("menu_management");
  const parsed = menuItemSchema.parse({
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    price: formData.get("price"),
    image: formData.get("image") ?? ""
  });
  const uploadedImage = await uploadMenuImageFile({
    restaurantId: session.restaurantId,
    file: formData.get("imageFile")
  });
  const persistedImage = uploadedImage
    ? uploadedImage
    : await persistMenuImageUrl({
        restaurantId: session.restaurantId,
        imageUrl: parsed.image || undefined
      });
  await assertRestaurantResourceLimit({
    restaurantId: session.restaurantId,
    featureKey: "menu_management",
    table: "menu_items",
    label: "món"
  });

  await createMenuItem({
    restaurantId: session.restaurantId,
    ...parsed,
    image: persistedImage ?? (parsed.image || undefined)
  });
  invalidateRestaurantDashboardCache(session.restaurantId);
  await revalidateMenuWorkspace(session.restaurantId, session.restaurant.slug);
}

export async function importMenuOcrItemsAction(
  _prevState: { error?: string; success?: string; inserted?: number; skipped?: number; categoriesCreated?: number; skippedNames?: string[] } | undefined,
  formData: FormData
) {
  const session = await requireOperationalAdminSession("menu_management");
  const rawItems = String(formData.get("itemsJson") ?? "");
  let parsedJson: unknown = [];

  try {
    parsedJson = JSON.parse(rawItems);
  } catch {
    parsedJson = [];
  }

  const parsed = z.array(menuOcrImportItemSchema).max(80).safeParse(parsedJson);
  if (!parsed.success || parsed.data.length === 0) {
    return { error: "Không có món hợp lệ để nhập vào menu." };
  }

  const result = await importMenuItemsFromDraft({
    restaurantId: session.restaurantId,
    items: parsed.data,
    beforeInsert: async (increment) => {
      await assertRestaurantResourceLimit({
        restaurantId: session.restaurantId,
        featureKey: "menu_management",
        table: "menu_items",
        label: "món",
        increment
      });
    }
  });
  invalidateRestaurantDashboardCache(session.restaurantId);
  await revalidateMenuWorkspace(session.restaurantId, session.restaurant.slug);

  if (result.inserted === 0) {
    return {
      ...result,
      success: result.skipped > 0 ? `Không thêm món mới vì ${result.skipped} món đã có trong menu.` : "Không có món mới để thêm."
    };
  }

  return {
    ...result,
    success: `Đã thêm ${result.inserted} món vào menu${result.skipped ? `, bỏ qua ${result.skipped} món trùng` : ""}.`
  };
}

export async function deleteMenuItemAction(formData: FormData) {
  const session = await requireOperationalAdminSession("menu_management");
  const itemId = String(formData.get("itemId") ?? "");
  await deleteMenuItem(session.restaurantId, itemId);
  invalidateRestaurantDashboardCache(session.restaurantId);
  await revalidateMenuWorkspace(session.restaurantId, session.restaurant.slug);
}

export async function toggleMenuItemAvailabilityAction(formData: FormData) {
  const session = await requireOperationalAdminSession("menu_management");
  const itemId = String(formData.get("itemId") ?? "");
  const isAvailable = String(formData.get("isAvailable") ?? "") === "true";
  await updateMenuItemAvailability(session.restaurantId, itemId, isAvailable);
  invalidateRestaurantDashboardCache(session.restaurantId);
  await revalidateMenuWorkspace(session.restaurantId, session.restaurant.slug);
}

export async function updateMenuItemAction(formData: FormData) {
  const session = await requireOperationalAdminSession("menu_management");
  const parsed = updateMenuItemSchema.parse({
    itemId: formData.get("itemId"),
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    price: formData.get("price"),
    image: formData.get("image") ?? "",
    isAvailable: formData.get("isAvailable") === "true"
  });
  const uploadedImage = await uploadMenuImageFile({
    restaurantId: session.restaurantId,
    file: formData.get("imageFile")
  });
  const persistedImage = uploadedImage
    ? uploadedImage
    : await persistMenuImageUrl({
        restaurantId: session.restaurantId,
        imageUrl: parsed.image || undefined
      });

  await updateMenuItem({
    restaurantId: session.restaurantId,
    itemId: parsed.itemId,
    categoryId: parsed.categoryId,
    name: parsed.name,
    price: parsed.price,
    image: persistedImage ?? (parsed.image || undefined),
    isAvailable: parsed.isAvailable
  });
  invalidateRestaurantDashboardCache(session.restaurantId);
  await revalidateMenuWorkspace(session.restaurantId, session.restaurant.slug);
}

export async function createMenuModifierGroupAction(formData: FormData) {
  const session = await requireOperationalAdminSession("menu_management");
  const parsed = menuModifierGroupSchema.parse({
    itemId: formData.get("itemId"),
    name: formData.get("name"),
    isRequired: formData.get("isRequired") === "true",
    minSelect: formData.get("minSelect"),
    maxSelect: formData.get("maxSelect")
  });

  await createMenuModifierGroup({
    restaurantId: session.restaurantId,
    ...parsed
  });
  invalidateRestaurantDashboardCache(session.restaurantId);
  await revalidateMenuWorkspace(session.restaurantId, session.restaurant.slug);
}

export async function updateMenuModifierGroupAction(formData: FormData) {
  const session = await requireOperationalAdminSession("menu_management");
  const parsed = updateMenuModifierGroupSchema.parse({
    itemId: formData.get("itemId"),
    groupId: formData.get("groupId"),
    name: formData.get("name"),
    isRequired: formData.get("isRequired") === "true",
    minSelect: formData.get("minSelect"),
    maxSelect: formData.get("maxSelect")
  });

  await updateMenuModifierGroup({
    restaurantId: session.restaurantId,
    ...parsed
  });
  invalidateRestaurantDashboardCache(session.restaurantId);
  await revalidateMenuWorkspace(session.restaurantId, session.restaurant.slug);
}

export async function deleteMenuModifierGroupAction(formData: FormData) {
  const session = await requireOperationalAdminSession("menu_management");
  const parsed = menuModifierGroupIdSchema.parse({ groupId: formData.get("groupId") });
  await deleteMenuModifierGroup(session.restaurantId, parsed.groupId);
  invalidateRestaurantDashboardCache(session.restaurantId);
  await revalidateMenuWorkspace(session.restaurantId, session.restaurant.slug);
}

export async function createMenuModifierOptionAction(formData: FormData) {
  const session = await requireOperationalAdminSession("menu_management");
  const parsed = menuModifierOptionSchema.parse({
    groupId: formData.get("groupId"),
    name: formData.get("name"),
    priceDelta: formData.get("priceDelta"),
    isAvailable: formData.get("isAvailable") !== "false"
  });

  await createMenuModifierOption({
    restaurantId: session.restaurantId,
    ...parsed
  });
  invalidateRestaurantDashboardCache(session.restaurantId);
  await revalidateMenuWorkspace(session.restaurantId, session.restaurant.slug);
}

export async function updateMenuModifierOptionAction(formData: FormData) {
  const session = await requireOperationalAdminSession("menu_management");
  const parsed = updateMenuModifierOptionSchema.parse({
    groupId: formData.get("groupId"),
    optionId: formData.get("optionId"),
    name: formData.get("name"),
    priceDelta: formData.get("priceDelta"),
    isAvailable: formData.get("isAvailable") === "true"
  });

  await updateMenuModifierOption({
    restaurantId: session.restaurantId,
    ...parsed
  });
  invalidateRestaurantDashboardCache(session.restaurantId);
  await revalidateMenuWorkspace(session.restaurantId, session.restaurant.slug);
}

export async function toggleMenuModifierOptionAvailabilityAction(formData: FormData) {
  const session = await requireOperationalAdminSession("menu_management");
  const parsed = menuModifierOptionStatusSchema.parse({
    optionId: formData.get("optionId"),
    isAvailable: formData.get("isAvailable")
  });
  await updateMenuModifierOptionAvailability(session.restaurantId, parsed.optionId, parsed.isAvailable);
  invalidateRestaurantDashboardCache(session.restaurantId);
  await revalidateMenuWorkspace(session.restaurantId, session.restaurant.slug);
}

export async function deleteMenuModifierOptionAction(formData: FormData) {
  const session = await requireOperationalAdminSession("menu_management");
  const parsed = menuModifierOptionIdSchema.parse({ optionId: formData.get("optionId") });
  await deleteMenuModifierOption(session.restaurantId, parsed.optionId);
  invalidateRestaurantDashboardCache(session.restaurantId);
  await revalidateMenuWorkspace(session.restaurantId, session.restaurant.slug);
}

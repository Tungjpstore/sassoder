import { Suspense } from "react";
import { ProductionDashboardShell as AdminShell } from "@/components/dashboard-v2/production-shell";
import { RealMenuWorkspaceV2, type MenuAiAccess } from "@/components/dashboard-v2/real/menu-workspace-v2";
import { readThroughDashboardWorkspaceCache } from "@/lib/dashboard-workspace-cache";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { hasFeature } from "@/services/subscription-service";
import { getMenuAiUsageSummary } from "@/services/menu-ai-usage-service";
import { getAdminReport } from "@/services/dashboard-report-service";
import { listMenuForAdmin } from "@/services/menu-service";
import { listInventoryIngredients, listInventoryRecipeMenuItems } from "@/services/inventory-service";

export const dynamic = "force-dynamic";

export default async function AdminMenuPage() {
  const { session, entitlement } = await requireDashboardAccess("menu_management");

  const imageLimit = entitlement.features["ai_image_generation"]?.limitValue ?? null;
  const ocrLimit = entitlement.features["ai_menu_ocr"]?.limitValue ?? null;
  const usage = await getMenuAiUsageSummary({ restaurantId: session.restaurantId, imageLimit, ocrLimit });

  const ai: MenuAiAccess = {
    image: { enabled: hasFeature(entitlement, "ai_image_generation"), used: usage.image.used, limit: usage.image.limit },
    ocr: { enabled: hasFeature(entitlement, "ai_menu_ocr"), used: usage.ocr.used, limit: usage.ocr.limit },
    voiceEnabled: hasFeature(entitlement, "ai_voice_input")
  };

  return (
    <AdminShell
      title="Menu món"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Quản lý danh mục món ăn, giá bán, hình ảnh, công thức và tình trạng phục vụ"
    >
      <Suspense fallback={<MenuWorkspaceSkeleton />}>
        <MenuWorkspaceContent restaurantId={session.restaurantId} restaurantName={session.restaurant.name} ai={ai} />
      </Suspense>
    </AdminShell>
  );
}

async function MenuWorkspaceContent({ restaurantId, restaurantName, ai }: { restaurantId: string; restaurantName: string; ai: MenuAiAccess }) {
  const { categories, report, ingredients, recipeMenuItems, inventoryDataError } = await readThroughDashboardWorkspaceCache({
    restaurantId,
    workspace: "menu",
    ttlSeconds: 15,
    load: async () => {
      const [categories, report, inventory] = await Promise.all([
        listMenuForAdmin(restaurantId),
        getAdminReport(restaurantId),
        loadMenuInventoryData(restaurantId)
      ]);
      return { categories, report, ...inventory };
    }
  });

  return (
    <RealMenuWorkspaceV2
      restaurantId={restaurantId}
      categories={categories}
      topItemIds={report.topItems.map((item) => item.id)}
      topItemNames={report.topItems.map((item) => item.name)}
      restaurantName={restaurantName}
      ingredients={ingredients}
      recipeMenuItems={recipeMenuItems}
      inventoryDataError={inventoryDataError}
      ai={ai}
    />
  );
}

async function loadMenuInventoryData(restaurantId: string) {
  const [ingredientsResult, recipeMenuItemsResult] = await Promise.allSettled([
    listInventoryIngredients(restaurantId),
    listInventoryRecipeMenuItems(restaurantId)
  ]);
  const errors = [ingredientsResult, recipeMenuItemsResult]
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => menuInventoryErrorMessage(result.reason));

  return {
    ingredients: ingredientsResult.status === "fulfilled" ? ingredientsResult.value : [],
    recipeMenuItems: recipeMenuItemsResult.status === "fulfilled" ? recipeMenuItemsResult.value : [],
    inventoryDataError: errors.length ? `Không tải được dữ liệu kho/công thức thật: ${errors.join("; ")}` : null
  };
}

function menuInventoryErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Lỗi không xác định";
}

function MenuWorkspaceSkeleton() {
  return (
    <div className="dashboard-panel grid gap-4 p-4">
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl bg-[#A9C5A1]/18" />
        ))}
      </div>
      <div className="h-[460px] animate-pulse rounded-xl border border-[var(--border)] bg-[var(--soft-surface)]" />
    </div>
  );
}

import { Suspense } from "react";
import { ProductionDashboardShell as AdminShell } from "@/components/dashboard-v2/production-shell";
import { RealReservationsWorkspaceV2 } from "@/components/dashboard-v2/real/reservations-workspace-v2";
import { readThroughDashboardWorkspaceCache } from "@/lib/dashboard-workspace-cache";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { captureServerTimeMs, vietnamDateInputValue } from "@/lib/server-time";
import { buildTenantUrl } from "@/lib/tenant-domain";
import { getReservationAnalytics, getReservationSettings, listReservationsForRestaurant } from "@/services/reservation-service";
import { listTablesWithStatus } from "@/services/table-service";

export const dynamic = "force-dynamic";

export default async function ReservationsPage() {
  const { session, entitlement } = await requireDashboardAccess("reservations");
  return (
    <AdminShell
      title="Đặt bàn trước"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Nhận lịch giữ bàn, cọc VietQR, chống trùng giờ và đưa khách vào bàn đang phục vụ."
    >
      <Suspense fallback={<ReservationsWorkspaceSkeleton />}>
        <ReservationsWorkspaceContent restaurantId={session.restaurantId} />
      </Suspense>
    </AdminShell>
  );
}

async function ReservationsWorkspaceContent({ restaurantId }: { restaurantId: string }) {
  const initialNowMs = captureServerTimeMs();
  const today = vietnamDateInputValue(initialNowMs);
  const { settings, reservations, tables, analytics } = await readThroughDashboardWorkspaceCache({
    restaurantId,
    workspace: "reservations",
    identifier: `today:${today}`,
    ttlSeconds: 5,
    load: async () => {
      const [settings, reservations, tables, analytics] = await Promise.all([
        getReservationSettings(restaurantId),
        listReservationsForRestaurant(restaurantId, today),
        listTablesWithStatus(restaurantId),
        getReservationAnalytics(restaurantId)
      ]);

      return { settings, reservations, tables, analytics };
    }
  });

  return (
    <RealReservationsWorkspaceV2
      restaurantId={restaurantId}
      settings={settings}
      initialReservations={JSON.parse(JSON.stringify(reservations))}
      tableOptions={tables.map((table) => ({
        id: table.id,
        name: table.name,
        area: table.area,
        capacity: table.capacity,
        tableAreaId: table.table_area_id ?? null,
        floorLabel: table.floor_label ?? null,
        seatingZone: table.seating_zone ?? null,
        tableKind: table.table_kind ?? null,
        isBookable: table.is_bookable !== false,
        isHidden: Boolean(table.is_hidden),
        isUnderMaintenance: Boolean(table.is_under_maintenance),
        qrEnabled: table.qr_enabled,
        qrToken: table.qr_token ?? null,
        operationalStatus: table.status,
        activeOrderCount: table.activeOrderCount,
        activeBillCount: table.activeBillCount,
        activeReservationCount: table.activeReservationCount,
        unpaidTotal: table.unpaidTotal
      }))}
      publicUrl={buildTenantUrl(settings.slug, "/reserve")}
      analytics={analytics}
      initialNowMs={initialNowMs}
    />
  );
}

function ReservationsWorkspaceSkeleton() {
  return (
    <div className="dashboard-panel grid gap-4 p-4">
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl bg-[#A9C5A1]/18" />
        ))}
      </div>
      <div className="h-[460px] animate-pulse rounded-xl border border-[var(--border)] bg-[var(--soft-surface)]" />
    </div>
  );
}

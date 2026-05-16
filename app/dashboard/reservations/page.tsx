import { AdminShell } from "@/components/dashboard/app-shell";
import { ReservationsWorkspace } from "@/components/dashboard/reservations-workspace";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { buildTenantUrl } from "@/lib/tenant-domain";
import { getReservationSettings, listReservationsForRestaurant } from "@/services/reservation-service";
import { listTablesWithStatus } from "@/services/table-service";

export const dynamic = "force-dynamic";

function todayInputValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

export default async function ReservationsPage() {
  const { session, entitlement } = await requireDashboardAccess("reservations");
  const [settings, reservations, tables] = await Promise.all([
    getReservationSettings(session.restaurantId),
    listReservationsForRestaurant(session.restaurantId, todayInputValue()),
    listTablesWithStatus(session.restaurantId)
  ]);

  return (
    <AdminShell
      title="Đặt bàn trước"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Nhận lịch giữ bàn, cọc VietQR, chống trùng giờ và đưa khách vào bàn đang phục vụ."
    >
      <ReservationsWorkspace
        restaurantId={session.restaurantId}
        settings={settings}
        initialReservations={JSON.parse(JSON.stringify(reservations))}
        tableOptions={tables.map((table) => ({
          id: table.id,
          name: table.name,
          area: table.area,
          capacity: table.capacity,
          floorLabel: table.floor_label ?? null,
          seatingZone: table.seating_zone ?? null,
          tableKind: table.table_kind ?? null,
          isBookable: table.is_bookable !== false,
          isHidden: Boolean(table.is_hidden),
          isUnderMaintenance: Boolean(table.is_under_maintenance)
        }))}
        publicUrl={buildTenantUrl(settings.slug, "/reserve")}
      />
    </AdminShell>
  );
}

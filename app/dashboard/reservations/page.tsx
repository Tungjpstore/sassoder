import { AdminShell } from "@/components/dashboard/app-shell";
import { ReservationsWorkspace } from "@/components/dashboard/reservations-workspace";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { buildTenantUrl } from "@/lib/tenant-domain";
import { getReservationSettings, listReservationsForRestaurant } from "@/services/reservation-service";

export const dynamic = "force-dynamic";

function todayInputValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

export default async function ReservationsPage() {
  const { session, entitlement } = await requireDashboardAccess("reservations");
  const [settings, reservations] = await Promise.all([
    getReservationSettings(session.restaurantId),
    listReservationsForRestaurant(session.restaurantId, todayInputValue())
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
        publicUrl={buildTenantUrl(settings.slug, "/reserve")}
      />
    </AdminShell>
  );
}

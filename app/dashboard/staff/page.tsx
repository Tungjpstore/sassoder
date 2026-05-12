import { AdminShell } from "@/components/dashboard/app-shell";
import { StaffWorkspace } from "@/components/dashboard/staff-workspace";
import { requireDashboardAdminAccess } from "@/lib/dashboard-access";
import { getRestaurantAdminDashboard, listRestaurantUsers } from "@/services/restaurant-service";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  const { session, entitlement } = await requireDashboardAdminAccess("staff_management");
  const [{ dashboard, operations }, users] = await Promise.all([
    getRestaurantAdminDashboard(session.restaurantId),
    listRestaurantUsers(session.restaurantId)
  ]);

  return (
    <AdminShell
      title="Nhân viên"
      restaurantName={dashboard.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Quản lý tài khoản vận hành và quyền truy cập trong quán"
    >
      <StaffWorkspace
        users={users}
        operations={operations}
        currentUserId={session.userId}
        currentRole={session.role}
        fallbackUser={{
          id: session.userId,
          email: session.email,
          role: session.role,
          restaurant_id: session.restaurantId,
          staff_title: session.role === "ADMIN" ? "Quản lý" : "Phục vụ",
          permission_profile: session.role === "ADMIN" ? "manager" : "service",
          permissions: session.role === "ADMIN"
            ? [
                "dashboard.view",
                "orders.manage",
                "kitchen.view",
                "menu.manage",
                "tables.manage",
                "payments.manage",
                "online.manage",
                "reservations.manage",
                "promotions.manage",
                "reports.view",
                "staff.manage",
                "settings.manage"
              ]
            : ["dashboard.view", "orders.manage", "tables.manage", "reservations.manage"],
          account_status: session.accountStatus ?? "active"
        }}
      />
    </AdminShell>
  );
}

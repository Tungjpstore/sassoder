import Image from "next/image";
import { cn } from "@/lib/utils";

export const dashboardIconAssets = {
  analytics: "/brand/logivn/dashboard-icons/analytics.png",
  inventory: "/brand/logivn/dashboard-icons/inventory.png",
  kitchen: "/brand/logivn/dashboard-icons/kitchen.png",
  logibotAi: "/brand/logivn/dashboard-icons/logibot-ai.png",
  menuItems: "/brand/logivn/dashboard-icons/menu-items.png",
  more: "/brand/logivn/dashboard-icons/more.png",
  onlineOrders: "/brand/logivn/dashboard-icons/online-orders.png",
  orders: "/brand/logivn/dashboard-icons/orders.png",
  payments: "/brand/logivn/dashboard-icons/payments.png",
  promotions: "/brand/logivn/dashboard-icons/promotions.png",
  reservations: "/brand/logivn/dashboard-icons/reservations.png",
  settings: "/brand/logivn/dashboard-icons/settings.png",
  staff: "/brand/logivn/dashboard-icons/staff.png",
  tablesQr: "/brand/logivn/dashboard-icons/tables-qr.png",
  todayShift: "/brand/logivn/dashboard-icons/today-shift.png"
} as const;

export type DashboardIconId = keyof typeof dashboardIconAssets;

export function DashboardAssetIcon({
  icon,
  active = false,
  size = "md",
  className
}: {
  icon: DashboardIconId;
  active?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const imageSize = size === "sm" ? "24px" : size === "lg" ? "40px" : "28px";

  return (
    <span
      className={cn(
        "relative shrink-0 overflow-hidden border bg-[#F8F7F4] transition duration-150",
        size === "sm" ? "h-6 w-6 rounded-lg" : size === "lg" ? "h-10 w-10 rounded-xl" : "h-7 w-7 rounded-lg",
        active ? "border-white/25 shadow-[0_8px_18px_rgba(17,24,39,0.12)]" : "border-[var(--border)] group-hover:border-[var(--primary)]/25",
        className
      )}
      aria-hidden="true"
    >
      <Image src={dashboardIconAssets[icon]} alt="" fill sizes={imageSize} className="object-cover" />
    </span>
  );
}

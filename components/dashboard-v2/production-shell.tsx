import * as React from "react";
import { DashboardShellV2 } from "./shell";
import type { ActionStreamItem } from "./action-rail";
import type { getRestaurantEntitlement } from "@/services/subscription-service";
import { loadDashboardActionStream } from "@/lib/dashboard/load-action-stream";
import "@/app/styles/dashboard-tokens-v2.css";

type Entitlement = Awaited<ReturnType<typeof getRestaurantEntitlement>>;

type ProductionDashboardShellProps = {
  children: React.ReactNode;
  title: string;
  restaurantName: string;
  entitlement?: Entitlement;
  topbarSlot?: React.ReactNode;
  actionStream?: ActionStreamItem[];
  showRail?: boolean;
  subtitle?: string;
  restaurantId?: string;
  hideHeading?: boolean;
  showLiveActionCenter?: boolean;
  showQuickActionsFab?: boolean;
  showDashboardCopilot?: boolean;
  topbarVariant?: "default" | "overview";
  focusMode?: boolean;
};

/* ProductionDashboardShell — async server component.
 * Tự load action stream từ data thật khi caller không truyền sẵn.
 * Đây là cách rẻ nhất để bật ActionRail xuyên suốt 14 workspace mà
 * không phải sửa từng route page. */
export async function ProductionDashboardShell({
  children,
  title,
  restaurantName,
  entitlement,
  topbarSlot,
  actionStream,
  restaurantId,
  showRail = true,
  showQuickActionsFab = true,
  showDashboardCopilot = true
}: ProductionDashboardShellProps) {
  const stream = actionStream ?? (restaurantId ? await loadDashboardActionStream(restaurantId).catch(() => []) : []);

  return (
    <DashboardShellV2
      title={title}
      restaurantName={restaurantName}
      entitlement={entitlement}
      topbarSlot={topbarSlot}
      actionStream={stream}
      showRail={showRail}
      showQuickActionsFab={showQuickActionsFab}
      restaurantId={restaurantId}
      showDashboardCopilot={showDashboardCopilot}
    >
      {children}
    </DashboardShellV2>
  );
}

"use client";

/* Shared V2 compatibility boundary. These primitives are stable and used by
 * multiple dashboard-v2 workspaces while their source modules are gradually
 * promoted out of the legacy dashboard tree.
 */

export { CommandPaletteTrigger } from "@/components/dashboard/command-palette";
export { ConfirmActionButton } from "@/components/dashboard/confirm-action-button";
export { DashboardQuickActionsFab } from "@/components/dashboard/dashboard-quick-actions-fab";
export { DashboardAssetIcon } from "@/components/dashboard/dashboard-icon-assets";
export type { DashboardIconId } from "@/components/dashboard/dashboard-icon-assets";
export { AdminLiveActionCenter } from "@/components/dashboard/live-action-center";
export { ToastProvider, useToast } from "@/components/dashboard/toast-provider";
export { useDialogFocusTrap } from "@/components/dashboard/dialog-focus";
export { useDashboardOverlay } from "@/components/dashboard/use-dashboard-overlay";
export {
  fetchKitchenOrders,
  prefetchKitchenOrders,
  readCachedKitchenOrders,
  writeCachedKitchenOrders
} from "@/components/dashboard/kitchen-orders-cache";

"use client";

/*
 * V2 compatibility boundary for settings modules that still own mature
 * production logic in components/dashboard. Keep direct legacy imports here so
 * every settings route can depend on dashboard-v2 paths while each module is
 * migrated behind this boundary.
 */

export { BranchDeliveryControls } from "@/components/dashboard/branch-delivery-controls";
export { MapOperationalMetricsPanel } from "@/components/dashboard/map-operational-metrics-panel";
export { OrderingSettingsForm } from "@/components/dashboard/ordering-settings-form";
export { TelegramConnectPanel } from "@/components/dashboard/telegram-connect-panel";

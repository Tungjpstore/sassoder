"use client";

/* V2 onboarding boundary for shared dashboard primitives that are still used by
 * auth/setup flows. Keep direct imports here so the onboarding surface owns a
 * clean dashboard-v2 dependency graph.
 */

export { useDashboardOverlay, useDialogFocusTrap } from "@/components/dashboard-v2/adapters/dashboard-shared";
export { InteractiveStorePreview } from "@/components/dashboard/interactive-store-preview";

"use client";

import { create } from "zustand";
import type { BillingFeatureKey } from "@/lib/billing/types";

type UpgradeFlowState = {
  isOpen: boolean;
  featureKey: BillingFeatureKey | null;
  source: string | null;
  open: (input?: { featureKey?: BillingFeatureKey | null; source?: string | null }) => void;
  close: () => void;
};

export const useUpgradeFlow = create<UpgradeFlowState>((set) => ({
  isOpen: false,
  featureKey: null,
  source: null,
  open: (input) =>
    set({
      isOpen: true,
      featureKey: input?.featureKey ?? null,
      source: input?.source ?? null
    }),
  close: () =>
    set({
      isOpen: false,
      featureKey: null,
      source: null
    })
}));

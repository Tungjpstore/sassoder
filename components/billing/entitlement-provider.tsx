"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ResolvedEntitlementSnapshot } from "@/lib/billing/types";

const EntitlementContext = createContext<ResolvedEntitlementSnapshot | null>(null);

export function EntitlementProvider({
  snapshot,
  children
}: {
  snapshot: ResolvedEntitlementSnapshot;
  children: ReactNode;
}) {
  return <EntitlementContext.Provider value={snapshot}>{children}</EntitlementContext.Provider>;
}

export function useEntitlementSnapshot() {
  const value = useContext(EntitlementContext);
  if (!value) {
    throw new Error("useEntitlementSnapshot must be used inside EntitlementProvider");
  }
  return value;
}

import type { Metadata } from "next";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = noIndexMetadata;
export const preferredRegion = "sin1";

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}

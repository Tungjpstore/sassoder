import type { Metadata } from "next";
import { PushNotificationManager } from "@/components/pwa/push-notification-manager";
import { noIndexMetadata } from "@/lib/seo/metadata";
import "@/app/styles/dashboard-tokens-v2.css";

export const metadata: Metadata = noIndexMetadata;
export const preferredRegion = "sin1";

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <PushNotificationManager />
    </>
  );
}

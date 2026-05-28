import type { Metadata } from "next";
import { PlatformAdminConsole } from "@/components/admin/platform-admin-console";
import { PlatformAdminLogin } from "@/components/admin/platform-admin-login";
import { PlatformAdminPasswordChange } from "@/components/admin/platform-admin-password-change";
import { getActivePlatformAdminSection } from "@/features/platform-admin/navigation";
import { getPlatformAdminAuthStatus, getPlatformAdminSession } from "@/lib/platform-admin-auth";
import { PLATFORM_ADMIN_ORIGIN } from "@/lib/platform-admin-url";
import { getPlatformAdminSnapshot } from "@/services/platform-admin-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "LogiVN Control Center",
  description: "Bảng vận hành nội bộ admin.logivn.com cho triển khai, hàng đợi, AI, thanh toán, nhật ký, cảnh báo và tenant của LogiVN.",
  alternates: {
    canonical: PLATFORM_ADMIN_ORIGIN
  },
  openGraph: {
    title: "LogiVN Control Center",
    description: "Nền tảng vận hành realtime cho hệ sinh thái LogiVN.",
    url: PLATFORM_ADMIN_ORIGIN,
    siteName: "LogiVN Control Center"
  },
  twitter: {
    card: "summary",
    title: "LogiVN Control Center",
    description: "Nền tảng vận hành realtime cho hệ sinh thái LogiVN."
  },
  robots: {
    index: false,
    follow: false
  }
};

export default async function SystemAdminPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const [authStatus, session, routeParams] = await Promise.all([
    getPlatformAdminAuthStatus(),
    getPlatformAdminSession(),
    params
  ]);

  if (!session.authenticated) {
    return (
      <PlatformAdminLogin
        configured={authStatus.configured}
        devFallbackEnabled={authStatus.devFallbackEnabled}
        requiresFirstPasswordChange={authStatus.requiresFirstPasswordChange}
        rbacConfigured={authStatus.rbacConfigured}
        adminUsersConfigured={authStatus.adminUsersConfigured}
        bootstrapFallbackEnabled={authStatus.bootstrapFallbackEnabled}
        sessionTtlHours={authStatus.sessionTtlHours}
      />
    );
  }

  if (session.mustChangePassword || routeParams.path?.[0] === "change-password") {
    return <PlatformAdminPasswordChange forced={session.mustChangePassword} sessionTtlHours={authStatus.sessionTtlHours} />;
  }

  const snapshot = await getPlatformAdminSnapshot();
  return <PlatformAdminConsole snapshot={snapshot} session={session} activeSection={getActivePlatformAdminSection(routeParams.path)} />;
}

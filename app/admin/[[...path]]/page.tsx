import type { Metadata } from "next";
import { PlatformAdminConsole } from "@/components/admin/platform-admin-console";
import { PlatformAdminLogin } from "@/components/admin/platform-admin-login";
import { PlatformAdminPasswordChange } from "@/components/admin/platform-admin-password-change";
import { getPlatformAdminAuthStatus, getPlatformAdminSession } from "@/lib/platform-admin-auth";
import { getPlatformAdminSnapshot } from "@/services/platform-admin-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dev Admin | LogiVN",
  robots: {
    index: false,
    follow: false
  }
};

type ActiveSection = "overview" | "site" | "plans" | "billing" | "tenants" | "users" | "security" | "release";

const activeSections = new Set<ActiveSection>([
  "overview",
  "site",
  "plans",
  "billing",
  "tenants",
  "users",
  "security",
  "release"
]);

function getActiveSection(path?: string[]): ActiveSection {
  const section = path?.[0] || "overview";
  return activeSections.has(section as ActiveSection) ? (section as ActiveSection) : "overview";
}

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
        sessionTtlHours={authStatus.sessionTtlHours}
      />
    );
  }

  if (session.mustChangePassword || routeParams.path?.[0] === "change-password") {
    return <PlatformAdminPasswordChange forced={session.mustChangePassword} sessionTtlHours={authStatus.sessionTtlHours} />;
  }

  const snapshot = await getPlatformAdminSnapshot();
  return <PlatformAdminConsole snapshot={snapshot} activeSection={getActiveSection(routeParams.path)} />;
}

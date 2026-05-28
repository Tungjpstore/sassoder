import { PlatformAdminShell } from "@/features/platform-admin/components/admin-shell";
import { AiControl } from "@/features/platform-admin/components/sections/ai-section";
import { ProjectAtlas } from "@/features/platform-admin/components/sections/atlas-section";
import { Billing } from "@/features/platform-admin/components/sections/billing-section";
import { ContentControl } from "@/features/platform-admin/components/sections/content-section";
import { GovernanceControl } from "@/features/platform-admin/components/sections/governance-section";
import { MapsControl } from "@/features/platform-admin/components/sections/maps-section";
import { OpsControl } from "@/features/platform-admin/components/sections/ops-section";
import { Overview } from "@/features/platform-admin/components/sections/overview-section";
import { Plans } from "@/features/platform-admin/components/sections/plans-section";
import { Release } from "@/features/platform-admin/components/sections/release-section";
import { Security } from "@/features/platform-admin/components/sections/security-section";
import { SiteSettings } from "@/features/platform-admin/components/sections/site-section";
import { Tenants } from "@/features/platform-admin/components/sections/tenants-section";
import { Users } from "@/features/platform-admin/components/sections/users-section";
import type { ActiveSection, Snapshot } from "@/features/platform-admin/types";
import type { PlatformAdminSession } from "@/lib/platform-admin-auth";

export function PlatformAdminConsole({
  snapshot,
  session,
  activeSection
}: {
  snapshot: Snapshot;
  session: PlatformAdminSession;
  activeSection: ActiveSection;
}) {
  return (
    <PlatformAdminShell activeSection={activeSection} snapshot={snapshot} session={session}>
      {activeSection === "overview" ? <Overview snapshot={snapshot} /> : null}
      {activeSection === "system-map" ? <ProjectAtlas snapshot={snapshot} /> : null}
      {activeSection === "deployments" ? <Release snapshot={snapshot} /> : null}
      {activeSection === "payments" ? (
        <div className="grid gap-4">
          <Plans snapshot={snapshot} />
          <Billing snapshot={snapshot} />
        </div>
      ) : null}
      {activeSection === "tenants" ? <Tenants snapshot={snapshot} session={session} /> : null}
      {activeSection === "ai" ? <AiControl snapshot={snapshot} /> : null}
      {activeSection === "services" ? <OpsControl snapshot={snapshot} session={session} /> : null}
      {activeSection === "queues" ? <OpsControl snapshot={snapshot} session={session} /> : null}
      {activeSection === "redis" ? <OpsControl snapshot={snapshot} session={session} /> : null}
      {activeSection === "telegram" ? <OpsControl snapshot={snapshot} session={session} /> : null}
      {activeSection === "logs" ? <OpsControl snapshot={snapshot} session={session} /> : null}
      {activeSection === "alerts" ? <OpsControl snapshot={snapshot} session={session} /> : null}
      {activeSection === "incidents" ? <OpsControl snapshot={snapshot} session={session} /> : null}
      {activeSection === "flags" ? <GovernanceControl snapshot={snapshot} /> : null}
      {activeSection === "settings" ? (
        <div className="grid gap-4">
          <SiteSettings snapshot={snapshot} />
          <ContentControl snapshot={snapshot} />
          <MapsControl snapshot={snapshot} />
          <Users snapshot={snapshot} session={session} />
          <Security snapshot={snapshot} />
          <GovernanceControl snapshot={snapshot} />
        </div>
      ) : null}
    </PlatformAdminShell>
  );
}

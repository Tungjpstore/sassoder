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

export function PlatformAdminConsole({ snapshot, activeSection }: { snapshot: Snapshot; activeSection: ActiveSection }) {
  return (
    <PlatformAdminShell activeSection={activeSection} snapshot={snapshot}>
      {activeSection === "overview" ? <Overview snapshot={snapshot} /> : null}
      {activeSection === "site" ? <SiteSettings snapshot={snapshot} /> : null}
      {activeSection === "content" ? <ContentControl snapshot={snapshot} /> : null}
      {activeSection === "plans" ? <Plans snapshot={snapshot} /> : null}
      {activeSection === "billing" ? <Billing snapshot={snapshot} /> : null}
      {activeSection === "tenants" ? <Tenants snapshot={snapshot} /> : null}
      {activeSection === "users" ? <Users snapshot={snapshot} /> : null}
      {activeSection === "ai" ? <AiControl snapshot={snapshot} /> : null}
      {activeSection === "maps" ? <MapsControl snapshot={snapshot} /> : null}
      {activeSection === "atlas" ? <ProjectAtlas snapshot={snapshot} /> : null}
      {activeSection === "ops" ? <OpsControl snapshot={snapshot} /> : null}
      {activeSection === "governance" ? <GovernanceControl snapshot={snapshot} /> : null}
      {activeSection === "security" ? <Security snapshot={snapshot} /> : null}
      {activeSection === "release" ? <Release snapshot={snapshot} /> : null}
    </PlatformAdminShell>
  );
}

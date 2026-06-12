import { PlatformAdminShell } from "@/features/platform-admin/components/admin-shell";
import { AiControl } from "@/features/platform-admin/components/sections/ai-section";
import { Billing } from "@/features/platform-admin/components/sections/billing-section";
import { Overview } from "@/features/platform-admin/components/sections/overview-section";
import {
  AlertCenter,
  DeploymentCenter,
  FeatureFlagsCenter,
  IncidentCenter,
  LogimailControl,
  LogsPlatform,
  QueueCenter,
  RedisCenter,
  ServicesCenter,
  SettingsCenter,
  SystemMap,
  TelegramOpsCenter
} from "@/features/platform-admin/components/sections/devops-sections";
import { Plans } from "@/features/platform-admin/components/sections/plans-section";
import { Tenants } from "@/features/platform-admin/components/sections/tenants-section";
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
      {activeSection === "system-map" ? <SystemMap snapshot={snapshot} /> : null}
      {activeSection === "deployments" ? <DeploymentCenter snapshot={snapshot} /> : null}
      {activeSection === "payments" ? (
        <div className="grid gap-4">
          <Plans snapshot={snapshot} />
          <Billing snapshot={snapshot} />
        </div>
      ) : null}
      {activeSection === "tenants" ? <Tenants snapshot={snapshot} session={session} /> : null}
      {activeSection === "ai" ? <AiControl snapshot={snapshot} /> : null}
      {activeSection === "services" || activeSection === "backup" ? <ServicesCenter snapshot={snapshot} /> : null}
      {activeSection === "queues" ? <QueueCenter snapshot={snapshot} /> : null}
      {activeSection === "redis" ? <RedisCenter snapshot={snapshot} /> : null}
      {activeSection === "domains" || activeSection === "logimail" ? <LogimailControl snapshot={snapshot} /> : null}
      {activeSection === "telegram" ? <TelegramOpsCenter snapshot={snapshot} session={session} /> : null}
      {activeSection === "logs" ? <LogsPlatform snapshot={snapshot} /> : null}
      {activeSection === "alerts" ? <AlertCenter snapshot={snapshot} /> : null}
      {activeSection === "incidents" ? <IncidentCenter snapshot={snapshot} /> : null}
      {activeSection === "flags" ? <FeatureFlagsCenter snapshot={snapshot} /> : null}
      {activeSection === "settings" ? <SettingsCenter snapshot={snapshot} session={session} /> : null}
    </PlatformAdminShell>
  );
}

import { SectionCard, badgeTone, statusTone } from "@/features/platform-admin/components/primitives";
import { moduleStatusLabel } from "@/features/platform-admin/labels";
import type { Integration } from "@/features/platform-admin/types";

export function IntegrationGrid({ title, integrations }: { title: string; integrations: Integration[] }) {
  return (
    <SectionCard title={title}>
      <div className="grid gap-3 lg:grid-cols-2">
        {integrations.map((integration) => (
          <div key={integration.key} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">{integration.name}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{integration.category}</p>
              </div>
              <span className={badgeTone(statusTone(integration.status))}>{moduleStatusLabel[integration.status] ?? integration.status}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{integration.note}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{integration.secretHandling}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {integration.envNames.map((name) => (
                <span key={name} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-500">
                  {name}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500">
              Configured {integration.configured}/{integration.total}{integration.required ? " · required" : " · optional"}
            </p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

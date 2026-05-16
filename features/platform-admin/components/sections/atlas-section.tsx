import { Activity, AlertTriangle, ClipboardCheck, Globe2 } from "lucide-react";
import {
  MetricCard,
  SectionCard,
  badgeTone,
  criticalityTone,
  formatNumber,
  statusTone
} from "@/features/platform-admin/components/primitives";
import { moduleStatusLabel, projectSurfaceKindLabel } from "@/features/platform-admin/labels";
import type { ProjectSurface, Snapshot } from "@/features/platform-admin/types";

export function ProjectAtlas({ snapshot }: { snapshot: Snapshot }) {
  const { summary, surfaces } = snapshot.projectAtlas;
  const surfaceKinds = (Object.keys(projectSurfaceKindLabel) as Array<ProjectSurface["kind"]>).map((kind) => ({
    kind,
    label: projectSurfaceKindLabel[kind],
    count: summary[kind],
    surfaces: surfaces.filter((surface) => surface.kind === kind)
  }));
  const controlGaps = surfaces.filter((surface) => surface.control !== "live");

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Project surfaces" value={formatNumber(summary.surfaces)} detail="Frontend, backend, data, automation, integrations" icon={Globe2} tone="info" />
        <MetricCard label="Critical surfaces" value={formatNumber(summary.critical)} detail="Luồng ảnh hưởng trực tiếp production" icon={AlertTriangle} tone="warning" />
        <MetricCard label="Observe live" value={`${summary.liveObserve}/${summary.surfaces}`} detail="Đã có dữ liệu quan sát trong /admin" icon={Activity} tone="good" />
        <MetricCard label="Control gaps" value={formatNumber(summary.plannedControl)} detail="Planned hoặc blocked, cần nâng cấp dần" icon={ClipboardCheck} tone={summary.plannedControl ? "warning" : "good"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Coverage by layer">
          <div className="grid gap-2">
            {surfaceKinds.map((group) => (
              <div key={group.kind} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">{group.label}</p>
                  <span className={badgeTone("info")}>{formatNumber(group.count)} surfaces</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {group.surfaces.map((surface) => surface.name).join(" · ")}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Priority control gaps">
          <div className="grid gap-2">
            {controlGaps.slice(0, 6).map((surface) => (
              <div key={surface.key} className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-950">{surface.name}</p>
                  <span className={badgeTone(statusTone(surface.control))}>{moduleStatusLabel[surface.control] ?? surface.control}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-orange-800">{surface.nextStep}</p>
              </div>
            ))}
            {!controlGaps.length ? <p className="text-sm text-slate-500">Tất cả surfaces đã có control live.</p> : null}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Project surface map">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-3 py-3">Surface</th>
                <th className="px-3 py-3">Layer / Owner</th>
                <th className="px-3 py-3">Routes & APIs</th>
                <th className="px-3 py-3">Dependencies</th>
                <th className="px-3 py-3">Observe / Control / Audit</th>
                <th className="px-3 py-3">Next step</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {surfaces.map((surface) => (
                <tr key={surface.key} className="bg-white align-top">
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-950">{surface.name}</p>
                      <span className={badgeTone(statusTone(surface.status))}>{moduleStatusLabel[surface.status] ?? surface.status}</span>
                      <span className={badgeTone(criticalityTone(surface.criticality))}>{surface.criticality.toUpperCase()}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{surface.note}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-slate-800">{projectSurfaceKindLabel[surface.kind]}</p>
                    <p className="mt-1 text-xs text-slate-500">{surface.owner}</p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {surface.routes.slice(0, 5).map((route) => (
                        <span key={route} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-500">
                          {route}
                        </span>
                      ))}
                      {surface.routes.length > 5 ? <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">+{surface.routes.length - 5}</span> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {surface.dependencies.slice(0, 5).map((dependency) => (
                        <span key={dependency} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">
                          {dependency}
                        </span>
                      ))}
                      {surface.dependencies.length > 5 ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">+{surface.dependencies.length - 5}</span> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="grid gap-1">
                      {[
                        ["Observe", surface.observe],
                        ["Control", surface.control],
                        ["Audit", surface.audit]
                      ].map(([label, state]) => (
                        <div key={`${surface.key}-${label}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                          <span className="text-[11px] font-semibold text-slate-500">{label}</span>
                          <span className={badgeTone(statusTone(state))}>{moduleStatusLabel[state] ?? state}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{surface.nextStep}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

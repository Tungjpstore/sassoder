import Link from "next/link";
import { ClipboardCheck, GitBranch, ShieldCheck, UserRound } from "lucide-react";
import {
  MetricCard,
  SectionCard,
  badgeTone,
  formatNumber,
  riskTone,
  statusTone
} from "@/features/platform-admin/components/primitives";
import { moduleStatusLabel } from "@/features/platform-admin/labels";
import type { Snapshot } from "@/features/platform-admin/types";

export function GovernanceControl({ snapshot }: { snapshot: Snapshot }) {
  const summary = snapshot.governance.summary;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Capabilities" value={formatNumber(summary.capabilities)} detail={`${summary.liveObserve} vùng quan sát live`} icon={ClipboardCheck} tone="info" />
        <MetricCard label="Live mutations" value={formatNumber(summary.liveAdjust)} detail={`${summary.highRiskMutations} high-risk mutations đã map`} icon={ShieldCheck} tone="warning" />
        <MetricCard label="Rollback gaps" value={formatNumber(summary.partialOrPlannedRollback)} detail="Cần revision/approval để rollback sạch" icon={GitBranch} tone={summary.partialOrPlannedRollback ? "warning" : "good"} />
        <MetricCard label="RBAC roles" value={`${summary.rolesReady}/${summary.rolesReady + summary.rolesPlanned}`} detail="Runtime RBAC chưa bật" icon={UserRound} tone="warning" />
      </div>

      <SectionCard title="Capability matrix">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-3 py-3">Vùng</th>
                <th className="px-3 py-3">Owner</th>
                <th className="px-3 py-3">Observe</th>
                <th className="px-3 py-3">Adjust</th>
                <th className="px-3 py-3">Audit</th>
                <th className="px-3 py-3">Rollback</th>
                <th className="px-3 py-3">Next step</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {snapshot.governance.capabilities.map((capability) => (
                <tr key={capability.key} className="bg-white align-top">
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={capability.section} className="font-semibold text-slate-950 hover:underline">{capability.name}</Link>
                      <span className={badgeTone(statusTone(capability.status))}>{moduleStatusLabel[capability.status] ?? capability.status}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{capability.note}</p>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{capability.owner}</td>
                  {[capability.observe, capability.adjust, capability.audit, capability.rollback].map((state, index) => (
                    <td key={`${capability.key}-${index}`} className="px-3 py-3">
                      <span className={badgeTone(statusTone(state))}>{moduleStatusLabel[state] ?? state}</span>
                    </td>
                  ))}
                  <td className="px-3 py-3 text-slate-600">{capability.nextStep}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard title="Mutation registry">
          <div className="grid gap-3">
            {snapshot.governance.mutations.map((mutation) => (
              <div key={mutation.key} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-950">{mutation.name}</p>
                      <span className={badgeTone(riskTone(mutation.risk))}>{mutation.risk.toUpperCase()}</span>
                      <span className={badgeTone(statusTone(mutation.status))}>{moduleStatusLabel[mutation.status] ?? mutation.status}</span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate-500">{mutation.key} · {mutation.surface}</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-600 md:grid-cols-3">
                  <span><strong className="text-slate-800">Guard:</strong> {mutation.guard}</span>
                  <span><strong className="text-slate-800">Audit:</strong> {mutation.auditAction}</span>
                  <span><strong className="text-slate-800">Rollback:</strong> {mutation.rollback}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="grid gap-4">
          <SectionCard title="RBAC readiness">
            <div className="grid gap-2">
              {snapshot.governance.roles.map((role) => (
                <div key={role.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-950">{role.role}</p>
                    <span className={badgeTone(statusTone(role.status))}>{moduleStatusLabel[role.status] ?? role.status}</span>
                  </div>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{role.scope}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{role.note}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Production guardrails tiếp theo">
            <div className="grid gap-2 text-sm leading-6 text-slate-600">
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-orange-800">
                High-risk billing, tenant và plan actions nên đi qua two-person approval trước khi mở rộng team.
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                Content/blog/pricing cần revision immutable để rollback trong vài giây thay vì khôi phục thủ công.
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                Support mode nên có reason, expiry, read-only mặc định và audit trước khi cho xem sâu tenant data.
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

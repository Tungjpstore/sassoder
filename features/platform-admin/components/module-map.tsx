import { SectionCard, badgeTone, statusTone } from "@/features/platform-admin/components/primitives";
import { moduleStatusLabel } from "@/features/platform-admin/labels";
import type { Snapshot } from "@/features/platform-admin/types";

export function ModuleMap({ snapshot }: { snapshot: Snapshot }) {
  return (
    <SectionCard title="Bản đồ năng lực nền tảng">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {snapshot.modules.map((module) => (
          <div key={module.key} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">{module.name}</p>
                <p className="mt-1 text-xs text-slate-500">{module.owner}</p>
              </div>
              <span className={badgeTone(statusTone(module.status))}>{moduleStatusLabel[module.status] ?? module.status}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{module.note}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

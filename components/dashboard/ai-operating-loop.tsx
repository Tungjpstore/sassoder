import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileCheck2,
  type LucideIcon,
  PlayCircle,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type AiOperatingLoopStageId = "detect" | "approve" | "act" | "verify" | "audit";
export type AiOperatingLoopTone = "green" | "yellow" | "blue" | "red" | "neutral";

export type AiOperatingLoopStage = {
  id: AiOperatingLoopStageId;
  label?: string;
  value: string | number;
  detail: string;
  href: string;
  tone?: AiOperatingLoopTone;
  active?: boolean;
};

const stageIcons: Record<AiOperatingLoopStageId, LucideIcon> = {
  detect: Eye,
  approve: ClipboardCheck,
  act: PlayCircle,
  verify: FileCheck2,
  audit: ShieldCheck
};

const defaultStages: Record<AiOperatingLoopStageId, Omit<AiOperatingLoopStage, "value" | "detail" | "href">> = {
  detect: { id: "detect", label: "Phát hiện", tone: "blue" },
  approve: { id: "approve", label: "Duyệt", tone: "yellow" },
  act: { id: "act", label: "Thao tác", tone: "green" },
  verify: { id: "verify", label: "Kiểm tra", tone: "blue" },
  audit: { id: "audit", label: "Hoàn tất", tone: "neutral" }
};

function mergeStage(input: AiOperatingLoopStage): AiOperatingLoopStage {
  return {
    ...defaultStages[input.id],
    ...input
  };
}

export function AiOperatingLoop({
  title = "AI Operating Loop",
  subtitle = "Một luồng thống nhất: AI phát hiện việc thật, chủ quán duyệt, AI tạo nháp an toàn, rồi kiểm tra và hoàn tất.",
  stages,
  primaryAction,
  secondaryAction,
  compact = false
}: {
  title?: string;
  subtitle?: string;
  stages: AiOperatingLoopStage[];
  primaryAction?: {
    href: string;
    label: string;
  };
  secondaryAction?: {
    href: string;
    label: string;
  };
  compact?: boolean;
}) {
  const mergedStages = stages.map(mergeStage);
  const activeStage = mergedStages.find((stage) => stage.active) ?? mergedStages.find((stage) => Number(stage.value) > 0) ?? mergedStages[0];
  const openStageCount = mergedStages.filter((stage) => Number(stage.value) > 0).length;

  return (
    <section className="dashboard-panel overflow-hidden p-0">
      <div className="grid gap-0 xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)]">
        <div className="border-b border-[var(--border)] bg-[var(--soft-surface)] p-4 xl:border-b-0 xl:border-r">
          <p className="dashboard-eyebrow inline-flex items-center gap-2">
            <Sparkles size={15} />
            AI
          </p>
          <h2 className="dashboard-section-title mt-1">{title}</h2>
          <p className="sr-only">{subtitle}</p>

          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="flex items-start justify-between gap-3">
              <span>
                <span className="block text-[11px] font-bold uppercase text-[var(--muted-foreground)]">Đang xử lý</span>
                <span className="mt-1 block text-base font-bold text-[var(--foreground)]">{activeStage?.label ?? "Theo dõi"}</span>
              </span>
              <Badge tone={activeStage?.tone ?? "neutral"}>{activeStage?.value ?? 0}</Badge>
            </div>
            <p className="mt-2 text-xs font-semibold leading-5 text-[var(--muted-foreground)]">{activeStage?.detail ?? "Chưa có việc đang mở."}</p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">Luồng có việc</p>
              <p className="metric-number mt-1 text-xl font-semibold">{openStageCount}/5</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">Chế độ</p>
              <p className="mt-1 text-sm font-bold text-[var(--foreground)]">Xác nhận trước</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {primaryAction ? (
              <Link href={primaryAction.href} className="admin-glow-btn inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold">
                {primaryAction.label}
                <ArrowRight size={15} />
              </Link>
            ) : null}
            {secondaryAction ? (
              <Link href={secondaryAction.href} className="dashboard-secondary-action">
                {secondaryAction.label}
              </Link>
            ) : null}
          </div>
        </div>

        <div className="p-4">
          <div className={`grid gap-2 ${compact ? "md:grid-cols-5" : "lg:grid-cols-5"}`}>
            {mergedStages.map((stage, index) => {
              const Icon = stageIcons[stage.id];
              return (
                <Link
                  key={stage.id}
                  href={stage.href}
                  className={`group min-h-28 rounded-xl border px-3 py-3 transition hover:border-[var(--primary)] hover:bg-[var(--surface)] ${
                    stage.active
                      ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                      : "border-[var(--border)] bg-[var(--soft-surface)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase text-[var(--muted-foreground)]">
                      <span className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)]">
                        <Icon size={14} />
                      </span>
                      {index + 1}
                    </span>
                    {stage.active ? <CheckCircle2 size={15} className="text-[var(--primary)]" /> : <ArrowUpRight size={14} className="text-[var(--muted-foreground)]" />}
                  </div>
                  <p className="mt-3 text-sm font-bold text-[var(--foreground)]">{stage.label}</p>
                  <div className="mt-1 flex items-end justify-between gap-2">
                    <strong className="metric-number text-2xl font-semibold tabular-nums text-[var(--foreground)]">{stage.value}</strong>
                    <Badge tone={stage.tone ?? "neutral"}>{stage.active ? "Đang làm" : "Mở"}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs font-semibold leading-5 text-[var(--muted-foreground)]">{stage.detail}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

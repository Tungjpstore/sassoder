import Link from "next/link";
import {
  ArrowRight,
  BadgePercent,
  BrainCircuit,
  Copy,
  Gift,
  Megaphone,
  MessageSquareText,
  PackagePlus,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  UsersRound,
  WandSparkles,
  type LucideIcon
} from "lucide-react";
import { AiOwnerActionLauncher } from "@/components/dashboard/ai-owner-action-launcher";
import { AiOperatingLoop } from "@/components/dashboard/ai-operating-loop";
import { AdminShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import { buildAiAutomationPlaybooks } from "@/lib/ai/automation-playbooks";
import {
  buildAiGrowthStudioDeck,
  type AiGrowthCampaign,
  type AiGrowthCampaignChannel,
  type AiGrowthCampaignStatus
} from "@/lib/ai/growth-studio";
import { listRestaurantAiMemories } from "@/lib/ai/memory/restaurant-memory";
import { getResolvedAiProviderReadiness } from "@/lib/ai/providers/registry";
import { getAiSchemaReadiness } from "@/lib/ai/schema-readiness";
import { requireDashboardAdminAccess } from "@/lib/dashboard-access";
import { listRecentAiAutomationRuns } from "@/services/ai-automation-run-service";
import { listRecentAiRecommendations } from "@/services/ai-recommendation-service";
import { listPublicPromotions } from "@/services/promotion-service";

export const dynamic = "force-dynamic";

function schemaFlags(schemas: Awaited<ReturnType<typeof getAiSchemaReadiness>>) {
  return {
    recommendations: schemas.checks.find((check) => check.key === "recommendations")?.ready ?? false,
    restaurantMemories: schemas.checks.find((check) => check.key === "restaurantMemories")?.ready ?? false,
    automationRuns: schemas.checks.find((check) => check.key === "automationRuns")?.ready ?? false
  };
}

function statusTone(status: AiGrowthCampaignStatus) {
  if (status === "ready") return "green";
  if (status === "blocked") return "red";
  return "yellow";
}

function statusLabel(status: AiGrowthCampaignStatus) {
  if (status === "ready") return "Sẵn sàng";
  if (status === "blocked") return "Bị chặn";
  return "Bản nháp";
}

function priorityTone(priority: AiGrowthCampaign["priority"]) {
  if (priority === "critical") return "red";
  if (priority === "high") return "yellow";
  return "blue";
}

function channelLabel(channel: AiGrowthCampaignChannel) {
  if (channel === "facebook") return "Facebook";
  if (channel === "zalo") return "Zalo";
  if (channel === "qr_menu") return "QR menu";
  if (channel === "online_ordering") return "Online";
  if (channel === "push") return "Push";
  return "Nhân viên";
}

const campaignIcons: Record<AiGrowthCampaign["type"], LucideIcon> = {
  quiet_hour: Megaphone,
  combo_builder: PackagePlus,
  upsell: TrendingUp,
  retention: UsersRound,
  menu_refresh: SlidersHorizontal,
  pricing_guard: ShieldCheck,
  delivery_push: Gift
};

function CampaignCard({ campaign }: { campaign: AiGrowthCampaign }) {
  const Icon = campaignIcons[campaign.type] ?? Sparkles;
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] text-[var(--primary)]">
            <Icon size={17} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <Badge tone={statusTone(campaign.status)}>{statusLabel(campaign.status)}</Badge>
              <Badge tone={priorityTone(campaign.priority)}>{campaign.priority}</Badge>
            </div>
            <p className="mt-2 text-sm font-bold text-[var(--foreground)]">{campaign.title}</p>
            <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{campaign.audience}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-2.5 py-1.5 text-right">
          <span className="block text-[10px] font-semibold uppercase text-[var(--muted-foreground)]">Impact</span>
          <strong className="text-xs font-bold text-[var(--foreground)]">{campaign.estimatedImpact}</strong>
        </span>
      </div>

      <div className="mt-3 grid gap-2">
        <div className="rounded-lg bg-[var(--soft-surface)] px-3 py-2">
          <p className="text-[11px] font-bold uppercase text-[var(--muted-foreground)]">Offer</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--foreground)]">{campaign.offer}</p>
        </div>
        <div className="rounded-lg bg-[var(--soft-surface)] px-3 py-2">
          <p className="text-[11px] font-bold uppercase text-[var(--muted-foreground)]">Góc nội dung</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--foreground)]">{campaign.messageAngle}</p>
        </div>
      </div>

      {campaign.blockers.length ? (
        <div className="mt-3 rounded-lg border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-3 py-2">
          <p className="text-[11px] font-bold uppercase text-[var(--accent-strong)]">Blocker</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--accent-strong)]">{campaign.blockers[0]}</p>
        </div>
      ) : campaign.sourceSignals.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {campaign.sourceSignals.slice(0, 3).map((signal) => (
            <Badge key={signal} tone="green">{signal}</Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {campaign.channels.slice(0, 4).map((channel) => (
            <Badge key={channel}>{channelLabel(channel)}</Badge>
          ))}
        </div>
        <Link
          href={campaign.actionHref}
          className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] transition hover:border-[var(--primary)]"
          aria-label={`Mở xử lý ${campaign.title}`}
          title="Mở xử lý"
        >
          <ArrowRight size={16} />
        </Link>
      </div>
      <p className="mt-3 text-xs font-semibold leading-5 text-[var(--foreground)]">{campaign.nextAction}</p>
    </article>
  );
}

export default async function AiGrowthPage() {
  const { session, entitlement } = await requireDashboardAdminAccess("ai_owner_assistant");
  const [providers, schemas, memoriesResult, recommendationsResult, workflowRunsResult, activePromotions] = await Promise.all([
    getResolvedAiProviderReadiness(),
    getAiSchemaReadiness(),
    listRestaurantAiMemories({ restaurantId: session.restaurantId, includeSensitive: false, limit: 20 }),
    listRecentAiRecommendations(session.restaurantId, 30),
    listRecentAiAutomationRuns(session.restaurantId, 30),
    listPublicPromotions(session.restaurantId, "WEBSITE").catch(() => [])
  ]);
  const flags = schemaFlags(schemas);
  const providerConfigured = providers.some((provider) => provider.configured);
  const playbookDeck = buildAiAutomationPlaybooks({
    providerConfigured,
    schemas: flags,
    memoryCount: memoriesResult.memories.length,
    recommendations: recommendationsResult.recommendations.map((recommendation) => ({
      id: recommendation.id,
      type: recommendation.type,
      priority: recommendation.priority,
      title: recommendation.title
    })),
    workflows: workflowRunsResult.workflows.map((workflow) => ({
      id: workflow.id,
      domain: workflow.domain,
      priority: workflow.priority,
      title: workflow.title
    }))
  });
  const growthDeck = buildAiGrowthStudioDeck({
    providerConfigured,
    schemas: flags,
    memoryCount: memoriesResult.memories.length,
    activePromotionCount: activePromotions.length,
    recommendations: recommendationsResult.recommendations.map((recommendation) => ({
      id: recommendation.id,
      type: recommendation.type,
      priority: recommendation.priority,
      title: recommendation.title,
      detail: recommendation.detail,
      action: recommendation.action,
      actionHref: recommendation.actionHref,
      estimatedImpactLabel: recommendation.estimatedImpact?.label ?? null
    })),
    playbooks: playbookDeck.playbooks.map((playbook) => ({
      id: playbook.id,
      domain: playbook.domain,
      status: playbook.status,
      title: playbook.title,
      readinessScore: playbook.readinessScore
    }))
  });

  const metricCards = [
    {
      label: "Campaigns",
      value: growthDeck.summary.total,
      detail: `${growthDeck.summary.ready} ready · ${growthDeck.summary.draft} draft`,
      icon: Target,
      tone: growthDeck.summary.blocked ? "yellow" : "green"
    },
    {
      label: "High priority",
      value: growthDeck.summary.highPriority,
      detail: "Chiến dịch đáng ưu tiên",
      icon: TrendingUp,
      tone: growthDeck.summary.highPriority ? "green" : "blue"
    },
    {
      label: "Promotions",
      value: growthDeck.summary.activePromotions,
      detail: "Mã đang public",
      icon: BadgePercent,
      tone: growthDeck.summary.activePromotions ? "green" : "yellow"
    },
    {
      label: "Memory",
      value: growthDeck.summary.memoryCount,
      detail: "Ngữ cảnh brand/menu",
      icon: MessageSquareText,
      tone: growthDeck.summary.memoryCount ? "green" : "yellow"
    },
    {
      label: "Copy kits",
      value: growthDeck.copyKits.length,
      detail: "Prompt nội dung sẵn dùng",
      icon: Copy,
      tone: growthDeck.copyKits.length ? "green" : "yellow"
    },
    {
      label: "Blocked",
      value: growthDeck.summary.blocked,
      detail: "Thiếu provider/schema/memory",
      icon: ShieldCheck,
      tone: growthDeck.summary.blocked ? "yellow" : "green"
    }
  ] as const;

  return (
    <AdminShell
      title="Marketing AI"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Tạo ưu đãi, caption Facebook/Zalo, combo và chiến dịch kéo khách quay lại"
      showLiveActionCenter={false}
    >
      <div className="dashboard-ai-workspace grid gap-3">
        <AiOwnerActionLauncher variant="growth" />
        <AiOperatingLoop
          title="Luồng AI Growth từ tín hiệu tới campaign nháp"
          subtitle="Marketing AI được nối vào vận hành: doanh thu/menu/promotion signal tạo campaign, chủ quán duyệt, AI tạo mã hoặc copy nháp rồi mới publish."
          primaryAction={{ href: "/dashboard/ai-execution", label: "Duyệt campaign" }}
          secondaryAction={{ href: "/dashboard/promotions", label: "Mở khuyến mãi" }}
          stages={[
            { id: "detect", value: growthDeck.summary.total, detail: "Campaign từ doanh thu, menu, promotion và playbook", href: "/dashboard/ai-growth", tone: growthDeck.summary.total ? "green" : "blue", active: true },
            { id: "approve", value: recommendationsResult.recommendations.filter((recommendation) => ["promotion", "customer_retention", "pricing"].includes(recommendation.type)).length, detail: "Growth recommendation đang mở", href: "/dashboard/ai-execution", tone: "yellow" },
            { id: "act", value: growthDeck.summary.ready, detail: "Có thể tạo mã/copy nháp", href: "/dashboard/ai-apply", tone: growthDeck.summary.ready ? "green" : "blue" },
            { id: "verify", value: growthDeck.summary.blocked, detail: "Thiếu memory, provider hoặc schema", href: "/dashboard/ai-control", tone: growthDeck.summary.blocked ? "red" : "green" },
            { id: "audit", value: growthDeck.summary.activePromotions, detail: "Campaign/promotion đang public", href: "/dashboard/promotions", tone: "neutral" }
          ]}
        />
        <div className="dashboard-ai-toolbar flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/ai-control" className="dashboard-secondary-action">
              <SlidersHorizontal size={16} />
              Cấu hình AI
            </Link>
            <Link href="/dashboard/ai-automation" className="dashboard-secondary-action">
              <BrainCircuit size={16} />
              Tự động hóa
            </Link>
          </div>
          <Link href="/dashboard/promotions" className="dashboard-secondary-action">
            Mở khuyến mãi
            <ArrowRight size={15} />
          </Link>
        </div>

        <section className="dashboard-ai-metric-grid grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {metricCards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.label} className="admin-stat-tile p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="dashboard-stat-icon">
                    <Icon size={18} />
                  </span>
                  <Badge tone={card.tone}>{card.label}</Badge>
                </div>
                <p className="metric-number mt-4 text-2xl font-semibold tabular-nums">{card.value}</p>
                <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">{card.detail}</p>
              </article>
            );
          })}
        </section>

        <section className="dashboard-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="dashboard-eyebrow inline-flex items-center gap-2">
                <WandSparkles size={15} />
                Growth campaigns
              </p>
              <h2 className="dashboard-section-title mt-1">Chiến dịch AI có thể triển khai</h2>
            </div>
            <Badge tone={growthDeck.summary.ready ? "green" : "yellow"}>{growthDeck.summary.ready} ready</Badge>
          </div>
          <div className="dashboard-ai-card-grid mt-3 grid gap-3 xl:grid-cols-2">
            {growthDeck.campaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        </section>

        <section className="dashboard-ai-split-grid grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <section className="dashboard-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="dashboard-eyebrow inline-flex items-center gap-2">
                  <Copy size={15} />
                  Copy kits
                </p>
                <h2 className="dashboard-section-title mt-1">Prompt nội dung sẵn dùng</h2>
              </div>
              <Badge tone={growthDeck.copyKits.length ? "green" : "yellow"}>{growthDeck.copyKits.length} kit</Badge>
            </div>
            {growthDeck.copyKits.length ? (
              <div className="mt-3 grid gap-3">
                {growthDeck.copyKits.map((kit) => (
                  <article key={kit.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-[var(--foreground)]">{kit.label}</p>
                        <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">{channelLabel(kit.channel)}</p>
                      </div>
                      <Badge>{kit.channel}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{kit.prompt}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-3 grid min-h-24 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
                Cần provider AI và memory brand/menu để tạo copy kit đủ an toàn cho Facebook, Zalo, QR menu và push.
              </div>
            )}
          </section>

          <aside className="dashboard-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="dashboard-eyebrow inline-flex items-center gap-2">
                  <ShieldCheck size={15} />
                  An toàn
                </p>
                <h2 className="dashboard-section-title mt-1">Kiểm trước khi chạy</h2>
              </div>
              <Badge>F&B</Badge>
            </div>
            <div className="mt-3 grid gap-2">
              {[
                ["Không giảm giá vô tội vạ", "Ưu tiên combo, min order, quà nhỏ hoặc topping có biên tốt."],
                ["Không bịa dữ liệu tài chính", "Campaign chỉ dùng recommendation/playbook đã có tín hiệu và luôn ghi blocker."],
                ["Không lộ thông tin khách", "Retention dùng segment hành vi tổng hợp, không đưa PII vào nội dung."],
                ["Không publish tự động", "Tạo nội dung và offer ở chế độ duyệt trước, chủ quán quyết định triển khai."]
              ].map(([title, detail]) => (
                <div key={title} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2.5">
                  <p className="text-sm font-bold text-[var(--foreground)]">{title}</p>
                  <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{detail}</p>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </AdminShell>
  );
}

import Link from "next/link";
import {
  ArrowRight,
  BadgePercent,
  BrainCircuit,
  Camera,
  ChefHat,
  Copy,
  ImagePlus,
  Layers3,
  ListChecks,
  PackagePlus,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tags,
  TrendingUp,
  WandSparkles,
  type LucideIcon
} from "lucide-react";
import { AiOwnerActionLauncher } from "@/components/dashboard/ai-owner-action-launcher";
import { AiOperatingLoop } from "@/components/dashboard/ai-operating-loop";
import { AdminShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import { buildAiMenuStudioDeck, type AiMenuOpportunity, type AiMenuOpportunityStatus, type AiMenuStudioChannel } from "@/lib/ai/menu-studio";
import { listRestaurantAiMemories } from "@/lib/ai/memory/restaurant-memory";
import { getResolvedAiProviderReadiness } from "@/lib/ai/providers/registry";
import { getAiSchemaReadiness } from "@/lib/ai/schema-readiness";
import { requireDashboardAdminAccess } from "@/lib/dashboard-access";
import { getAdminReport } from "@/services/dashboard-report-service";
import { listRecentAiRecommendations } from "@/services/ai-recommendation-service";
import { listMenuForAdmin } from "@/services/menu-service";

export const dynamic = "force-dynamic";

function schemaFlags(schemas: Awaited<ReturnType<typeof getAiSchemaReadiness>>) {
  return {
    restaurantMemories: schemas.checks.find((check) => check.key === "restaurantMemories")?.ready ?? false,
    recommendations: schemas.checks.find((check) => check.key === "recommendations")?.ready ?? false
  };
}

function statusTone(status: AiMenuOpportunityStatus) {
  if (status === "ready") return "green";
  if (status === "blocked") return "red";
  return "yellow";
}

function statusLabel(status: AiMenuOpportunityStatus) {
  if (status === "ready") return "Sẵn sàng";
  if (status === "blocked") return "Bị chặn";
  return "Bản nháp";
}

function priorityTone(priority: AiMenuOpportunity["priority"]) {
  if (priority === "critical") return "red";
  if (priority === "high") return "yellow";
  return "blue";
}

function channelLabel(channel: AiMenuStudioChannel) {
  if (channel === "qr_menu") return "QR menu";
  if (channel === "online_ordering") return "Online";
  if (channel === "staff_script") return "Nhân viên";
  if (channel === "facebook") return "Facebook";
  if (channel === "zalo") return "Zalo";
  return "Menu editor";
}

const opportunityIcons: Record<AiMenuOpportunity["type"], LucideIcon> = {
  image_refresh: ImagePlus,
  combo_builder: PackagePlus,
  modifier_upsell: Tags,
  seasonal_item: Sparkles,
  pricing_guard: ShieldCheck,
  availability_cleanup: ListChecks,
  category_balance: Layers3,
  menu_copy: Copy
};

function OpportunityCard({ opportunity }: { opportunity: AiMenuOpportunity }) {
  const Icon = opportunityIcons[opportunity.type] ?? WandSparkles;
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] text-[var(--primary)]">
            <Icon size={17} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={statusTone(opportunity.status)}>{statusLabel(opportunity.status)}</Badge>
              <Badge tone={priorityTone(opportunity.priority)}>{opportunity.priority}</Badge>
            </div>
            <p className="mt-2 text-sm font-bold text-[var(--foreground)]">{opportunity.title}</p>
            <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{opportunity.reason}</p>
          </div>
        </div>
        <Link
          href={opportunity.actionHref}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] transition hover:border-[var(--primary)]"
          aria-label={`Mở xử lý ${opportunity.title}`}
          title="Mở xử lý"
        >
          <ArrowRight size={16} />
        </Link>
      </div>

      <div className="mt-3 grid gap-2">
        <div className="rounded-lg bg-[var(--soft-surface)] px-3 py-2">
          <p className="text-[11px] font-bold uppercase text-[var(--muted-foreground)]">Target</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--foreground)]">{opportunity.target}</p>
        </div>
        <div className="rounded-lg bg-[var(--soft-surface)] px-3 py-2">
          <p className="text-[11px] font-bold uppercase text-[var(--muted-foreground)]">Hành động</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--foreground)]">{opportunity.action}</p>
        </div>
      </div>

      {opportunity.blockers.length ? (
        <div className="mt-3 rounded-lg border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-3 py-2">
          <p className="text-[11px] font-bold uppercase text-[var(--accent-strong)]">Blocker</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--accent-strong)]">{opportunity.blockers[0]}</p>
        </div>
      ) : opportunity.sourceSignals.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {opportunity.sourceSignals.slice(0, 4).map((signal) => (
            <Badge key={signal} tone="green">{signal}</Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {opportunity.channels.map((channel) => (
            <Badge key={channel}>{channelLabel(channel)}</Badge>
          ))}
        </div>
        <span className="text-xs font-bold text-[var(--primary)]">{opportunity.estimatedImpact}</span>
      </div>
      <p className="mt-3 text-xs font-semibold leading-5 text-[var(--foreground)]">{opportunity.nextAction}</p>
    </article>
  );
}

export default async function AiMenuPage() {
  const { session, entitlement } = await requireDashboardAdminAccess("ai_owner_assistant");
  const [providers, schemas, memoriesResult, recommendationsResult, categories, report] = await Promise.all([
    getResolvedAiProviderReadiness(),
    getAiSchemaReadiness(),
    listRestaurantAiMemories({ restaurantId: session.restaurantId, includeSensitive: false, limit: 40 }),
    listRecentAiRecommendations(session.restaurantId, 30),
    listMenuForAdmin(session.restaurantId),
    getAdminReport(session.restaurantId)
  ]);
  const topItemIds = new Set(report.topItems.map((item) => item.id));
  const menuDeck = buildAiMenuStudioDeck({
    providerConfigured: providers.some((provider) => provider.configured),
    schemas: schemaFlags(schemas),
    items: categories.flatMap((category) =>
      category.items.map((item) => ({
        id: item.id,
        categoryId: category.id,
        categoryName: category.name,
        name: item.name,
        price: item.price,
        imageUrl: item.image_url,
        isAvailable: item.is_available,
        modifierGroupCount: item.modifierGroups?.length ?? 0,
        modifierOptionCount: (item.modifierGroups ?? []).reduce((sum, group) => sum + group.options.length, 0),
        isTopSeller: topItemIds.has(item.id)
      }))
    ),
    memories: memoriesResult.memories.map((memory) => ({
      id: memory.id,
      category: memory.category,
      title: memory.title,
      sensitivity: memory.sensitivity
    })),
    recommendations: recommendationsResult.recommendations.map((recommendation) => ({
      id: recommendation.id,
      type: recommendation.type,
      priority: recommendation.priority,
      title: recommendation.title,
      detail: recommendation.detail
    }))
  });

  const metricCards = [
    {
      label: "Menu items",
      value: menuDeck.summary.totalItems,
      detail: `${menuDeck.summary.availableItems} đang bán · ${menuDeck.summary.pausedItems} tạm ngưng`,
      icon: ChefHat,
      tone: menuDeck.summary.totalItems ? "green" : "yellow"
    },
    {
      label: "Missing image",
      value: menuDeck.summary.missingImageItems,
      detail: "Món đang bán chưa có ảnh",
      icon: Camera,
      tone: menuDeck.summary.missingImageItems ? "yellow" : "green"
    },
    {
      label: "Topping",
      value: `${menuDeck.summary.modifierCoveragePercent}%`,
      detail: "Coverage topping/option",
      icon: Tags,
      tone: menuDeck.summary.modifierCoveragePercent >= 60 ? "green" : "yellow"
    },
    {
      label: "Top sellers",
      value: menuDeck.summary.topSellerCount,
      detail: "Có thể làm combo",
      icon: TrendingUp,
      tone: menuDeck.summary.topSellerCount ? "green" : "blue"
    },
    {
      label: "Ready",
      value: menuDeck.summary.ready,
      detail: "Opportunity có thể xử lý",
      icon: Sparkles,
      tone: menuDeck.summary.ready ? "green" : "yellow"
    },
    {
      label: "Blocked",
      value: menuDeck.summary.blocked,
      detail: "Thiếu provider/schema/memory",
      icon: ShieldCheck,
      tone: menuDeck.summary.blocked ? "yellow" : "green"
    }
  ] as const;

  return (
    <AdminShell
      title="AI Menu & Combo"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Tạo combo, ảnh món, mô tả, topping và ý tưởng bán thêm từ menu thật của quán"
      showLiveActionCenter={false}
    >
      <div className="dashboard-ai-workspace grid gap-3">
        <AiOwnerActionLauncher variant="menu" />
        <AiOperatingLoop
          title="Luồng AI Menu từ insight tới món nháp"
          subtitle="Menu Studio không chỉ gợi ý: cơ hội menu đi vào hàng duyệt, sau đó AI có thể tạo món/combo nháp tạm ẩn để chủ quán kiểm tra."
          primaryAction={{ href: "/dashboard/ai-execution", label: "Duyệt đề xuất menu" }}
          secondaryAction={{ href: "/dashboard/menu", label: "Mở menu thật" }}
          stages={[
            { id: "detect", value: menuDeck.opportunities.length, detail: "Cơ hội từ menu thật, top seller, ảnh, topping", href: "/dashboard/ai-menu", tone: menuDeck.opportunities.length ? "green" : "blue", active: true },
            { id: "approve", value: recommendationsResult.recommendations.filter((recommendation) => ["combo", "upsell", "menu", "pricing"].includes(recommendation.type)).length, detail: "Recommendation menu đang mở", href: "/dashboard/ai-execution", tone: "yellow" },
            { id: "act", value: menuDeck.summary.ready, detail: "Có thể xử lý hoặc đưa thành món/combo nháp", href: "/dashboard/ai-apply", tone: menuDeck.summary.ready ? "green" : "blue" },
            { id: "verify", value: menuDeck.summary.blocked + menuDeck.summary.pausedItems, detail: "Blocked hoặc món tạm ngưng cần kiểm tra", href: "/dashboard/menu", tone: menuDeck.summary.blocked ? "red" : "yellow" },
            { id: "audit", value: menuDeck.menuHealth.length, detail: "Health check để giữ menu sạch", href: "/dashboard/ai-menu", tone: "neutral" }
          ]}
        />
        <div className="dashboard-ai-toolbar flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/menu" className="dashboard-secondary-action">
              <ChefHat size={16} />
              Menu món
            </Link>
            <Link href="/dashboard/ai-control" className="dashboard-secondary-action">
              <SlidersHorizontal size={16} />
              Cấu hình AI
            </Link>
            <Link href="/dashboard/ai-growth" className="dashboard-secondary-action">
              <TrendingUp size={16} />
              Marketing AI
            </Link>
          </div>
          <Link href="/dashboard/ai-execution" className="dashboard-secondary-action">
            Duyệt đề xuất
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
                Menu opportunities
              </p>
              <h2 className="dashboard-section-title mt-1">Việc AI đề xuất cho menu</h2>
            </div>
            <Badge tone={menuDeck.summary.ready ? "green" : "yellow"}>{menuDeck.summary.ready} ready</Badge>
          </div>
          <div className="dashboard-ai-card-grid mt-3 grid gap-3 xl:grid-cols-2">
            {menuDeck.opportunities.map((opportunity) => (
              <OpportunityCard key={opportunity.id} opportunity={opportunity} />
            ))}
          </div>
        </section>

        <section className="dashboard-ai-split-grid grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <section className="dashboard-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="dashboard-eyebrow inline-flex items-center gap-2">
                  <Copy size={15} />
                  Prompt kits
                </p>
                <h2 className="dashboard-section-title mt-1">Prompt ảnh, combo và copy menu</h2>
              </div>
              <Badge tone={menuDeck.promptKits.length ? "green" : "yellow"}>{menuDeck.promptKits.length} kit</Badge>
            </div>
            {menuDeck.promptKits.length ? (
              <div className="mt-3 grid gap-3">
                {menuDeck.promptKits.map((kit) => (
                  <article key={kit.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-[var(--foreground)]">{kit.label}</p>
                        <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">{channelLabel(kit.channel)}</p>
                      </div>
                      <Badge>{kit.channel}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{kit.prompt}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-3 grid min-h-24 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
                Cần provider AI và memory menu/brand để tạo prompt đủ an toàn.
              </div>
            )}
          </section>

          <aside className="grid gap-3">
            <section className="dashboard-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="dashboard-eyebrow inline-flex items-center gap-2">
                    <BadgePercent size={15} />
                    Menu health
                  </p>
                  <h2 className="dashboard-section-title mt-1">Chất lượng menu vận hành</h2>
                </div>
                <Badge>{menuDeck.menuHealth.length} checks</Badge>
              </div>
              <div className="mt-3 grid gap-2">
                {menuDeck.menuHealth.map((check) => (
                  <div key={check.id} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-[var(--foreground)]">{check.label}</p>
                      <Badge tone={check.status === "good" ? "green" : check.status === "watch" ? "yellow" : "red"}>{check.value}</Badge>
                    </div>
                    <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{check.detail}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="dashboard-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="dashboard-eyebrow inline-flex items-center gap-2">
                    <ShieldCheck size={15} />
                    Guardrails
                  </p>
                  <h2 className="dashboard-section-title mt-1">Luật an toàn menu</h2>
                </div>
                <Badge>Publish safe</Badge>
              </div>
              <div className="mt-3 grid gap-2">
                {menuDeck.guardrails.map((guardrail) => (
                  <div key={guardrail.id} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2.5">
                    <p className="text-sm font-bold text-[var(--foreground)]">{guardrail.title}</p>
                    <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{guardrail.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </AdminShell>
  );
}

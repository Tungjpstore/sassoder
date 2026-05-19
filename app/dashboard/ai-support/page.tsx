import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BotMessageSquare,
  BrainCircuit,
  CheckCircle2,
  ClipboardList,
  Copy,
  Headphones,
  MessageCircle,
  MessageSquareReply,
  QrCode,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRoundCheck,
  type LucideIcon
} from "lucide-react";
import { AiOwnerActionLauncher } from "@/components/dashboard/ai-owner-action-launcher";
import { AiOperatingLoop } from "@/components/dashboard/ai-operating-loop";
import { AdminShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import { listRestaurantAiMemories } from "@/lib/ai/memory/restaurant-memory";
import { getAiProviderReadiness } from "@/lib/ai/providers/registry";
import { getAiSchemaReadiness } from "@/lib/ai/schema-readiness";
import {
  buildAiSupportStudioDeck,
  type AiSupportChannel,
  type AiSupportEscalationMode,
  type AiSupportScenario,
  type AiSupportScenarioStatus
} from "@/lib/ai/support-studio";
import { requireDashboardAdminAccess } from "@/lib/dashboard-access";
import { listRecentAiRecommendations } from "@/services/ai-recommendation-service";

export const dynamic = "force-dynamic";

function schemaFlags(schemas: Awaited<ReturnType<typeof getAiSchemaReadiness>>) {
  return {
    restaurantMemories: schemas.checks.find((check) => check.key === "restaurantMemories")?.ready ?? false,
    recommendations: schemas.checks.find((check) => check.key === "recommendations")?.ready ?? false
  };
}

function statusTone(status: AiSupportScenarioStatus) {
  if (status === "ready") return "green";
  if (status === "blocked") return "red";
  return "yellow";
}

function statusLabel(status: AiSupportScenarioStatus) {
  if (status === "ready") return "Sẵn sàng";
  if (status === "blocked") return "Bị chặn";
  return "Bản nháp";
}

function priorityTone(priority: AiSupportScenario["priority"]) {
  if (priority === "critical") return "red";
  if (priority === "high") return "yellow";
  return "blue";
}

function escalationLabel(mode: AiSupportEscalationMode) {
  if (mode === "human_handoff") return "Handoff";
  if (mode === "confirm_first") return "Confirm";
  return "Self-serve";
}

function channelLabel(channel: AiSupportChannel) {
  if (channel === "qr_ordering") return "QR";
  if (channel === "messenger") return "Messenger";
  if (channel === "zalo") return "Zalo";
  if (channel === "telegram") return "Telegram";
  if (channel === "whatsapp") return "WhatsApp";
  return "Website";
}

const scenarioIcons: Record<AiSupportScenario["type"], LucideIcon> = {
  menu_question: MessageCircle,
  opening_hours: BadgeCheck,
  reservation_help: ClipboardList,
  order_status: QrCode,
  delivery_question: ArrowRight,
  payment_question: ShieldCheck,
  complaint_handoff: UserRoundCheck,
  allergy_policy: AlertTriangle
};

function ScenarioCard({ scenario }: { scenario: AiSupportScenario }) {
  const Icon = scenarioIcons[scenario.type] ?? Headphones;
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] text-[var(--primary)]">
            <Icon size={17} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={statusTone(scenario.status)}>{statusLabel(scenario.status)}</Badge>
              <Badge tone={priorityTone(scenario.priority)}>{scenario.priority}</Badge>
              <Badge>{escalationLabel(scenario.escalationMode)}</Badge>
            </div>
            <p className="mt-2 text-sm font-bold text-[var(--foreground)]">{scenario.title}</p>
            <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{scenario.customerIntent}</p>
          </div>
        </div>
        <Link
          href={scenario.actionHref}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] transition hover:border-[var(--primary)]"
          aria-label={`Mở xử lý ${scenario.title}`}
          title="Mở xử lý"
        >
          <ArrowRight size={16} />
        </Link>
      </div>

      <div className="mt-3 grid gap-2">
        <div className="rounded-lg bg-[var(--soft-surface)] px-3 py-2">
          <p className="text-[11px] font-bold uppercase text-[var(--muted-foreground)]">Cách trả lời</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--foreground)]">{scenario.answerStrategy}</p>
        </div>
        <div className="rounded-lg bg-[var(--soft-surface)] px-3 py-2">
          <p className="text-[11px] font-bold uppercase text-[var(--muted-foreground)]">Mẫu trả lời</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--foreground)]">{scenario.sampleReply}</p>
        </div>
      </div>

      {scenario.blockers.length ? (
        <div className="mt-3 rounded-lg border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-3 py-2">
          <p className="text-[11px] font-bold uppercase text-[var(--accent-strong)]">Blocker</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--accent-strong)]">{scenario.blockers[0]}</p>
        </div>
      ) : scenario.sourceSignals.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {scenario.sourceSignals.slice(0, 4).map((signal) => (
            <Badge key={signal} tone="green">{signal}</Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {scenario.channels.map((channel) => (
          <Badge key={channel}>{channelLabel(channel)}</Badge>
        ))}
      </div>
      <p className="mt-3 text-xs font-semibold leading-5 text-[var(--foreground)]">{scenario.nextAction}</p>
    </article>
  );
}

export default async function AiSupportPage() {
  const { session, entitlement } = await requireDashboardAdminAccess("ai_owner_assistant");
  const [providers, schemas, memoriesResult, recommendationsResult] = await Promise.all([
    Promise.resolve(getAiProviderReadiness()),
    getAiSchemaReadiness(),
    listRestaurantAiMemories({ restaurantId: session.restaurantId, includeSensitive: false, limit: 40 }),
    listRecentAiRecommendations(session.restaurantId, 30)
  ]);
  const supportDeck = buildAiSupportStudioDeck({
    providerConfigured: providers.some((provider) => provider.configured),
    schemas: schemaFlags(schemas),
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
      title: recommendation.title
    }))
  });

  const metricCards = [
    {
      label: "Scenarios",
      value: supportDeck.summary.total,
      detail: `${supportDeck.summary.ready} ready · ${supportDeck.summary.draft} draft`,
      icon: Headphones,
      tone: supportDeck.summary.blocked ? "yellow" : "green"
    },
    {
      label: "Handoff",
      value: supportDeck.summary.handoff,
      detail: "Luồng cần người thật",
      icon: UserRoundCheck,
      tone: "blue"
    },
    {
      label: "Memory",
      value: supportDeck.summary.supportMemoryCount,
      detail: "FAQ/menu/policy/ops",
      icon: BrainCircuit,
      tone: supportDeck.summary.supportMemoryCount ? "green" : "yellow"
    },
    {
      label: "Public memory",
      value: supportDeck.summary.publicMemoryCount,
      detail: "An toàn cho khách",
      icon: CheckCircle2,
      tone: supportDeck.summary.publicMemoryCount ? "green" : "yellow"
    },
    {
      label: "Reply kits",
      value: supportDeck.replyKits.length,
      detail: "Prompt kênh hỗ trợ",
      icon: Copy,
      tone: supportDeck.replyKits.length ? "green" : "yellow"
    },
    {
      label: "Signals",
      value: supportDeck.summary.activeSignals,
      detail: "Menu/payment/promo",
      icon: Sparkles,
      tone: supportDeck.summary.activeSignals ? "green" : "blue"
    }
  ] as const;

  return (
    <AdminShell
      title="AI chăm sóc khách"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Chuẩn bị câu trả lời cho khách: menu, giờ mở cửa, đặt bàn, đơn hàng, thanh toán và handoff"
      showLiveActionCenter={false}
    >
      <div className="dashboard-ai-workspace grid gap-3">
        <AiOwnerActionLauncher variant="support" />
        <AiOperatingLoop
          title="Luồng AI Support có handoff"
          subtitle="Kịch bản chăm sóc khách phải đi theo guardrail: chỉ dùng memory public, luồng nhạy cảm handoff, và mọi câu trả lời cần route kiểm tra."
          primaryAction={{ href: "/dashboard/ai-execution", label: "Duyệt kịch bản" }}
          secondaryAction={{ href: "/dashboard/settings", label: "Cập nhật thông tin quán" }}
          stages={[
            { id: "detect", value: supportDeck.summary.total, detail: "Kịch bản từ FAQ, menu, booking, thanh toán", href: "/dashboard/ai-support", tone: supportDeck.summary.total ? "green" : "blue", active: true },
            { id: "approve", value: recommendationsResult.recommendations.filter((recommendation) => recommendation.type === "payment" || recommendation.type === "customer_retention").length, detail: "Luồng nhạy cảm cần duyệt/handoff", href: "/dashboard/ai-execution", tone: "yellow" },
            { id: "act", value: supportDeck.summary.ready, detail: "Reply kit/scenario sẵn sàng dùng", href: "/dashboard/ai-support", tone: supportDeck.summary.ready ? "green" : "blue" },
            { id: "verify", value: supportDeck.summary.handoff + supportDeck.summary.blocked, detail: "Cần người thật hoặc thiếu memory/schema", href: "/dashboard/ai-control", tone: supportDeck.summary.blocked ? "red" : "yellow" },
            { id: "audit", value: supportDeck.summary.publicMemoryCount, detail: "Memory public an toàn cho khách", href: "/dashboard/ai-control", tone: "neutral" }
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
          <Link href="/dashboard/settings" className="dashboard-secondary-action">
            Thông tin quán
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
                <BotMessageSquare size={15} />
                Support scenarios
              </p>
              <h2 className="dashboard-section-title mt-1">Kịch bản hỗ trợ khách có guardrail</h2>
            </div>
            <Badge tone={supportDeck.summary.ready ? "green" : "yellow"}>{supportDeck.summary.ready} ready</Badge>
          </div>
          <div className="dashboard-ai-card-grid mt-3 grid gap-3 xl:grid-cols-2">
            {supportDeck.scenarios.map((scenario) => (
              <ScenarioCard key={scenario.id} scenario={scenario} />
            ))}
          </div>
        </section>

        <section className="dashboard-ai-split-grid grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <section className="dashboard-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="dashboard-eyebrow inline-flex items-center gap-2">
                  <Copy size={15} />
                  Reply kits
                </p>
                <h2 className="dashboard-section-title mt-1">Prompt hỗ trợ sẵn dùng</h2>
              </div>
              <Badge tone={supportDeck.replyKits.length ? "green" : "yellow"}>{supportDeck.replyKits.length} kit</Badge>
            </div>
            {supportDeck.replyKits.length ? (
              <div className="mt-3 grid gap-3">
                {supportDeck.replyKits.map((kit) => (
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
                Cần provider AI và restaurant memory để tạo reply kit đủ an toàn cho khách.
              </div>
            )}
          </section>

          <aside className="grid gap-3">
            <section className="dashboard-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="dashboard-eyebrow inline-flex items-center gap-2">
                    <MessageSquareReply size={15} />
                    Channels
                  </p>
                  <h2 className="dashboard-section-title mt-1">Kênh hỗ trợ future-ready</h2>
                </div>
                <Badge>{supportDeck.channelReadiness.length} kênh</Badge>
              </div>
              <div className="mt-3 grid gap-2">
                {supportDeck.channelReadiness.map((channel) => (
                  <div key={channel.channel} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-[var(--foreground)]">{channel.label}</p>
                      <Badge tone={channel.status === "ready" ? "green" : channel.status === "preview" ? "yellow" : "blue"}>
                        {channel.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{channel.detail}</p>
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
                  <h2 className="dashboard-section-title mt-1">Luật an toàn support</h2>
                </div>
                <Badge>Privacy</Badge>
              </div>
              <div className="mt-3 grid gap-2">
                {supportDeck.guardrails.map((guardrail) => (
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

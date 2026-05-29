import Link from "next/link";
import { ArrowRight, CheckCircle2, EyeOff, Sparkles } from "lucide-react";
import { updateAiRecommendationStatusAction } from "@/app/dashboard/actions";
import { Badge } from "@/components/ui/badge";
import type { AiRecommendationDeck, AiRecommendationPriority, AiRecommendationStatus, AiRecommendationType } from "@/lib/ai/recommendation-engine";

function priorityTone(priority: AiRecommendationPriority) {
  if (priority === "critical") return "red";
  if (priority === "high") return "yellow";
  if (priority === "medium") return "blue";
  return "neutral";
}

function typeLabel(type: AiRecommendationType) {
  if (type === "combo") return "Combo";
  if (type === "upsell") return "Upsell";
  if (type === "promotion") return "Khuyến mãi";
  if (type === "staffing") return "Nhân sự";
  if (type === "inventory") return "Kho";
  if (type === "payment") return "Thanh toán";
  if (type === "customer_retention") return "Khách quay lại";
  if (type === "pricing") return "Giá bán";
  return "Menu";
}

function statusLabel(status?: AiRecommendationStatus) {
  if (status === "accepted") return "Đã duyệt";
  if (status === "dismissed") return "Đã ẩn";
  if (status === "resolved") return "Đã xử lý";
  if (status === "expired") return "Hết hạn";
  return "Đang gợi ý";
}

export function AiRecommendationCards({
  deck,
  schemaReady
}: {
  deck: AiRecommendationDeck;
  schemaReady: boolean;
}) {
  const recommendations = Array.isArray(deck?.recommendations) ? deck.recommendations : [];

  return (
    <section className="dashboard-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="dashboard-eyebrow inline-flex items-center gap-2">
            <Sparkles size={15} />
            AI recommendations
          </p>
          <h2 className="dashboard-section-title mt-1">Gợi ý hành động nên duyệt</h2>
        </div>
        <Badge tone={schemaReady ? (recommendations.length ? "green" : "blue") : "yellow"}>
          {schemaReady ? `${recommendations.length} gợi ý` : "Cần schema"}
        </Badge>
      </div>

      {!schemaReady ? (
        <div className="mt-3 grid min-h-24 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
          Cần migration `ai_recommendations` để lưu lifecycle gợi ý AI.
        </div>
      ) : recommendations.length ? (
        <div className="mt-3 grid gap-3 xl:grid-cols-3">
          {recommendations.map((recommendation) => (
            <article key={recommendation.lifecycle?.databaseId ?? recommendation.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <Badge tone={priorityTone(recommendation.priority)}>{recommendation.priority}</Badge>
                  <Badge>{typeLabel(recommendation.type)}</Badge>
                  <Badge>{statusLabel(recommendation.lifecycle?.status ?? recommendation.status)}</Badge>
                </div>
                {recommendation.estimatedImpact ? (
                  <span className="rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-2 py-1 text-[11px] font-bold text-[var(--muted-foreground)]">
                    {recommendation.estimatedImpact.label}
                  </span>
                ) : null}
              </div>

              <p className="mt-3 text-sm font-bold text-[var(--foreground)]">{recommendation.title}</p>
              <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{recommendation.detail}</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-[var(--foreground)]">{recommendation.action}</p>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-[var(--muted-foreground)]">
                  {recommendation.confidence === "high" ? "Tin cậy cao" : "Cần kiểm tra"}
                </span>
                <div className="flex items-center gap-1.5">
                  {recommendation.lifecycle?.databaseId ? (
                    <>
                      <form action={updateAiRecommendationStatusAction}>
                        <input type="hidden" name="recommendationId" value={recommendation.lifecycle.databaseId} />
                        <input type="hidden" name="status" value="accepted" />
                        <button
                          type="submit"
                          className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] transition hover:border-[var(--primary)]"
                          aria-label={`Duyệt gợi ý ${recommendation.title}`}
                          title="Duyệt"
                        >
                          <CheckCircle2 size={15} />
                        </button>
                      </form>
                      <form action={updateAiRecommendationStatusAction}>
                        <input type="hidden" name="recommendationId" value={recommendation.lifecycle.databaseId} />
                        <input type="hidden" name="status" value="dismissed" />
                        <button
                          type="submit"
                          className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                          aria-label={`Ẩn gợi ý ${recommendation.title}`}
                          title="Ẩn"
                        >
                          <EyeOff size={15} />
                        </button>
                      </form>
                    </>
                  ) : null}
                  {recommendation.actionHref ? (
                    <Link
                      href={recommendation.actionHref}
                      className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] transition hover:border-[var(--primary)]"
                      aria-label={`Mở khu vực xử lý ${recommendation.title}`}
                      title="Mở khu vực xử lý"
                    >
                      <ArrowRight size={16} />
                    </Link>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-3 grid min-h-24 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
          Chưa có gợi ý đủ rõ. Khi AI Ops phát hiện món mạnh, kho thiếu, ca quá tải hoặc thanh toán treo, gợi ý sẽ xuất hiện tại đây.
        </div>
      )}
    </section>
  );
}

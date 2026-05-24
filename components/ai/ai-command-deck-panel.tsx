"use client";

import { ArrowRight, CheckCircle2, Clock3, Gauge, ShieldCheck, Sparkles } from "lucide-react";
import type { AiCommandDeck } from "@/types/ai-agent";

type AiCommandDeckPanelProps = {
  deck?: AiCommandDeck | null;
  compact?: boolean;
};

const MODE_LABEL = {
  autopilot: "Có thể làm ngay",
  copilot: "Cần xác nhận",
  manual: "Cần nhân viên"
} as const;

const IMPACT_LABEL = {
  critical: "Ưu tiên",
  accelerate: "Nên làm",
  steady: "Theo dõi"
} as const;

export function AiCommandDeckPanel({ deck, compact = false }: AiCommandDeckPanelProps) {
  if (!deck) return null;
  const title = deck.surface === "customer" ? "Hỗ trợ khách" : deck.surface === "onboarding" ? "Bước setup tiếp theo" : "Bước nên làm";
  const visibleSignals = deck.signals.slice(0, compact ? 2 : 4);

  return (
    <section
      className={`logibot-command-deck logibot-command-deck--support logibot-command-deck--${deck.intensity} ${compact ? "logibot-command-deck--compact" : ""}`}
      aria-label={`LogiBot đề xuất: ${deck.nextMove}`}
    >
      <span className="logibot-command-radar" aria-hidden="true" />
      <div className="relative z-10 grid gap-3">
        <div className="logibot-command-topline">
          <span className="logibot-support-mark logibot-support-mark--active" aria-hidden="true">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="logibot-command-kicker">{title}</p>
            <h4 className="logibot-command-next">{deck.nextMove}</h4>
          </div>
          <span className={`logibot-command-impact logibot-command-impact--${deck.intensity}`}>
            <strong>{deck.impactScore}</strong>
            <span>{IMPACT_LABEL[deck.intensity]}</span>
          </span>
        </div>

        <p className="logibot-command-headline">{deck.headline}</p>

        <div className="logibot-command-strip" aria-label="Tín hiệu hành động">
          <span className="logibot-command-pill logibot-command-pill--safe">
            <ShieldCheck className="h-3.5 w-3.5" />
            {MODE_LABEL[deck.automationLevel]}
          </span>
          <span className="logibot-command-pill">
            <Clock3 className="h-3.5 w-3.5" />
            {deck.primaryMetric}
          </span>
          <span className="logibot-command-pill">
            <Gauge className="h-3.5 w-3.5" />
            {deck.secondaryMetric}
          </span>
        </div>

        {!compact && visibleSignals.length ? (
          <div className="logibot-command-signals">
            {visibleSignals.map((signal) => (
              <span key={`${signal.label}-${signal.value}`} className={`logibot-command-signal logibot-command-signal--${signal.tone}`}>
                <span>{signal.label}</span>
                <strong>{signal.value}</strong>
              </span>
            ))}
          </div>
        ) : null}

        <div className="logibot-command-runway" aria-hidden="true">
          <span>
            <CheckCircle2 className="h-3.5 w-3.5" />
            Chọn action bên dưới để áp dụng
          </span>
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </section>
  );
}

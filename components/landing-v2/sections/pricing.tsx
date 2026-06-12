"use client";

import { ArrowRight, Check, Minus } from "lucide-react";
import { motion } from "framer-motion";
import { ButtonV2 } from "@/components/ui-v2/button-v2";
import { Container, Pill, Section, SectionHeader } from "@/components/ui-v2/primitives";
import { RevealStagger, item } from "@/components/ui-v2/reveal";
import { comparisonRows, plans } from "../data";

/* Cell renderer — boolean → check/dash, string → literal value */
function CompareCell({ value, featured = false }: { value: boolean | string; featured?: boolean }) {
  if (value === true) {
    return (
      <span
        className={[
          "grid h-6 w-6 place-items-center rounded-full",
          featured ? "bg-[var(--jade)] text-white" : "bg-[var(--primary-soft)] text-[var(--jade)]"
        ].join(" ")}
      >
        <Check size={13} strokeWidth={3} />
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-faint)]">
        <Minus size={13} strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span
      className={[
        "text-[length:var(--fs-sm)] font-semibold",
        featured ? "text-[var(--jade)]" : "text-[var(--text)]"
      ].join(" ")}
    >
      {value}
    </span>
  );
}

export function Pricing() {
  return (
    <Section spacing="lg" id="pricing" className="bg-[var(--surface-2)]/72 backdrop-blur-[2px]">
      <Container className="flex flex-col gap-[var(--s-12)]">
        <SectionHeader
          align="center"
          eyebrow="Bảng giá"
          title="Giá đơn giản. Bắt đầu nhỏ, nâng cấp khi cần."
          lead="Mỗi gói có 30 ngày dùng thử đầy đủ. Không phí khởi tạo, không bắt buộc mua POS."
          className="mx-auto"
        />

        {/* Plan cards */}
        <RevealStagger className="mx-auto grid w-full max-w-3xl gap-[var(--s-4)] md:grid-cols-2">
          {plans.map((plan) => (
            <motion.div
              key={plan.code}
              variants={item}
              className={[
                "relative flex flex-col gap-[var(--s-5)] rounded-[var(--r-xl)] p-[var(--s-6)] sm:p-[var(--s-8)]",
                plan.featured
                  ? "border-2 border-[var(--jade)] bg-[var(--surface)] shadow-[var(--sh-lg)]"
                  : "border border-[var(--line)] bg-[var(--surface)] shadow-[var(--sh-sm)]"
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[length:var(--fs-h3)] font-bold text-[var(--text)]">LogiVN {plan.name}</h3>
                {plan.tag ? <Pill tone={plan.featured ? "orange" : "jade"}>{plan.tag}</Pill> : null}
              </div>

              <p className="text-[length:var(--fs-sm)] leading-[var(--lh-body)] text-[var(--text-muted)]">{plan.summary}</p>

              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <span className="text-[2.25rem] font-extrabold leading-none tracking-[var(--tracking-tight)] text-[var(--text)] sm:text-[2.5rem]">{plan.price}</span>
                <span className="text-[length:var(--fs-sm)] text-[var(--text-faint)]">{plan.cadence}</span>
              </div>

              <ul className="flex flex-col gap-[var(--s-3)]">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[length:var(--fs-sm)] text-[var(--text)]">
                    <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-[var(--primary-soft)] text-[var(--jade)]">
                      <Check size={12} strokeWidth={3} />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              <ButtonV2
                as="link"
                href={plan.cta.href}
                variant={plan.featured ? "primary" : "secondary"}
                size="lg"
                className="mt-auto w-full"
              >
                {plan.cta.label}
                <ArrowRight size={16} />
              </ButtonV2>
            </motion.div>
          ))}
        </RevealStagger>

        {/* Detailed feature comparison table — scrolls horizontally on mobile so values don't wrap awkwardly */}
        <div className="mx-auto w-full max-w-4xl">
          <div className="overflow-x-auto rounded-[var(--r-xl)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--sh-sm)]">
            <div className="min-w-[40rem]">
              {/* Sticky-ish header row */}
              <div className="grid grid-cols-[2fr_1fr_1fr] items-center gap-2 border-b border-[var(--line)] bg-[var(--surface-2)]/60 px-[var(--s-5)] py-[var(--s-4)] md:px-[var(--s-6)]">
                <span className="text-[length:var(--fs-xs)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-faint)]">
                  So sánh chi tiết
                </span>
                <span className="text-center text-[length:var(--fs-sm)] font-bold text-[var(--text)]">Pro</span>
                <span className="flex items-center justify-center gap-1.5 text-center text-[length:var(--fs-sm)] font-bold text-[var(--jade)]">
                  Premium
                </span>
              </div>

              {comparisonRows.map((row) => (
                <div key={row.category}>
                  {/* Category label */}
                  <div className="border-b border-[var(--line)] bg-[var(--primary-soft)]/40 px-[var(--s-5)] py-2.5 md:px-[var(--s-6)]">
                    <span className="text-[length:var(--fs-xs)] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--jade)]">
                      {row.category}
                    </span>
                  </div>
                  {row.features.map((feat, idx) => (
                    <div
                      key={feat.label}
                      className={[
                        "grid grid-cols-[2fr_1fr_1fr] items-center gap-2 px-[var(--s-5)] py-[var(--s-3)] md:px-[var(--s-6)]",
                        idx % 2 === 1 ? "bg-[var(--surface-2)]/30" : ""
                      ].join(" ")}
                    >
                      <span className="text-[length:var(--fs-sm)] leading-snug text-[var(--text)]">{feat.label}</span>
                      <div className="flex justify-center text-center">
                        <CompareCell value={feat.pro} />
                      </div>
                      <div className="flex justify-center text-center">
                        <CompareCell value={feat.premium} featured />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2 text-center text-[length:var(--fs-xs)] text-[var(--text-faint)] sm:hidden">
            Vuốt ngang để xem đầy đủ →
          </p>
        </div>

        <p className="text-center text-[length:var(--fs-sm)] text-[var(--text-muted)]">
          Cần triển khai cho chuỗi nhiều chi nhánh?{" "}
          <a href="/pricing" className="font-semibold text-[var(--jade)] underline underline-offset-4">
            Xem gói Doanh nghiệp →
          </a>
        </p>
      </Container>
    </Section>
  );
}

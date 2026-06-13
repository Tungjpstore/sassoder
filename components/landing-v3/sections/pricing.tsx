"use client";

import { useState } from "react";
import { ArrowRight, Check, Minus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ButtonV2 } from "@/components/ui-v2/button-v2";
import { Container, Pill, Section, SectionHeader } from "@/components/ui-v2/primitives";
import { RevealStagger, item } from "@/components/ui-v2/reveal";
import { comparisonRows, plans } from "@/components/landing-v2/data";
import { Magnetic } from "../motion/magnetic";

type Cycle = "monthly" | "annual";

const ANNUAL_DISCOUNT = 0.2; // 20% off when paying yearly

function parsePrice(price: string): number {
  return Number(price.replace(/[^\d]/g, ""));
}
function formatVnd(n: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(n)}₫`;
}

function CompareCell({ value, featured = false }: { value: boolean | string; featured?: boolean }) {
  if (value === true) {
    return (
      <span className={["grid h-6 w-6 place-items-center rounded-full", featured ? "bg-[var(--jade)] text-white" : "bg-[var(--primary-soft)] text-[var(--jade)]"].join(" ")}>
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
  return <span className={["text-[length:var(--fs-sm)] font-semibold", featured ? "text-[var(--jade)]" : "text-[var(--text)]"].join(" ")}>{value}</span>;
}

export function PricingV3() {
  const [cycle, setCycle] = useState<Cycle>("monthly");

  return (
    <Section spacing="lg" id="pricing" className="bg-[var(--surface-2)]/60 backdrop-blur-[2px]">
      <Container className="flex flex-col gap-[var(--s-12)]">
        <SectionHeader
          align="center"
          eyebrow="Bảng giá"
          title="Giá đơn giản. Bắt đầu nhỏ, nâng cấp khi cần."
          lead="Mỗi gói có 30 ngày dùng thử đầy đủ. Không phí khởi tạo, không bắt buộc mua POS."
          className="mx-auto"
        />

        {/* Billing toggle */}
        <div className="mx-auto inline-flex items-center gap-1 rounded-[var(--r-pill)] border border-[var(--line)] bg-[var(--surface)] p-1 shadow-[var(--sh-sm)]">
          {(["monthly", "annual"] as Cycle[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              className="relative inline-flex items-center gap-2 rounded-[var(--r-pill)] px-4 py-2 text-[length:var(--fs-sm)] font-semibold transition-colors"
            >
              {cycle === c ? (
                <motion.span
                  layoutId="cycle-pill"
                  className="absolute inset-0 rounded-[var(--r-pill)] bg-[var(--jade)]"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              ) : null}
              <span className={["relative z-10", cycle === c ? "text-[var(--on-jade)]" : "text-[var(--text-muted)]"].join(" ")}>
                {c === "monthly" ? "Theo tháng" : "Theo năm"}
              </span>
              {c === "annual" ? (
                <span className={["relative z-10 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none", cycle === c ? "bg-[var(--accent)] text-[var(--on-orange)]" : "bg-[var(--accent-soft)] text-[var(--orange-600)]"].join(" ")}>
                  -20%
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Plan cards */}
        <RevealStagger className="mx-auto grid w-full max-w-3xl gap-[var(--s-4)] md:grid-cols-2">
          {plans.map((plan) => {
            const monthly = parsePrice(plan.price);
            const shown = cycle === "annual" ? Math.round((monthly * (1 - ANNUAL_DISCOUNT)) / 1000) * 1000 : monthly;
            return (
              <motion.div
                key={plan.code}
                variants={item}
                className={[
                  "relative flex flex-col gap-[var(--s-5)] rounded-[var(--r-xl)] p-[var(--s-6)] sm:p-[var(--s-8)]",
                  plan.featured
                    ? "border-2 border-[var(--jade)] bg-[var(--surface)] shadow-[var(--glow-jade)]"
                    : "border border-[var(--line)] bg-[var(--surface)] shadow-[var(--sh-sm)]"
                ].join(" ")}
              >
                {plan.featured ? (
                  <span aria-hidden className="pointer-events-none absolute -inset-px -z-10 rounded-[var(--r-xl)] opacity-60 blur-xl" style={{ background: "var(--grad-jade-orange)" }} />
                ) : null}

                <div className="flex items-center justify-between">
                  <h3 className="text-[length:var(--fs-h3)] font-bold text-[var(--text)]">LogiVN {plan.name}</h3>
                  {plan.tag ? <Pill tone={plan.featured ? "orange" : "jade"}>{plan.tag}</Pill> : null}
                </div>

                <p className="text-[length:var(--fs-sm)] leading-[var(--lh-body)] text-[var(--text-muted)]">{plan.summary}</p>

                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-baseline gap-x-1.5">
                    <AnimatePresence mode="popLayout">
                      <motion.span
                        key={shown}
                        initial={{ y: 12, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -12, opacity: 0 }}
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                        className="text-[2.25rem] font-extrabold leading-none tracking-[var(--tracking-tight)] text-[var(--text)] sm:text-[2.5rem]"
                      >
                        {formatVnd(shown)}
                      </motion.span>
                    </AnimatePresence>
                    <span className="text-[length:var(--fs-sm)] text-[var(--text-faint)]">/ tháng</span>
                  </div>
                  <span className="text-[length:var(--fs-xs)] text-[var(--text-faint)]">
                    {cycle === "annual" ? "Khi trả theo năm · tiết kiệm 20% · dùng thử 30 ngày" : "Thanh toán hàng tháng · dùng thử 30 ngày"}
                  </span>
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

                <Magnetic strength={0.2} className="mt-auto w-full">
                  <ButtonV2 as="link" href={plan.cta.href} variant={plan.featured ? "primary" : "secondary"} size="lg" className={["w-full", plan.featured ? "v3-shimmer" : ""].join(" ")}>
                    {plan.cta.label}
                    <ArrowRight size={16} />
                  </ButtonV2>
                </Magnetic>
              </motion.div>
            );
          })}
        </RevealStagger>

        {/* Detailed comparison */}
        <div className="mx-auto w-full max-w-4xl">
          <div className="overflow-hidden rounded-[var(--r-xl)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--sh-sm)]">
            <div className="hidden grid-cols-[2fr_1fr_1fr] items-center gap-2 border-b border-[var(--line)] bg-[var(--surface-2)]/60 px-[var(--s-6)] py-[var(--s-4)] sm:grid">
              <span className="text-[length:var(--fs-xs)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-faint)]">So sánh chi tiết</span>
              <span className="text-center text-[length:var(--fs-sm)] font-bold text-[var(--text)]">Pro</span>
              <span className="text-center text-[length:var(--fs-sm)] font-bold text-[var(--jade)]">Premium</span>
            </div>

            {comparisonRows.map((row) => (
              <div key={row.category}>
                <div className="border-b border-[var(--line)] bg-[var(--primary-soft)]/40 px-[var(--s-5)] py-2.5 sm:px-[var(--s-6)]">
                  <span className="text-[length:var(--fs-xs)] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--jade)]">{row.category}</span>
                </div>
                {row.features.map((feat, idx) => (
                  <div
                    key={feat.label}
                    className={[
                      "border-b border-[var(--line)] px-[var(--s-5)] py-[var(--s-4)] last:border-b-0 sm:px-[var(--s-6)] sm:py-[var(--s-3)]",
                      "sm:grid sm:grid-cols-[2fr_1fr_1fr] sm:items-center sm:gap-2",
                      idx % 2 === 1 ? "sm:bg-[var(--surface-2)]/30" : ""
                    ].join(" ")}
                  >
                    <span className="block text-[length:var(--fs-sm)] font-medium leading-snug text-[var(--text)] sm:font-normal">{feat.label}</span>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
                      <div className="flex flex-col items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--surface-2)]/60 px-2 py-2">
                        <span className="text-[length:var(--fs-xs)] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Pro</span>
                        <CompareCell value={feat.pro} />
                      </div>
                      <div className="flex flex-col items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--primary-soft)]/40 px-2 py-2">
                        <span className="text-[length:var(--fs-xs)] font-semibold uppercase tracking-wide text-[var(--jade)]">Premium</span>
                        <CompareCell value={feat.premium} featured />
                      </div>
                    </div>
                    <div className="hidden justify-center sm:flex">
                      <CompareCell value={feat.pro} />
                    </div>
                    <div className="hidden justify-center sm:flex">
                      <CompareCell value={feat.premium} featured />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-[length:var(--fs-sm)] text-[var(--text-muted)]">
          Cần triển khai cho chuỗi nhiều chi nhánh?{" "}
          <a href="/pricing" className="font-semibold text-[var(--jade)] underline underline-offset-4">Xem gói Doanh nghiệp →</a>
        </p>
      </Container>
    </Section>
  );
}

"use client";

import { motion } from "framer-motion";
import { Container, Section, SectionHeader } from "@/components/ui-v2/primitives";
import { RevealStagger, item } from "@/components/ui-v2/reveal";
import { steps } from "../data";

export function Steps() {
  return (
    <Section spacing="lg" className="bg-[var(--surface-2)]/72 backdrop-blur-[2px]">
      <Container className="flex flex-col gap-[var(--s-12)]">
        <SectionHeader
          eyebrow="Triển khai trong ngày"
          title="Từ đăng ký đến nhận đơn, chỉ bốn bước"
          lead="Không cần dự án phần cứng, không cần kỹ thuật. Chủ quán tự làm được từ điện thoại."
        />

        <RevealStagger className="grid gap-[var(--s-4)] sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <motion.div key={step.no} variants={item} className="relative">
              <div className="flex flex-col gap-[var(--s-3)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--s-6)] shadow-[var(--sh-sm)]">
                <span className="font-[family-name:var(--font-mono)] text-[length:var(--fs-sm)] font-bold text-[var(--orange)]">{step.no}</span>
                <h3 className="text-[length:var(--fs-h3)] font-semibold text-[var(--text)]">{step.title}</h3>
                <p className="text-[length:var(--fs-sm)] leading-[var(--lh-body)] text-[var(--text-muted)]">{step.text}</p>
              </div>
              {i < steps.length - 1 ? (
                <span aria-hidden className="absolute -right-2 top-1/2 hidden h-px w-4 bg-[var(--line-strong)] lg:block" />
              ) : null}
            </motion.div>
          ))}
        </RevealStagger>
      </Container>
    </Section>
  );
}

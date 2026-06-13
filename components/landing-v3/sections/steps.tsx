"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { Container, Section, SectionHeader } from "@/components/ui-v2/primitives";
import { steps } from "@/components/landing-v2/data";

export function StepsV3() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 75%", "end 60%"]
  });
  const fill = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.4 });
  const scaleX = useTransform(fill, [0, 1], [0, 1]);
  const scaleY = useTransform(fill, [0, 1], [0, 1]);

  return (
    <Section spacing="lg" id="how" className="bg-[var(--surface-2)]/60 backdrop-blur-[2px]">
      <Container className="flex flex-col gap-[var(--s-12)]">
        <SectionHeader
          eyebrow="Triển khai trong ngày"
          title="Từ đăng ký đến nhận đơn, chỉ bốn bước"
          lead="Không cần dự án phần cứng, không cần kỹ thuật. Chủ quán tự làm được từ điện thoại."
        />

        <div ref={ref} className="relative">
          {/* connecting rail — horizontal on desktop, vertical on mobile */}
          <span aria-hidden className="absolute left-5 top-6 bottom-6 w-0.5 rounded-full bg-[var(--line)] sm:hidden" />
          <motion.span
            aria-hidden
            className="absolute left-5 top-6 w-0.5 origin-top rounded-full bg-[var(--jade)] sm:hidden"
            style={{ bottom: 24, scaleY: reduce ? 1 : scaleY }}
          />
          <span aria-hidden className="absolute left-[12.5%] right-[12.5%] top-[2.75rem] hidden h-0.5 rounded-full bg-[var(--line)] lg:block" />
          <motion.span
            aria-hidden
            className="absolute left-[12.5%] right-[12.5%] top-[2.75rem] hidden h-0.5 origin-left rounded-full bg-[var(--jade)] lg:block"
            style={{ scaleX: reduce ? 1 : scaleX }}
          />

          <div className="grid gap-[var(--s-6)] sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <motion.div
                key={step.no}
                className="relative flex gap-[var(--s-4)] sm:flex-col"
                initial={reduce ? false : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              >
                <motion.span
                  className="relative z-10 grid h-11 w-11 flex-none place-items-center rounded-full border-2 border-[var(--jade)] bg-[var(--bg)] font-[family-name:var(--font-mono)] text-[length:var(--fs-sm)] font-bold text-[var(--jade)] shadow-[var(--sh-sm)]"
                  initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: true, amount: 0.6 }}
                  transition={{ type: "spring", stiffness: 320, damping: 16, delay: i * 0.08 + 0.1 }}
                >
                  {step.no}
                </motion.span>
                <div className="flex flex-col gap-[var(--s-2)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--s-5)] shadow-[var(--sh-sm)] sm:mt-[var(--s-4)]">
                  <h3 className="text-[length:var(--fs-h3)] font-semibold text-[var(--text)]">{step.title}</h3>
                  <p className="text-[length:var(--fs-sm)] leading-[var(--lh-body)] text-[var(--text-muted)]">{step.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
}

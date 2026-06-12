"use client";

import { Star } from "lucide-react";
import { motion } from "framer-motion";
import { Card, Container, Pill, Section, SectionHeader } from "@/components/ui-v2/primitives";
import { RevealStagger, item } from "@/components/ui-v2/reveal";
import { testimonials } from "../data";

function Stars() {
  return (
    <div className="flex items-center gap-0.5 text-[var(--orange)]">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={15} className="fill-current" strokeWidth={0} />
      ))}
    </div>
  );
}

export function Testimonials() {
  return (
    <Section spacing="lg">
      <Container className="flex flex-col gap-[var(--s-12)]">
        <div className="flex flex-col items-start justify-between gap-[var(--s-6)] md:flex-row md:items-end">
          <SectionHeader
            eyebrow="Khách đang dùng LogiVN"
            title="Quán nói gì sau khi vào nhịp"
          />
          <div className="flex items-center gap-3 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] px-[var(--s-5)] py-[var(--s-3)] shadow-[var(--sh-sm)]">
            <span className="text-[1.75rem] font-extrabold leading-none text-[var(--jade)]">4.8</span>
            <div className="flex flex-col gap-0.5">
              <Stars />
              <span className="text-[length:var(--fs-xs)] text-[var(--text-faint)]">từ chủ quán đang vận hành</span>
            </div>
          </div>
        </div>

        <RevealStagger className="grid gap-[var(--s-4)] md:grid-cols-3">
          {testimonials.map((t) => (
            <motion.div key={t.name} variants={item}>
              <Card interactive className="flex h-full flex-col gap-[var(--s-5)] p-[var(--s-6)]">
                <div className="flex items-center justify-between">
                  <Stars />
                  <Pill tone="jade">Đã xác minh</Pill>
                </div>
                <p className="text-[length:var(--fs-lead)] leading-[var(--lh-body)] text-[var(--text)]">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-auto flex items-center gap-3 border-t border-[var(--line)] pt-[var(--s-4)]">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--jade)] text-[length:var(--fs-sm)] font-bold text-white">
                    {t.name.replace(/^(Anh|Chị)\s*/, "").charAt(0)}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-[length:var(--fs-sm)] font-semibold text-[var(--text)]">{t.name}</span>
                    <span className="text-[length:var(--fs-xs)] text-[var(--text-faint)]">{t.role}</span>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </RevealStagger>
      </Container>
    </Section>
  );
}

"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Container, Section, SectionHeader } from "@/components/ui-v2/primitives";
import { faqs } from "@/components/landing-v2/data";

export function FaqV3() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <Section spacing="lg" id="faq" className="bg-[var(--surface-2)]/60 backdrop-blur-[2px]">
      <Container className="grid gap-[var(--s-12)] lg:grid-cols-[0.8fr_1.2fr]">
        <SectionHeader eyebrow="Câu hỏi thường gặp" title="Những điểm cần rõ trước khi bắt đầu" />

        <ul className="flex flex-col gap-[var(--s-3)]">
          {faqs.map((item, i) => {
            const isOpen = open === i;
            return (
              <li key={item.q} className="overflow-hidden rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)]">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-[var(--s-6)] py-[var(--s-4)] text-left text-[length:var(--fs-body)] font-semibold text-[var(--text)]"
                >
                  {item.q}
                  <span
                    className={[
                      "grid h-8 w-8 flex-none place-items-center rounded-full border transition-[transform,color,border-color] duration-[var(--dur)]",
                      isOpen ? "rotate-180 border-[var(--jade)] text-[var(--jade)]" : "border-[var(--line)] text-[var(--text-muted)]"
                    ].join(" ")}
                  >
                    <ChevronDown size={15} />
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <motion.div
                      key="content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="border-t border-[var(--line)] px-[var(--s-6)] py-[var(--s-4)] text-[length:var(--fs-sm)] leading-[var(--lh-body)] text-[var(--text-muted)]">
                        {item.a}
                      </p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </Container>
    </Section>
  );
}

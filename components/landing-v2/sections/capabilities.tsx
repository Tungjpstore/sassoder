"use client";

import { motion } from "framer-motion";
import { Container, Section, SectionHeader } from "@/components/ui-v2/primitives";
import { RevealStagger, item } from "@/components/ui-v2/reveal";
import { capabilityGroups } from "../data";
import { capabilityIcons } from "../visuals/icons";

const badgeTone: Record<string, string> = {
  AI: "bg-[var(--accent-soft)] text-[var(--orange-600)]",
  PRO: "bg-[var(--primary-soft)] text-[var(--jade)]",
  PREMIUM: "bg-[var(--jade)] text-[var(--on-jade)]"
};

export function Capabilities() {
  return (
    <Section spacing="lg" className="bg-[var(--surface-2)]/72 backdrop-blur-[2px]" id="capabilities">
      <Container className="flex flex-col gap-[var(--s-12)]">
        <SectionHeader
          eyebrow="Toàn bộ năng lực"
          title="Một nền tảng, đủ cho cả hành trình của quán"
          lead="Từ gọi món QR đến trợ lý AI, kho, báo cáo và tự động hóa — LogiVN gom mọi thứ quán cần để vận hành và tăng trưởng."
        />

        <RevealStagger className="grid gap-[var(--s-4)] md:grid-cols-2 lg:grid-cols-3">
          {capabilityGroups.map((group) => {
            const Icon = capabilityIcons[group.iconKey];
            return (
            <motion.div
              key={group.title}
              variants={item}
              className="group flex flex-col gap-[var(--s-4)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--s-6)] shadow-[var(--sh-sm)] transition-[transform,box-shadow,border-color] duration-[var(--dur)] ease-[var(--ease)] hover:-translate-y-1 hover:border-[var(--line-strong)] hover:shadow-[var(--sh-md)]"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 flex-none place-items-center rounded-[var(--r-md)] bg-[var(--primary-soft)] text-[var(--jade)] transition-colors duration-[var(--dur)] group-hover:bg-[var(--jade)] group-hover:text-white">
                  <Icon size={22} />
                </span>
                <div className="flex flex-col">
                  <h3 className="text-[length:var(--fs-h3)] font-bold leading-tight text-[var(--text)]">{group.title}</h3>
                  <span className="text-[length:var(--fs-xs)] text-[var(--text-faint)]">{group.caption}</span>
                </div>
              </div>

              <ul className="flex flex-col gap-2 border-t border-[var(--line)] pt-[var(--s-4)]">
                {group.items.map((it) => (
                  <li key={it.label} className="flex items-center justify-between gap-3 text-[length:var(--fs-sm)] text-[var(--text)]">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 flex-none rounded-full bg-[var(--sage)]" />
                      {it.label}
                    </span>
                    {it.badge ? (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${badgeTone[it.badge]}`}>
                        {it.badge}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </motion.div>
          );
          })}
        </RevealStagger>
      </Container>
    </Section>
  );
}

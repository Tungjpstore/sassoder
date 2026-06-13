"use client";

import { motion } from "framer-motion";
import { Container, Section, SectionHeader } from "@/components/ui-v2/primitives";
import { RevealStagger, item } from "@/components/ui-v2/reveal";
import { capabilityGroups } from "@/components/landing-v2/data";
import { capabilityIcons } from "@/components/landing-v2/visuals/icons";
import { SpotlightCard } from "../motion/spotlight-card";

const badgeTone: Record<string, string> = {
  AI: "bg-[var(--accent-soft)] text-[var(--orange-600)]",
  PRO: "bg-[var(--primary-soft)] text-[var(--jade)]",
  PREMIUM: "bg-[var(--jade)] text-[var(--on-jade)]"
};

/* Bento spans (lg, on a 6-col grid). Index follows capabilityGroups. */
const spans = [
  "lg:col-span-4",
  "lg:col-span-2",
  "lg:col-span-2",
  "lg:col-span-4",
  "lg:col-span-3",
  "lg:col-span-3"
];

export function CapabilitiesV3() {
  return (
    <Section spacing="lg" className="relative" id="capabilities">
      <Container className="flex flex-col gap-[var(--s-12)]">
        <SectionHeader
          eyebrow="Toàn bộ năng lực"
          title="Một nền tảng, đủ cho cả hành trình của quán"
          lead="Từ gọi món QR đến trợ lý AI, kho, báo cáo và tự động hóa — LogiVN gom mọi thứ quán cần để vận hành và tăng trưởng."
        />

        <RevealStagger className="grid gap-[var(--s-4)] md:grid-cols-2 lg:grid-cols-6">
          {capabilityGroups.map((group, gi) => {
            const Icon = capabilityIcons[group.iconKey];
            const featured = group.iconKey === "ai";
            return (
              <motion.div key={group.title} variants={item} className={`md:col-span-1 ${spans[gi]}`}>
                <SpotlightCard tone={featured ? "orange" : "jade"} className="h-full">
                  <div className="flex h-full flex-col gap-[var(--s-4)] p-[var(--s-6)]">
                    <div className="flex items-center gap-3">
                      <span
                        className={[
                          "grid h-11 w-11 flex-none place-items-center rounded-[var(--r-md)] transition-colors duration-[var(--dur)]",
                          featured
                            ? "bg-[var(--accent)] text-[var(--on-orange)]"
                            : "bg-[var(--primary-soft)] text-[var(--jade)] group-hover/spot:bg-[var(--jade)] group-hover/spot:text-white"
                        ].join(" ")}
                      >
                        <Icon size={22} />
                      </span>
                      <div className="flex flex-col">
                        <h3 className="text-[length:var(--fs-h3)] font-bold leading-tight text-[var(--text)]">{group.title}</h3>
                        <span className="text-[length:var(--fs-xs)] text-[var(--text-faint)]">{group.caption}</span>
                      </div>
                    </div>

                    <ul className="grid flex-1 content-start gap-2 border-t border-[var(--line)] pt-[var(--s-4)] sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
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
                  </div>
                </SpotlightCard>
              </motion.div>
            );
          })}
        </RevealStagger>
      </Container>
    </Section>
  );
}

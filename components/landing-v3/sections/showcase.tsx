"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Container, Section, SectionHeader } from "@/components/ui-v2/primitives";
import { ImageFrame } from "@/components/landing-v2/visuals/image-frame";
import { showcases } from "@/components/landing-v2/data";

export function ShowcaseV3() {
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const idx = Number((e.target as HTMLElement).dataset.idx);
            setActive(idx);
          }
        });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );
    itemRefs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const current = showcases[active];

  return (
    <Section spacing="lg" id="showcase">
      <Container className="flex flex-col gap-[var(--s-12)]">
        <SectionHeader
          eyebrow="Sản phẩm"
          title="Ba bề mặt vận hành, một dòng chảy duy nhất"
          lead="Khách gọi món, nhân viên xử lý, chủ quán điều hành — tất cả đồng bộ trong cùng một hệ thống."
        />

        <div className="grid gap-[var(--s-12)] lg:grid-cols-2">
          {/* Sticky visual panel (desktop) */}
          <div className="hidden lg:block">
            <div className="sticky top-24">
              <div className="relative">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={current.id}
                    initial={reduce ? false : { opacity: 0, scale: 0.97, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={reduce ? undefined : { opacity: 0, scale: 0.99, y: -12 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <ImageFrame
                      src={current.asset.src}
                      width={current.asset.w}
                      height={current.asset.h}
                      alt={current.imageAlt}
                      glow={active === 2 ? "orange" : "jade"}
                    />
                    <div className="absolute -bottom-4 left-6 flex items-center gap-3 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 shadow-[var(--sh-lg)]">
                      <span className="text-[1.375rem] font-extrabold leading-none tracking-[var(--tracking-tight)] text-[var(--jade)]">
                        {current.stat.value}
                      </span>
                      <span className="max-w-[10rem] text-[length:var(--fs-xs)] leading-snug text-[var(--text-muted)]">
                        {current.stat.label}
                      </span>
                    </div>
                  </motion.div>
                </AnimatePresence>

                {/* progress rail */}
                <div className="mt-[var(--s-8)] flex items-center gap-2">
                  {showcases.map((s, i) => (
                    <span
                      key={s.id}
                      className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--line)]"
                    >
                      <motion.span
                        className="block h-full rounded-full bg-[var(--jade)]"
                        initial={false}
                        animate={{ width: i === active ? "100%" : "0%" }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Scrolling content panels */}
          <div className="flex flex-col">
            {showcases.map((item, i) => (
              <div
                key={item.id}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                data-idx={i}
                className="flex min-h-[60vh] flex-col justify-center gap-[var(--s-4)] py-[var(--s-8)] lg:min-h-[78vh]"
              >
                {/* Inline image on mobile only */}
                <div className="lg:hidden">
                  <ImageFrame
                    src={item.asset.src}
                    width={item.asset.w}
                    height={item.asset.h}
                    alt={item.imageAlt}
                    glow={i === 2 ? "orange" : "jade"}
                  />
                </div>

                <motion.div
                  className="flex flex-col gap-[var(--s-4)]"
                  initial={reduce ? false : { opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-[var(--r-md)] bg-[var(--jade)] font-[family-name:var(--font-mono)] text-[length:var(--fs-sm)] font-bold text-[var(--on-jade)]">
                      0{i + 1}
                    </span>
                    <span className="v2-eyebrow">{item.eyebrow}</span>
                  </div>
                  <h3 className="text-[length:var(--fs-h2)] font-bold leading-[var(--lh-snug)] tracking-[var(--tracking-tight)] text-[var(--text)]">
                    {item.title}
                  </h3>
                  <p className="text-balance text-[length:var(--fs-lead)] leading-[var(--lh-body)] text-[var(--text-muted)]">
                    {item.text}
                  </p>
                  <ul className="mt-[var(--s-2)] grid gap-[var(--s-3)] sm:grid-cols-2">
                    {item.bullets.map((b) => (
                      <li key={b.label} className="flex items-center gap-3 text-[length:var(--fs-sm)] text-[var(--text)]">
                        <span className="grid h-9 w-9 flex-none place-items-center rounded-[var(--r-md)] bg-[var(--primary-soft)] text-[var(--jade)]">
                          <b.icon size={16} strokeWidth={2.2} />
                        </span>
                        {b.label}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
}

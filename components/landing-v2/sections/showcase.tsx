"use client";

import { Container, Section, SectionHeader } from "@/components/ui-v2/primitives";
import { Reveal } from "@/components/ui-v2/reveal";
import { ImageFrame } from "../visuals/image-frame";
import { showcases } from "../data";

export function Showcase() {
  return (
    <Section spacing="lg" id="showcase">
      <Container className="flex flex-col gap-[var(--s-12)]">
        <SectionHeader
          eyebrow="Sản phẩm"
          title="Ba bề mặt vận hành, một dòng chảy duy nhất"
          lead="Khách gọi món, nhân viên xử lý, chủ quán điều hành — tất cả đồng bộ trong cùng một hệ thống."
        />

        <div className="flex flex-col gap-[var(--s-16)]">
          {showcases.map((item, i) => {
            const reverse = i % 2 === 1;
            return (
              <div
                key={item.id}
                className={[
                  "grid items-center gap-[var(--s-12)] lg:grid-cols-2",
                  reverse ? "lg:[&>*:first-child]:order-2" : ""
                ].join(" ")}
              >
                <Reveal>
                  <div className="relative">
                    <ImageFrame
                      src={item.asset.src}
                      width={item.asset.w}
                      height={item.asset.h}
                      alt={item.imageAlt}
                      glow={i === 1 ? "orange" : "jade"}
                    />
                    <div className="absolute -bottom-3 left-3 flex items-center gap-2.5 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 shadow-[var(--sh-lg)] sm:-bottom-4 sm:left-6 sm:gap-3 sm:rounded-[var(--r-lg)] sm:px-4 sm:py-3">
                      <span className="text-[1.125rem] font-extrabold leading-none tracking-[var(--tracking-tight)] text-[var(--jade)] sm:text-[1.375rem]">
                        {item.stat.value}
                      </span>
                      <span className="max-w-[8.5rem] text-[length:var(--fs-xs)] leading-snug text-[var(--text-muted)] sm:max-w-[10rem]">
                        {item.stat.label}
                      </span>
                    </div>
                  </div>
                </Reveal>

                <Reveal delay={0.05}>
                  <div className="flex flex-col gap-[var(--s-4)]">
                    <span className="v2-eyebrow">{item.eyebrow}</span>
                    <h3 className="text-[length:var(--fs-h2)] font-bold leading-[var(--lh-snug)] tracking-[var(--tracking-tight)] text-[var(--text)]">
                      {item.title}
                    </h3>
                    <p className="text-[length:var(--fs-lead)] leading-[var(--lh-body)] text-[var(--text-muted)]">
                      {item.text}
                    </p>
                    <ul className="mt-[var(--s-2)] grid gap-[var(--s-3)] sm:grid-cols-2">
                      {item.bullets.map((b) => (
                        <li
                          key={b.label}
                          className="flex items-center gap-3 text-[length:var(--fs-sm)] text-[var(--text)]"
                        >
                          <span className="grid h-9 w-9 flex-none place-items-center rounded-[var(--r-md)] bg-[var(--primary-soft)] text-[var(--jade)]">
                            <b.icon size={16} strokeWidth={2.2} />
                          </span>
                          {b.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              </div>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}

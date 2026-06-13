"use client";

import { ArrowRight, Check, PlayCircle } from "lucide-react";
import { ButtonV2 } from "@/components/ui-v2/button-v2";
import { Container } from "@/components/ui-v2/primitives";
import { CountUp } from "@/components/ui-v2/count-up";
import { LiveDashboard } from "@/components/landing-v2/visuals/live-dashboard";
import { heroProofs, trustChips } from "@/components/landing-v2/data";
import { Reveal } from "@/components/ui-v2/reveal";
import { TextReveal } from "../motion/text-reveal";
import { Magnetic } from "../motion/magnetic";
import { Parallax } from "../motion/parallax";

export function HeroV3() {
  return (
    <section className="relative overflow-hidden pt-[var(--s-12)] pb-[var(--s-20)]">
      {/* local hero glow accents */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute -left-32 top-0 h-[32rem] w-[32rem] rounded-full opacity-60 blur-[90px]"
          style={{ background: "radial-gradient(circle, var(--accent-soft), transparent 66%)" }}
        />
        <div
          className="absolute right-[-10rem] top-24 h-[28rem] w-[28rem] rounded-full opacity-50 blur-[90px]"
          style={{ background: "radial-gradient(circle, var(--primary-soft), transparent 66%)" }}
        />
      </div>

      <Container className="relative grid items-center gap-[var(--s-12)] lg:grid-cols-[1.02fr_1.1fr]">
        <div className="flex flex-col gap-[var(--s-5)]">
          <Reveal>
            <span className="v2-live-pill">
              <span className="v2-live-dot" />
              5.000+ quán Việt đang vận hành cùng LogiVN
            </span>
          </Reveal>

          <TextReveal as="h1" className="v2-display text-[var(--text)]">
            Gọi món bằng QR. Vận hành <span className="v3-grad-text">thông minh</span> hơn.
          </TextReveal>

          <Reveal delay={0.1}>
            <p className="max-w-xl text-balance text-[length:var(--fs-lead)] leading-[var(--lh-body)] text-[var(--text-muted)]">
              Từ QR ordering, VietQR, đặt bàn, kho, nhân sự đến trợ lý AI — gom trong một bảng quản lý đủ gọn cho quán
              nhỏ bắt đầu, đủ sâu cho chuỗi F&amp;B mở rộng.
            </p>
          </Reveal>

          <Reveal delay={0.16}>
            <div className="flex flex-col gap-[var(--s-3)] sm:flex-row sm:flex-wrap sm:items-center">
              <Magnetic strength={0.3}>
                <ButtonV2 as="link" href="/dashboard/register?plan=pro" variant="primary" size="lg" className="v3-shimmer w-full sm:w-auto">
                  Tạo quán miễn phí
                  <ArrowRight size={18} className="transition-transform duration-[var(--dur)] ease-[var(--ease-spring)] group-hover:translate-x-1" />
                </ButtonV2>
              </Magnetic>
              <ButtonV2 as="link" href="/demo" variant="secondary" size="lg" className="group w-full sm:w-auto">
                <PlayCircle size={18} className="text-[var(--jade)] transition-transform duration-[var(--dur)] group-hover:scale-110" />
                Xem demo vận hành
              </ButtonV2>
            </div>
          </Reveal>

          <Reveal delay={0.22}>
            <dl className="mt-[var(--s-2)] grid grid-cols-3 gap-[var(--s-4)] border-t border-[var(--line)] pt-[var(--s-5)] sm:gap-[var(--s-6)]">
              {heroProofs.map((proof) => (
                <div key={proof.value} className="flex flex-col gap-1">
                  <dd>
                    <CountUp value={proof.value} className="block text-[1.375rem] font-extrabold leading-none tracking-[var(--tracking-tight)] text-[var(--text)] sm:text-[1.625rem]" />
                  </dd>
                  <dt className="text-[length:var(--fs-xs)] leading-snug text-[var(--text-muted)]">{proof.label}</dt>
                </div>
              ))}
            </dl>
          </Reveal>

          <Reveal delay={0.28}>
            <ul className="flex flex-wrap gap-x-[var(--s-4)] gap-y-2">
              {trustChips.map((chip) => (
                <li key={chip} className="inline-flex items-center gap-1.5 text-[length:var(--fs-xs)] font-medium text-[var(--text-muted)]">
                  <span className="grid h-4 w-4 flex-none place-items-center rounded-full bg-[var(--primary-soft)] text-[var(--jade)]">
                    <Check size={10} strokeWidth={3.2} />
                  </span>
                  {chip}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        {/* Animated, code-driven product visual with parallax depth */}
        <Reveal delay={0.12}>
          <Parallax speed={-28} className="relative">
            <LiveDashboard />
          </Parallax>
        </Reveal>
      </Container>
    </section>
  );
}

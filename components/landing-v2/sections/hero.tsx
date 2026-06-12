"use client";

import { ArrowRight, Check } from "lucide-react";
import { ButtonV2 } from "@/components/ui-v2/button-v2";
import { Container } from "@/components/ui-v2/primitives";
import { Reveal } from "@/components/ui-v2/reveal";
import { CountUp } from "@/components/ui-v2/count-up";
import { ImageFrame } from "../visuals/image-frame";
import { banner, heroProofs, trustChips } from "../data";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-[var(--s-8)] pb-[var(--s-16)]">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-32 h-[34rem] w-[34rem] rounded-full opacity-[0.55] blur-[90px]" style={{ background: "radial-gradient(circle, var(--accent-soft), transparent 66%)" }} />
        <div className="absolute right-[-12rem] top-16 h-[30rem] w-[30rem] rounded-full opacity-[0.5] blur-[90px]" style={{ background: "radial-gradient(circle, var(--primary-soft), transparent 66%)" }} />
      </div>

      <Container className="relative grid items-center gap-[var(--s-12)] lg:grid-cols-[1.05fr_1.05fr]">
        <div className="flex flex-col gap-[var(--s-5)]">
          <Reveal>
            <span className="v2-live-pill">
              <span className="v2-live-dot" />
              5.000+ quán Việt đang vận hành cùng LogiVN
            </span>
          </Reveal>

          <Reveal delay={0.05}>
            <h1 className="v2-display text-[var(--text)]">
              Gọi món bằng QR.
              <br />
              Vận hành <span className="v2-mark">thông minh</span> hơn.
            </h1>
          </Reveal>

          <Reveal delay={0.1}>
            <p className="max-w-xl text-[length:var(--fs-lead)] leading-[var(--lh-body)] text-[var(--text-muted)]">
              Từ QR ordering, VietQR, đặt bàn, kho, nhân sự đến trợ lý AI — gom trong một bảng quản lý đủ gọn cho quán
              nhỏ bắt đầu, đủ sâu cho chuỗi F&amp;B mở rộng.
            </p>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="flex flex-col gap-[var(--s-3)] sm:flex-row sm:flex-wrap sm:items-center">
              <ButtonV2 as="link" href="/dashboard/register?plan=pro" variant="primary" size="lg" className="w-full sm:w-auto">
                Tạo quán miễn phí
                <ArrowRight size={18} className="transition-transform duration-[var(--dur)] ease-[var(--ease)] group-hover:translate-x-1" />
              </ButtonV2>
              <ButtonV2 as="link" href="/demo" variant="secondary" size="lg" className="w-full sm:w-auto">
                Xem demo vận hành
              </ButtonV2>
            </div>
          </Reveal>

          <Reveal delay={0.2}>
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

          <Reveal delay={0.25}>
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

        <Reveal delay={0.12}>
          <ImageFrame
            src={banner.hero.src}
            width={banner.hero.w}
            height={banner.hero.h}
            alt="LogiVN trong không gian quán cafe Việt: dashboard, gọi món QR và thanh toán VietQR"
            priority
            glow="orange"
            withChrome={false}
          />
        </Reveal>
      </Container>
    </section>
  );
}

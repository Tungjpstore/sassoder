"use client";

import { ArrowRight } from "lucide-react";
import { ButtonV2 } from "@/components/ui-v2/button-v2";
import { Container } from "@/components/ui-v2/primitives";
import { Reveal } from "@/components/ui-v2/reveal";
import { Magnetic } from "../motion/magnetic";

export function FinalCtaV3() {
  return (
    <section className="relative py-[var(--s-20)]">
      <Container>
        <div className="v3-grain relative overflow-hidden rounded-[var(--r-xl)] px-[var(--s-8)] py-[var(--s-20)] shadow-[var(--glow-jade)]">
          {/* animated brand backdrop */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg, var(--jade-900), var(--jade-700))" }}
          />
          <div aria-hidden className="absolute inset-0 overflow-hidden">
            <div className="v3-float absolute -left-10 top-0 h-72 w-72 rounded-full opacity-50 blur-3xl" style={{ background: "radial-gradient(circle, rgba(242,140,40,0.5), transparent 65%)" }} />
            <div className="v3-float v3-float--slow absolute -right-10 bottom-0 h-72 w-72 rounded-full opacity-40 blur-3xl" style={{ background: "radial-gradient(circle, rgba(169,197,161,0.55), transparent 65%)" }} />
          </div>

          <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-[var(--s-5)] text-center text-[var(--on-jade)]">
            <Reveal>
              <h2 className="text-balance text-[length:var(--fs-h2)] font-bold leading-[var(--lh-snug)]">
                Sẵn sàng đưa quán của bạn lên LogiVN?
              </h2>
            </Reveal>
            <Reveal delay={0.05}>
              <p className="max-w-xl text-balance text-[length:var(--fs-body)] leading-[var(--lh-body)] opacity-80">
                Tạo quán, đưa menu lên và in QR cho bàn chỉ trong một buổi. Dùng thử đầy đủ 30 ngày, không phí khởi tạo,
                không cần mua POS.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="flex flex-wrap justify-center gap-[var(--s-3)]">
                <Magnetic strength={0.3}>
                  <ButtonV2 as="link" href="/dashboard/register?plan=pro" variant="primary" size="lg" className="v3-shimmer">
                    Tạo quán miễn phí
                    <ArrowRight size={18} />
                  </ButtonV2>
                </Magnetic>
                <ButtonV2 as="link" href="/pricing" variant="ghost" size="lg" className="text-[var(--on-jade)] hover:text-[var(--orange-300)]">
                  Xem bảng giá
                </ButtonV2>
              </div>
            </Reveal>
          </div>
        </div>
      </Container>
    </section>
  );
}

"use client";

import { ArrowRight } from "lucide-react";
import { ButtonV2 } from "@/components/ui-v2/button-v2";
import { Container } from "@/components/ui-v2/primitives";
import { Reveal } from "@/components/ui-v2/reveal";

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden py-[var(--s-16)]">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 18% 0%, rgba(242,140,40,0.18), transparent 55%), linear-gradient(135deg, var(--jade-900), var(--jade-700))"
        }}
      />
      <Container className="relative">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-[var(--s-5)] text-center text-[var(--on-jade)]">
          <Reveal>
            <h2 className="text-[length:var(--fs-h2)] font-bold leading-[var(--lh-snug)]">
              Sẵn sàng đưa quán của bạn lên LogiVN?
            </h2>
          </Reveal>
          <Reveal delay={0.05}>
            <p className="max-w-xl text-[length:var(--fs-body)] leading-[var(--lh-body)] opacity-80">
              Tạo quán, đưa menu lên và in QR cho bàn chỉ trong một buổi. Dùng thử đầy đủ 30 ngày, không phí khởi tạo,
              không cần mua POS.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="flex flex-wrap justify-center gap-[var(--s-3)]">
              <ButtonV2 as="link" href="/dashboard/register?plan=pro" variant="primary" size="lg">
                Tạo quán miễn phí
                <ArrowRight size={18} />
              </ButtonV2>
              <ButtonV2
                as="link"
                href="/pricing"
                variant="ghost"
                size="lg"
                className="text-[var(--on-jade)] hover:text-[var(--orange-300)]"
              >
                Xem bảng giá
              </ButtonV2>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

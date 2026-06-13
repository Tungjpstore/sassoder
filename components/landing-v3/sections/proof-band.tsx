"use client";

import {
  Activity,
  BarChart3,
  Bell,
  QrCode,
  Receipt,
  Sparkles,
  Utensils,
  WalletCards
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Container } from "@/components/ui-v2/primitives";
import { Marquee } from "../motion/marquee";

const chips: { icon: LucideIcon; label: string }[] = [
  { icon: QrCode, label: "Gọi món QR theo bàn" },
  { icon: WalletCards, label: "Thanh toán VietQR" },
  { icon: Utensils, label: "Menu & combo realtime" },
  { icon: Activity, label: "Đơn theo thời gian thực" },
  { icon: Sparkles, label: "Trợ lý AI vận hành" },
  { icon: Receipt, label: "Đối soát từng hóa đơn" },
  { icon: BarChart3, label: "Báo cáo & dự báo" },
  { icon: Bell, label: "Gọi phục vụ một chạm" }
];

function Chip({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-[var(--r-pill)] border border-[var(--line)] bg-[var(--surface)]/80 px-4 py-2.5 text-[length:var(--fs-sm)] font-semibold text-[var(--text)] shadow-[var(--sh-sm)] backdrop-blur-sm">
      <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[var(--primary-soft)] text-[var(--jade)]">
        <Icon size={13} />
      </span>
      {label}
    </span>
  );
}

export function ProofBand() {
  return (
    <section className="relative py-[var(--s-8)]">
      <Container>
        <p className="mb-[var(--s-5)] text-center text-[length:var(--fs-xs)] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-faint)]">
          Mọi thứ một quán Việt cần để vận hành mỗi ca bán
        </p>
      </Container>
      <Marquee durationSec={38}>
        {chips.map((c) => (
          <Chip key={c.label} {...c} />
        ))}
      </Marquee>
    </section>
  );
}

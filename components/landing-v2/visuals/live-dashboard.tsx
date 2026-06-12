"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ChefHat, QrCode, Sparkles, WalletCards } from "lucide-react";

/* LiveDashboard — bespoke animated visual generated entirely in
 * code. Replaces the near-square hero banner. Renders crisp at
 * any DPR, perfectly on-brand, no aspect-ratio fragility.
 *
 * Composition: dashboard surface (KPIs + animated bar chart),
 * floating customer phone with QR menu, VietQR success card.
 * All animations respect prefers-reduced-motion. */
export function LiveDashboard() {
  const reduce = useReducedMotion();

  return (
    <div className="live-dashboard relative isolate aspect-[4/3.4] w-full">
      {/* dashboard surface */}
      <motion.div
        className="absolute left-0 top-0 w-[78%] overflow-hidden rounded-[var(--r-xl)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--sh-xl)]"
        initial={reduce ? false : { y: 8, opacity: 0 }}
        animate={reduce ? undefined : { y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-center gap-1.5 border-b border-[var(--line)] bg-[var(--surface-2)] px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--orange)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--sage)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--line-strong)]" />
          <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--surface)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-faint)]">
            app.logivn.com / overview
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--ok-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--ok-fg)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok-fg)]" />
            Đang trực tuyến
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 px-4 pt-4">
          <Tile label="Doanh thu hôm nay" value="12,4tr" delta="+18%" tone="jade" />
          <Tile label="Đơn hôm nay" value="184" delta="+12 đơn" tone="orange" />
          <Tile label="Bàn hoạt động" value="9 / 12" delta="3 quá giờ" tone="warn" />
        </div>

        <div className="mx-4 mt-3 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
              Doanh thu theo giờ
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--orange-600)]">
              19h–21h
              <span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[9px] font-bold leading-none">+28%</span>
            </span>
          </div>
          <Bars />
        </div>

        <div className="mx-4 mb-4 mt-3 grid grid-cols-2 gap-2">
          <Note icon={<ChefHat size={11} />} text="Bếp · 4 đang chế biến" tone="jade" />
          <Note icon={<Sparkles size={11} />} text="AI: thêm nhân sự nhận món" tone="orange" />
        </div>
      </motion.div>

      {/* phone — customer QR menu */}
      <motion.div
        className="absolute right-[1%] top-[8%] w-[26%] rounded-[26px] border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[var(--sh-xl)]"
        initial={reduce ? false : { y: 18, opacity: 0 }}
        animate={reduce ? undefined : { y: 0, opacity: 1 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1], delay: 0.18 }}
      >
        <div className="rounded-[20px] bg-[var(--surface-2)] p-2">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[8px] font-bold uppercase tracking-[0.18em] text-[var(--text-faint)]">Bàn 12</span>
            <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--jade)] text-[var(--on-jade)]">
              <QrCode size={9} />
            </span>
          </div>
          <Row name="Trà đào nhãn" price="35.000₫" hot />
          <Row name="Croissant bơ" price="42.000₫" />
          <Row name="Bánh flan" price="28.000₫" />
          <div className="mt-2 flex items-center justify-between rounded-[10px] bg-[var(--jade)] px-2 py-1.5 text-[var(--on-jade)]">
            <span className="text-[9px] font-bold">3 món · 105K</span>
            <span className="text-[9px] font-bold">Đặt món →</span>
          </div>
        </div>
      </motion.div>

      {/* VietQR receipt */}
      <motion.div
        className="absolute bottom-[1%] right-[6%] flex w-[44%] items-center gap-2.5 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--sh-lg)]"
        initial={reduce ? false : { x: 14, opacity: 0 }}
        animate={reduce ? undefined : { x: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.32 }}
      >
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--orange-600)]">
          <WalletCards size={16} />
        </span>
        <div className="flex flex-col">
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-faint)]">VietQR đã thu</span>
          <span className="text-[15px] font-extrabold leading-tight text-[var(--text)]">105.000 ₫</span>
        </div>
        <span className="ml-auto rounded-full bg-[var(--ok-bg)] px-2 py-0.5 text-[9px] font-bold text-[var(--ok-fg)]">
          ✓ Bàn 12
        </span>
      </motion.div>
    </div>
  );
}

function Tile({ label, value, delta, tone }: { label: string; value: string; delta: string; tone: "jade" | "orange" | "warn" }) {
  const cls =
    tone === "jade" ? "bg-[var(--primary-soft)] text-[var(--jade)]"
    : tone === "orange" ? "bg-[var(--accent-soft)] text-[var(--orange-600)]"
    : "bg-[var(--warn-bg)] text-[var(--warn-fg)]";
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">{label}</span>
      <div className="mt-1 text-[19px] font-extrabold leading-none tracking-[var(--tracking-tight)] text-[var(--text)]">{value}</div>
      <span className={`mt-1.5 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-bold ${cls}`}>{delta}</span>
    </div>
  );
}

function Note({ icon, text, tone }: { icon: React.ReactNode; text: string; tone: "jade" | "orange" }) {
  const cls = tone === "jade" ? "bg-[var(--primary-soft)] text-[var(--jade)]" : "bg-[var(--accent-soft)] text-[var(--orange-600)]";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[10px] font-semibold ${cls}`}>
      {icon}
      {text}
    </span>
  );
}

function Row({ name, price, hot = false }: { name: string; price: string; hot?: boolean }) {
  return (
    <div className="mb-1.5 flex items-center gap-2 rounded-[10px] bg-[var(--surface)] p-1.5">
      <span className="grid h-6 w-6 place-items-center rounded-md bg-[var(--accent-soft)] text-[var(--orange-600)]">
        <Sparkles size={10} />
      </span>
      <div className="flex flex-1 flex-col">
        <span className="text-[10px] font-bold leading-none text-[var(--text)]">{name}</span>
        <span className="mt-0.5 text-[9px] text-[var(--text-faint)]">{price}</span>
      </div>
      {hot ? (
        <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[7px] font-bold text-[var(--on-orange)]">HOT</span>
      ) : (
        <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--jade)] text-[8px] font-bold text-[var(--on-jade)]">+</span>
      )}
    </div>
  );
}

function Bars() {
  const data = [22, 36, 28, 48, 64, 76, 95, 88, 72, 58, 42, 30];
  const max = Math.max(...data);
  return (
    <div className="flex h-[52px] items-end gap-1">
      {data.map((v, i) => (
        <motion.span
          key={i}
          className="flex-1 rounded-t-[3px]"
          style={{ background: "linear-gradient(180deg, var(--orange) 0%, var(--jade) 130%)" }}
          initial={{ height: 0 }}
          whileInView={{ height: `${(v / max) * 100}%` }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.55, delay: 0.2 + 0.04 * i, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </div>
  );
}

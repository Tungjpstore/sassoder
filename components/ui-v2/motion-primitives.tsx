"use client";

import * as React from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue
} from "framer-motion";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------
 * Parallax — translate a layer on the Y axis as it scrolls through
 * the viewport. `speed` is the total travel in px (negative = up).
 * Frozen under reduced-motion.
 * ------------------------------------------------------------------ */
export function Parallax({
  children,
  speed = -60,
  className
}: {
  children: React.ReactNode;
  speed?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  });
  const raw = useTransform(scrollYProgress, [0, 1], [-speed, speed]);
  const y = useSpring(raw, { stiffness: 120, damping: 30, mass: 0.4 });

  return (
    <div ref={ref} className={className}>
      <motion.div style={reduce ? undefined : { y }}>{children}</motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------
 * MagneticButton — wrapper that nudges its child toward the cursor.
 * Pointer devices only; no-op on touch / reduced-motion.
 * ------------------------------------------------------------------ */
export function Magnetic({
  children,
  strength = 0.35,
  className
}: {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 220, damping: 18, mass: 0.3 });
  const y = useSpring(my, { stiffness: 220, damping: 18, mass: 0.3 });

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    mx.set((e.clientX - (r.left + r.width / 2)) * strength);
    my.set((e.clientY - (r.top + r.height / 2)) * strength);
  }
  function reset() {
    mx.set(0);
    my.set(0);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      style={reduce ? undefined : { x, y }}
      className={cn("inline-flex", className)}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------
 * SpotlightCard — card surface with a cursor-following radial glow
 * and lift on hover. Falls back to a static card under reduced-motion.
 * ------------------------------------------------------------------ */
export function SpotlightCard({
  children,
  className,
  glow = "jade"
}: {
  children: React.ReactNode;
  className?: string;
  glow?: "jade" | "orange";
}) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(-200);
  const my = useMotionValue(-200);
  const tint = glow === "orange" ? "rgba(242,140,40,0.16)" : "rgba(15,77,58,0.12)";
  const background = useMotionTemplate`radial-gradient(220px circle at ${mx}px ${my}px, ${tint}, transparent 72%)`;

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(e.clientX - r.left);
    my.set(e.clientY - r.top);
  }

  return (
    <div
      onMouseMove={reduce ? undefined : onMove}
      className={cn(
        "group/spot relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--sh-sm)]",
        "transition-[transform,box-shadow,border-color] duration-[var(--dur)] ease-[var(--ease)] hover:-translate-y-1 hover:border-[var(--line-strong)] hover:shadow-[var(--sh-md)]",
        className
      )}
    >
      {!reduce ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-[var(--dur)] group-hover/spot:opacity-100"
          style={{ background }}
        />
      ) : null}
      <div className="relative">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------
 * TextReveal — reveal a heading word-by-word as it enters view.
 * Pass plain text; markup is generated. Reduced-motion shows it static.
 * ------------------------------------------------------------------ */
export function TextReveal({
  text,
  className,
  as = "span",
  delay = 0
}: {
  text: string;
  className?: string;
  as?: "span" | "h1" | "h2";
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  const Tag = motion[as] as typeof motion.span;

  if (reduce) {
    const Plain = as as React.ElementType;
    return <Plain className={className}>{text}</Plain>;
  }

  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.5 }}
      variants={{ show: { transition: { staggerChildren: 0.045, delayChildren: delay } } }}
      aria-label={text}
    >
      {words.map((w, i) => (
        <span key={`${w}-${i}`} className="inline-block overflow-hidden align-bottom">
          <motion.span
            className="inline-block"
            variants={{
              hidden: { y: "110%", opacity: 0 },
              show: { y: "0%", opacity: 1, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } }
            }}
          >
            {w}
            {i < words.length - 1 ? "\u00A0" : ""}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

/* ------------------------------------------------------------------
 * Marquee — infinite horizontal track, pause on hover. Duplicates
 * children for a seamless -50% loop. Frozen under reduced-motion.
 * ------------------------------------------------------------------ */
export function Marquee({
  children,
  duration = 36,
  reverse = false,
  className
}: {
  children: React.ReactNode;
  duration?: number;
  reverse?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("group/marquee relative overflow-hidden", className)}>
      <div
        className="flex w-max gap-[var(--s-4)] [animation:v2-marquee_linear_infinite] group-hover/marquee:[animation-play-state:paused] motion-reduce:[animation:none]"
        style={{ animationDuration: `${duration}s`, animationDirection: reverse ? "reverse" : "normal" }}
      >
        <div className="flex shrink-0 gap-[var(--s-4)]">{children}</div>
        <div aria-hidden className="flex shrink-0 gap-[var(--s-4)]">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
 * ScrollProgress — thin brand-gradient bar bound to page scroll.
 * ------------------------------------------------------------------ */
export function ScrollProgress({ className }: { className?: string }) {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.3 });
  return (
    <motion.div
      aria-hidden
      style={{ scaleX } as { scaleX: MotionValue<number> }}
      className={cn(
        "absolute inset-x-0 bottom-0 h-[2px] origin-left",
        "bg-[image:var(--grad-brand)] motion-reduce:hidden",
        className
      )}
    />
  );
}

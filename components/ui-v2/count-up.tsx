"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

/* CountUp — animates a number into view. Supports prefix/suffix
 * and a non-numeric fallback (renders text as-is). */
export function CountUp({
  value,
  duration = 1200,
  className
}: {
  value: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState<string>("");

  const parsed = useMemo(() => {
    // Parse "12.4tr", "99K", "30 ngày", "0", "9/12".
    const match = value.match(/^([^\d]*)([\d.,]+)(.*)$/);
    const prefix = match?.[1] ?? "";
    const numStr = match?.[2] ?? "";
    const suffix = match?.[3] ?? "";
    const target = Number(numStr.replace(/,/g, ""));
    const decimals = numStr.includes(".") ? numStr.split(".")[1].length : 0;
    return { canAnimate: Boolean(match) && !Number.isNaN(target), decimals, prefix, suffix, target };
  }, [value]);

  useEffect(() => {
    if (!inView) return;
    if (reduce || !parsed.canAnimate) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = (parsed.target * eased).toFixed(parsed.decimals);
      setDisplay(`${parsed.prefix}${current}${parsed.suffix}`);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce, duration, parsed]);

  const fallback = reduce || !parsed.canAnimate ? value : `${parsed.prefix}0${parsed.suffix}`;

  return (
    <span ref={ref} className={className}>
      {display || fallback}
    </span>
  );
}

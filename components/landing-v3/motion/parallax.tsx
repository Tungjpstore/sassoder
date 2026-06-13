"use client";

import * as React from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";

/* Parallax — translate a layer on the Y axis as it scrolls through
 * the viewport. `speed` is the total travel in px across the scroll
 * range (negative moves up faster than scroll). Respects
 * prefers-reduced-motion by rendering a static element. */
export function Parallax({
  children,
  speed = -60,
  className,
  damp = true
}: {
  children: React.ReactNode;
  speed?: number;
  className?: string;
  damp?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  });
  const raw = useTransform(scrollYProgress, [0, 1], [-speed, speed]);
  const y = useSpring(raw, damp ? { stiffness: 120, damping: 30, mass: 0.4 } : { stiffness: 1000, damping: 100 });

  if (reduce) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  );
}

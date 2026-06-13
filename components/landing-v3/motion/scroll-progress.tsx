"use client";

import { motion, useScroll, useSpring } from "framer-motion";

/* ScrollProgress — a thin brand-gradient bar pinned under the header
 * that fills as the page scrolls. Lives inside the sticky header. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.4 });

  return (
    <motion.div
      aria-hidden
      style={{ scaleX, transformOrigin: "0% 50%", backgroundImage: "var(--grad-jade-orange)" }}
      className="absolute inset-x-0 bottom-0 h-[2px]"
    />
  );
}

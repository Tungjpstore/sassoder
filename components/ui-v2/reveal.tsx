"use client";

import * as React from "react";
import { motion, useReducedMotion, type HTMLMotionProps, type Variants } from "framer-motion";

const variants: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } }
};

export function Reveal({
  as = "div",
  delay = 0,
  className,
  children,
  ...rest
}: Omit<HTMLMotionProps<"div">, "ref"> & {
  as?: "div" | "section" | "article" | "span" | "li";
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const M = motion[as] as typeof motion.div;
  return (
    <M
      className={className}
      initial={reduce ? "show" : "hidden"}
      whileInView="show"
      viewport={{ once: true, amount: 0.25 }}
      variants={variants}
      transition={{ delay }}
      {...rest}
    >
      {children}
    </M>
  );
}

export function RevealStagger({
  children,
  stagger = 0.06,
  className
}: {
  children: React.ReactNode;
  stagger?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? "show" : "hidden"}
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : stagger } } }}
    >
      {children}
    </motion.div>
  );
}

export const item: Variants = variants;

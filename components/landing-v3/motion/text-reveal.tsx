"use client";

import * as React from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

/* TextReveal — splits children text into words and reveals them with
 * a masked upward slide, staggered. Use for hero headings. Accepts
 * inline React nodes (e.g. <span class="v3-grad-text">) as whole
 * tokens so styled words stay intact. */

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.05 } }
};

const word: Variants = {
  hidden: { y: "110%" },
  show: { y: "0%", transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } }
};

function tokenize(node: React.ReactNode): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  React.Children.toArray(node).forEach((child, ci) => {
    if (typeof child === "string") {
      child.split(/(\s+)/).forEach((part, pi) => {
        if (part.trim() === "") {
          out.push(<span key={`s-${ci}-${pi}`}>{part}</span>);
        } else {
          out.push(
            <span key={`w-${ci}-${pi}`} className="inline-block overflow-hidden align-bottom">
              <motion.span variants={word} className="inline-block">
                {part}
              </motion.span>
            </span>
          );
        }
      });
    } else {
      out.push(
        <span key={`n-${ci}`} className="inline-block overflow-hidden align-bottom">
          <motion.span variants={word} className="inline-block">
            {child}
          </motion.span>
        </span>
      );
    }
  });
  return out;
}

export function TextReveal({
  children,
  className,
  as = "h1"
}: {
  children: React.ReactNode;
  className?: string;
  as?: "h1" | "h2" | "p" | "span";
}) {
  const reduce = useReducedMotion();
  const M = motion[as] as typeof motion.h1;

  if (reduce) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  return (
    <M
      className={className}
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.6 }}
    >
      {tokenize(children)}
    </M>
  );
}

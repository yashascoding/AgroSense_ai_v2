"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Props = {
  phrases: string[];
  intervalMs?: number;
  className?: string;
};

/** Short rotating phrases with a soft vertical flip — for badges, subtitles, microcopy. */
export function RotatingMicrocopy({ phrases, intervalMs = 2800, className }: Props) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setIdx((i) => (i + 1) % phrases.length), intervalMs);
    return () => window.clearInterval(id);
  }, [phrases.length, intervalMs]);

  return (
    <span className={cn("inline-flex min-h-[1.35em] items-center justify-center", className)}>
      <AnimatePresence mode="wait">
        <motion.span
          key={phrases[idx]}
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="inline-block"
        >
          {phrases[idx]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

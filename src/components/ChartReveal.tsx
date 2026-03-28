import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Reveals chart content upward from the bottom (clip + fade). */
export function ChartReveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={cn("overflow-hidden", className)}
      initial={{ clipPath: "inset(0 0 100% 0)", opacity: 0.75 }}
      animate={{ clipPath: "inset(0 0 0% 0)", opacity: 1 }}
      transition={{ duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

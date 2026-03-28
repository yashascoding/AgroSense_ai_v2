"use client";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export const LayoutTextFlip = ({
  text = "Build Amazing",
  words = ["Landing Pages", "Component Blocks", "Page Sections"],
  duration = 3000,
  className,
  showCursor = false,
}: {
  text: string;
  words: string[];
  duration?: number;
  /** Applied to both the static label and the rotating word box for responsive sizing. */
  className?: string;
  showCursor?: boolean;
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % words.length);
    }, duration);
    return () => clearInterval(interval);
  }, [words.length, duration]);

  const textSize = cn(
    "font-display font-bold tracking-tight drop-shadow-sm",
    className ?? "text-4xl sm:text-5xl md:text-6xl",
  );

  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-2">
      <motion.span layoutId="hero-static-label" className={textSize}>
        {text}
      </motion.span>{" "}
      <span className="inline-flex items-center gap-1">
        <motion.span
          layout
          className={cn(
            "relative inline-flex min-h-[1.15em] min-w-[2ch] overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-br from-primary/15 to-primary/5 px-3 py-1.5 text-primary shadow-sm ring-1 ring-primary/20 sm:px-4 sm:py-2",
            textSize,
          )}
        >
          <AnimatePresence mode="popLayout">
            <motion.span
              key={currentIndex}
              initial={{ y: 36, opacity: 0, filter: "blur(8px)" }}
              animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
              exit={{ y: -36, opacity: 0, filter: "blur(8px)" }}
              transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
              className="inline-block whitespace-nowrap font-display"
            >
              {words[currentIndex]}
            </motion.span>
          </AnimatePresence>
        </motion.span>
        {showCursor && (
          <span
            aria-hidden
            className="inline-block h-[0.72em] min-h-[0.85rem] w-[0.1em] min-w-[3px] rounded-sm bg-primary animate-cursor-blink align-middle"
          />
        )}
      </span>
    </span>
  );
};

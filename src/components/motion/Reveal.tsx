"use client";

import { useRef, type CSSProperties, type ElementType, type ReactNode } from "react";
import styles from "./motion.module.css";
import { useInView } from "./useMotionHooks";

export interface RevealProps {
  children: ReactNode;
  /** Element to render, e.g. "section", "li", "h2". Default "div". */
  as?: ElementType;
  /** Delay in ms before the reveal starts (use for staggering siblings). */
  delay?: number;
  className?: string;
  id?: string;
}

/** Scroll reveal wrapper: fades its children in with a 16px rise the first time they enter the viewport. */
export function Reveal({ children, as, delay = 0, className, id }: RevealProps) {
  const Tag: ElementType = as ?? "div";
  const ref = useRef<HTMLElement | null>(null);
  const shown = useInView(ref, { once: true, rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  const style: CSSProperties | undefined = delay > 0 ? { transitionDelay: `${delay}ms` } : undefined;

  return (
    <Tag
      ref={ref}
      id={id}
      className={className ? `${styles.reveal} ${className}` : styles.reveal}
      data-shown={shown ? "true" : "false"}
      style={style}
    >
      {children}
    </Tag>
  );
}

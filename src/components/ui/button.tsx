"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /**
   * primary   solid fire — the one thing to do next
   * secondary sea outline — deliberately subordinate to primary
   * ghost     hairline — reversible, low-stakes
   * danger    destructive
   */
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** lg wears Anton and is for hero calls to action; sm/md wear mono. */
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading,
  icon,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const isLarge = size === "lg";

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-3 rounded-[3px] transition",
        // Anton for hero actions; mono, letterspaced and uppercase for everything else.
        isLarge
          ? "min-h-16 px-6 font-display text-[28px] uppercase leading-none tracking-[0.005em]"
          : "font-mono font-extrabold uppercase tracking-[0.14em]",
        size === "md" && "min-h-13 px-5 text-[15px]",
        size === "sm" && "min-h-10 px-3 text-[13px]",
        variant === "primary" && "border-0 bg-fire text-ground hover:bg-fire-soft",
        variant === "secondary" &&
          "border border-sea bg-transparent text-sea hover:bg-sea/10",
        variant === "ghost" &&
          "border border-line-strong bg-transparent text-ink-soft hover:border-white/30 hover:text-ink",
        variant === "danger" &&
          "border border-danger/60 bg-danger/10 text-danger hover:bg-danger/20",
        (disabled || loading) && "cursor-not-allowed opacity-40 hover:bg-transparent",
        disabled && variant === "primary" && "hover:bg-fire",
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Loader2
          className={cn("animate-spin", isLarge ? "h-6 w-6" : "h-4 w-4")}
          aria-hidden
        />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}

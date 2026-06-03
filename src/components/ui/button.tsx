"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  className,
  variant = "primary",
  loading,
  icon,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-black uppercase tracking-normal transition",
        "focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 focus:ring-offset-slate-950",
        variant === "primary" &&
          "bg-amber-300 text-slate-950 shadow-lg shadow-amber-950/30 hover:bg-amber-200",
        variant === "secondary" &&
          "bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-950/30 hover:bg-cyan-200",
        variant === "danger" && "bg-red-500 text-white shadow-lg shadow-red-950/30 hover:bg-red-400",
        variant === "ghost" &&
          "border border-white/15 bg-white/5 text-orange-50 hover:bg-white/10",
        (disabled || loading) && "cursor-not-allowed opacity-55",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

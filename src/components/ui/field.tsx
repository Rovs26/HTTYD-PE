import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export function TextField({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-12 w-full rounded-md border border-white/15 bg-slate-950/70 px-4 text-base text-orange-50 outline-none transition",
        "placeholder:text-slate-500 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/25",
        className
      )}
      {...props}
    />
  );
}

export function TextArea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-36 w-full resize-y rounded-md border border-white/15 bg-slate-950/70 px-4 py-3 text-base leading-relaxed text-orange-50 outline-none transition",
        "placeholder:text-slate-500 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/25",
        className
      )}
      {...props}
    />
  );
}

export function Label({
  children,
  htmlFor
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-black uppercase tracking-normal text-amber-200">
      {children}
    </label>
  );
}

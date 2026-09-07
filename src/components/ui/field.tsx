import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export function TextField({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-13 w-full rounded-[3px] border border-line-strong bg-panel px-4 text-[17px] text-ink outline-none transition",
        "placeholder:text-muted-3 focus:border-fire",
        className
      )}
      {...props}
    />
  );
}

/**
 * The join code. Deliberately oversized and letterspaced: it is read off a projector across
 * a room and typed by someone who is half-watching the screen.
 */
export function CodeField({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-19 w-full rounded-[3px] border border-white/20 bg-panel-2 px-5 text-center font-mono text-[40px] font-extrabold tracking-[0.22em] text-ink outline-none transition",
        "placeholder:text-dim focus:border-fire",
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
        "min-h-36 w-full resize-y rounded-[3px] border border-line-strong bg-panel px-4 py-3 text-[17px] leading-relaxed text-ink outline-none transition",
        "placeholder:text-muted-3 focus:border-fire",
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
    <label
      htmlFor={htmlFor}
      className="font-mono text-[12px] font-bold uppercase tracking-[0.22em] text-sea"
    >
      {children}
    </label>
  );
}

import { cn } from "@/lib/utils";

export function StatusPill({
  children,
  tone = "neutral"
}: {
  children: React.ReactNode;
  tone?: "neutral" | "hot" | "cool" | "gold";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-black uppercase tracking-normal",
        tone === "neutral" && "border-white/15 bg-white/10 text-orange-50",
        tone === "hot" && "border-red-300/40 bg-red-500/20 text-red-100",
        tone === "cool" && "border-cyan-300/40 bg-cyan-500/20 text-cyan-100",
        tone === "gold" && "border-amber-300/50 bg-amber-300/20 text-amber-100"
      )}
    >
      {children}
    </span>
  );
}

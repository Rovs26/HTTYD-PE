import { cn } from "@/lib/utils";

/**
 * A phase marker. `live` is the only tone that animates — at a glance the room should be able
 * to tell what is happening right now from the one pulsing element.
 */
export function StatusPill({
  children,
  tone = "neutral",
  live = false
}: {
  children: React.ReactNode;
  tone?: "neutral" | "fire" | "sea" | "gold" | "danger";
  live?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-[3px] border px-3 py-1.5 font-mono text-[12px] font-bold uppercase tracking-[0.16em]",
        tone === "neutral" && "border-line bg-white/5 text-muted",
        tone === "fire" && "border-fire/50 bg-fire/10 text-fire",
        tone === "sea" && "border-sea/40 bg-sea/10 text-sea",
        tone === "gold" && "border-gold/40 bg-gold/10 text-gold",
        tone === "danger" && "border-danger/50 bg-danger/10 text-danger"
      )}
    >
      {live ? (
        <span
          aria-hidden
          className="ember-pulse inline-block h-1.5 w-1.5 rounded-full bg-current"
        />
      ) : null}
      {children}
    </span>
  );
}

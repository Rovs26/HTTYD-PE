import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "not scored";
  }
  return `${Math.round(value)}`;
}

export function titleForScoringMode(value: string) {
  if (value === "voting_first") return "Voting first";
  if (value === "voting_only") return "Voting only";
  if (value === "ai_only") return "AI only";
  return "Blended";
}

import { describe, expect, it } from "vitest";
import {
  ROUNDS,
  TOTAL_ROUNDS,
  advancingCount,
  defaultInstructionFor,
  isFinalRound,
  isOpeningRound,
  nextRoundCutLine,
  roundConfig,
  roundTitle
} from "@/lib/game/progression";

describe("round progression config", () => {
  it("describes every round exactly once, numbered from 1", () => {
    expect(ROUNDS.map((round) => round.number)).toEqual([1, 2, 3]);
    expect(TOTAL_ROUNDS).toBe(3);
  });

  it("knows the final round, which has no cut", () => {
    expect(isFinalRound(3)).toBe(true);
    expect(isFinalRound(2)).toBe(false);
    expect(roundConfig(3)?.cut).toBeNull();
    expect(nextRoundCutLine(3)).toBe(0);
  });

  it("knows the opening round, the only one written from scratch", () => {
    expect(isOpeningRound(1)).toBe(true);
    expect(isOpeningRound(2)).toBe(false);
  });

  it("gives every non-final round a fallback instruction", () => {
    expect(defaultInstructionFor(1)).toBeTruthy();
    expect(defaultInstructionFor(2)).toBeTruthy();
    expect(defaultInstructionFor(3)).toBeNull();
  });

  it("falls back to a generic title for an unknown round", () => {
    expect(roundTitle(1)).toMatch(/Round 1/);
    expect(roundTitle(9)).toBe("Round 9");
  });
});

describe("advancingCount", () => {
  it("reproduces the original 10 / 4 cut for a full class", () => {
    expect(advancingCount(1, 30)).toBe(10);
    expect(advancingCount(2, 10)).toBe(4);
  });

  it("still cuts meaningfully in a small class", () => {
    // The old fixed cut of 10 meant a class of 12 lost only two students in round 1.
    expect(advancingCount(1, 12)).toBe(6);
    expect(advancingCount(1, 8)).toBe(4);
  });

  it("never keeps fewer than the floor", () => {
    expect(advancingCount(1, 5)).toBe(4);
    expect(advancingCount(2, 3)).toBe(2);
  });

  it("never advances more players than exist", () => {
    expect(advancingCount(1, 3)).toBe(3);
    expect(advancingCount(2, 1)).toBe(1);
  });

  it("advances nobody from the final round, which ends the game", () => {
    expect(advancingCount(3, 4)).toBe(0);
  });

  it("advances nobody when nobody is ranked", () => {
    expect(advancingCount(1, 0)).toBe(0);
  });

  it("always leaves at least one player eliminated when a cut applies", () => {
    for (let players = 2; players <= 40; players += 1) {
      expect(advancingCount(1, players)).toBeLessThanOrEqual(players);
    }
  });
});

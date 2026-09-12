import { describe, expect, it } from "vitest";
import {
  DEFAULT_FLEXIBLE_SIZE,
  DEFAULT_NAMED_SIZE,
  isValidImageSize,
  modelSupportsArbitrarySize,
  resolveImageSize
} from "@/lib/ai/image-size";

describe("image size", () => {
  it("knows which models accept an arbitrary size", () => {
    expect(modelSupportsArbitrarySize("gpt-image-2")).toBe(true);
    expect(modelSupportsArbitrarySize("gpt-image-2-2026-04-21")).toBe(true);
    expect(modelSupportsArbitrarySize("gpt-image-1")).toBe(false);
    expect(modelSupportsArbitrarySize("gpt-image-1-mini")).toBe(false);
  });

  it("accepts the named sizes on every model", () => {
    for (const size of ["1024x1024", "1536x1024", "1024x1536", "auto"]) {
      expect(isValidImageSize("gpt-image-1", size)).toBe(true);
      expect(isValidImageSize("gpt-image-2", size)).toBe(true);
    }
  });

  // A smaller image, so thirty phones are not all waiting on 1024x1024 renders.
  it("accepts a smaller square on gpt-image-2 but not on the older models", () => {
    expect(isValidImageSize("gpt-image-2", "832x832")).toBe(true);
    expect(isValidImageSize("gpt-image-1", "832x832")).toBe(false);
  });

  // Measured against the live API: 720x720 and 768x768 are refused as "below the current
  // minimum pixel budget", 832x832 renders. Pinned so nobody re-lowers this from the docs,
  // which describe the divisible-by-16 rule but not this floor.
  it("rejects sizes under the API's minimum pixel budget", () => {
    expect(isValidImageSize("gpt-image-2", "720x720")).toBe(false);
    expect(isValidImageSize("gpt-image-2", "768x768")).toBe(false);
    expect(isValidImageSize("gpt-image-2", "832x832")).toBe(true);
    expect(isValidImageSize("gpt-image-2", "896x896")).toBe(true);
  });

  it("requires both edges to divide by 16", () => {
    expect(isValidImageSize("gpt-image-2", "833x832")).toBe(false);
    expect(isValidImageSize("gpt-image-2", "900x900")).toBe(false);
  });

  it("rejects sizes outside the supported aspect ratio and bounds", () => {
    expect(isValidImageSize("gpt-image-2", "3072x768")).toBe(false); // 4:1
    expect(isValidImageSize("gpt-image-2", "768x3072")).toBe(false); // 1:4
    expect(isValidImageSize("gpt-image-2", "1536x512")).toBe(true); // exactly 3:1
    expect(isValidImageSize("gpt-image-2", "4096x2160")).toBe(false); // beyond the ceiling
  });

  it("rejects malformed values", () => {
    for (const value of ["720", "720X720", "720 x 720", "", "cheap"]) {
      expect(isValidImageSize("gpt-image-2", value)).toBe(false);
    }
  });

  it("defaults to the small size on a model that supports it", () => {
    expect(resolveImageSize("gpt-image-2", undefined)).toBe(DEFAULT_FLEXIBLE_SIZE);
    expect(resolveImageSize("gpt-image-1", undefined)).toBe(DEFAULT_NAMED_SIZE);
  });

  it("honours a valid configured size", () => {
    expect(resolveImageSize("gpt-image-2", "1536x1024")).toBe("1536x1024");
    expect(resolveImageSize("gpt-image-2", " 896x896 ")).toBe("896x896");
  });

  // A typo in an env var must not take the game down in front of a class.
  it("falls back instead of passing an unusable size to the API", () => {
    expect(resolveImageSize("gpt-image-2", "700x700")).toBe(DEFAULT_FLEXIBLE_SIZE);
    expect(resolveImageSize("gpt-image-2", "720x720")).toBe(DEFAULT_FLEXIBLE_SIZE);
    expect(resolveImageSize("gpt-image-1", "832x832")).toBe(DEFAULT_NAMED_SIZE);
  });
});

import { describe, expect, it } from "vitest";
import { cappedImageQuality } from "@/lib/ai/openai";

describe("OpenAI image settings", () => {
  it("keeps image quality capped to low or medium", () => {
    expect(cappedImageQuality("low", "medium")).toBe("low");
    expect(cappedImageQuality("medium", "low")).toBe("medium");
    expect(cappedImageQuality("high", "low")).toBe("medium");
    expect(cappedImageQuality("auto", "low")).toBe("medium");
    expect(cappedImageQuality("hd", "low")).toBe("medium");
    expect(cappedImageQuality("standard", "low")).toBe("medium");
  });
});

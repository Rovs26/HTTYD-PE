import OpenAI from "openai";
import { buildBaseDragonPrompt } from "@/lib/game/prompts";
import { shouldUseMockAi } from "@/lib/config";
import { mockGenerateChallenge, mockGenerateImage, mockScoreSimilarity } from "@/lib/ai/mock";
import { uploadDataUrl, uploadImageBase64 } from "@/lib/storage";

let openaiClient: OpenAI | null = null;

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  return openaiClient;
}

function imageModel() {
  return process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
}

function imageSize() {
  return process.env.OPENAI_IMAGE_SIZE ?? "768x768";
}

type ImageQuality = "standard" | "hd" | "low" | "medium" | "high" | "auto";

function imageQuality(value: string | undefined, fallback: ImageQuality): ImageQuality {
  if (value === "low" || value === "medium") {
    return value;
  }
  return fallback;
}

function challengeImageQuality() {
  return imageQuality(
    process.env.OPENAI_CHALLENGE_IMAGE_QUALITY ?? process.env.OPENAI_IMAGE_QUALITY,
    "medium"
  );
}

function studentImageQuality() {
  return imageQuality(
    process.env.OPENAI_STUDENT_IMAGE_QUALITY ?? process.env.OPENAI_IMAGE_QUALITY,
    "low"
  );
}

function evalModel() {
  return process.env.OPENAI_EVAL_MODEL ?? "gpt-5.4-mini";
}

function visionDetail(): "low" | "high" | "auto" {
  const value = process.env.OPENAI_VISION_DETAIL;
  if (value === "high" || value === "auto") {
    return value;
  }
  return "low";
}

export async function generateChallengeImage(gameId: string) {
  if (shouldUseMockAi()) {
    return mockGenerateChallenge();
  }

  const client = getOpenAI();
  if (!client) {
    return mockGenerateChallenge();
  }

  const prompt = buildBaseDragonPrompt();
  const result = await client.images.generate({
    model: imageModel(),
    prompt,
    size: imageSize(),
    quality: challengeImageQuality()
  });
  const base64 = result.data?.[0]?.b64_json;
  if (!base64) {
    throw new Error("OpenAI did not return image data.");
  }

  const stored = await uploadImageBase64({
    base64,
    path: `${gameId}/challenge-${Date.now()}.png`,
    contentType: "image/png"
  });

  return {
    imageUrl: stored.url,
    storagePath: stored.path,
    prompt
  };
}

export async function generateStudentImage(input: {
  gameId: string;
  roundNumber: number;
  playerName: string;
  playerId: string;
  prompt: string;
}) {
  if (shouldUseMockAi()) {
    const mock = await mockGenerateImage(input.prompt, input.playerName);
    if (mock.imageUrl.startsWith("data:")) {
      const stored = await uploadDataUrl({
        dataUrl: mock.imageUrl,
        path: `${input.gameId}/round-${input.roundNumber}/${input.playerId}.svg`
      });
      return {
        imageUrl: stored.url,
        storagePath: stored.path
      };
    }
    return mock;
  }

  const client = getOpenAI();
  if (!client) {
    return mockGenerateImage(input.prompt, input.playerName);
  }

  const result = await client.images.generate({
    model: imageModel(),
    prompt: input.prompt,
    size: imageSize(),
    quality: studentImageQuality()
  });
  const base64 = result.data?.[0]?.b64_json;
  if (!base64) {
    throw new Error("OpenAI did not return image data.");
  }

  const stored = await uploadImageBase64({
    base64,
    path: `${input.gameId}/round-${input.roundNumber}/${input.playerId}-${Date.now()}.png`,
    contentType: "image/png"
  });

  return {
    imageUrl: stored.url,
    storagePath: stored.path
  };
}

export async function scoreImageSimilarity(input: {
  challengeImageUrl: string;
  generatedImageUrl: string;
  prompt: string;
}) {
  if (shouldUseMockAi()) {
    return mockScoreSimilarity(input.prompt);
  }

  const client = getOpenAI();
  if (!client) {
    return mockScoreSimilarity(input.prompt);
  }

  const response = await client.responses.create({
    model: evalModel(),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "Compare these two images for a classroom prompt engineering game.",
              "The first image is the original challenge dragon. The second image is a student's generated result.",
              "Return strict JSON with score from 0 to 100 and a short rationale.",
              "Reward visual similarity, dragon features, scene, mood, composition, and prompt faithfulness."
            ].join(" ")
          },
          { type: "input_image", image_url: input.challengeImageUrl, detail: visionDetail() },
          { type: "input_image", image_url: input.generatedImageUrl, detail: visionDetail() }
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "dragon_similarity_score",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            score: { type: "number", minimum: 0, maximum: 100 },
            rationale: { type: "string" }
          },
          required: ["score", "rationale"]
        }
      }
    }
  });

  const output = response.output_text;
  const parsed = JSON.parse(output) as { score: number; rationale: string };
  return {
    score: Math.max(0, Math.min(100, Number(parsed.score))),
    rationale: parsed.rationale.slice(0, 500)
  };
}

import OpenAI from "openai";
import {
  buildBaseDragonPrompt,
  buildRoundChallengePrompt,
  buildStudentImagePrompt
} from "@/lib/game/prompts";
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
  const value = process.env.OPENAI_IMAGE_SIZE;
  if (
    value === "1024x1024" ||
    value === "1536x1024" ||
    value === "1024x1536" ||
    value === "auto"
  ) {
    return value;
  }
  return "1024x1024";
}

type ImageQuality = "standard" | "hd" | "low" | "medium" | "high" | "auto";

function imageQuality(value: string | undefined, fallback: ImageQuality): ImageQuality {
  if (value === "low" || value === "medium" || value === "high" || value === "auto") {
    return value;
  }
  return fallback;
}

function minimumMediumQuality(value: string | undefined, fallback: ImageQuality): ImageQuality {
  const quality = imageQuality(value, fallback);
  return quality === "low" || quality === "high" || quality === "auto" ? "medium" : quality;
}

function challengeImageQuality() {
  return minimumMediumQuality(
    process.env.OPENAI_CHALLENGE_IMAGE_QUALITY ?? process.env.OPENAI_IMAGE_QUALITY,
    "medium"
  );
}

function studentImageQuality() {
  return minimumMediumQuality(
    process.env.OPENAI_STUDENT_IMAGE_QUALITY ?? process.env.OPENAI_IMAGE_QUALITY,
    "medium"
  );
}

function imageOutputFormat(): "png" | "jpeg" | "webp" {
  const value = process.env.OPENAI_IMAGE_OUTPUT_FORMAT;
  if (value === "png" || value === "webp") {
    return value;
  }
  return "jpeg";
}

function imageContentType(format = imageOutputFormat()) {
  return `image/${format}`;
}

function imageExtension(format = imageOutputFormat()) {
  return format === "jpeg" ? "jpg" : format;
}

function evalModel() {
  return process.env.OPENAI_EVAL_MODEL ?? "gpt-5.4-mini";
}

function promptModel() {
  return process.env.OPENAI_PROMPT_MODEL ?? process.env.OPENAI_EVAL_MODEL ?? "gpt-5.4-mini";
}

function visionDetail(): "low" | "high" | "auto" {
  const value = process.env.OPENAI_VISION_DETAIL;
  if (value === "high" || value === "auto") {
    return value;
  }
  return "low";
}

export async function generateChallengeImage(gameId: string) {
  return generateChallengeImageFromPrompt({
    gameId,
    prompt: buildBaseDragonPrompt(),
    pathPrefix: "challenge"
  });
}

export async function generateRoundChallengeImage(input: {
  gameId: string;
  roundNumber: number;
  basePrompt: string;
  additionalInstruction: string;
}) {
  const prompt = buildRoundChallengePrompt({
    basePrompt: input.basePrompt,
    additionalInstruction: input.additionalInstruction,
    roundNumber: input.roundNumber
  });

  return generateChallengeImageFromPrompt({
    gameId: input.gameId,
    prompt,
    pathPrefix: `round-${input.roundNumber}/challenge`
  });
}

async function generateChallengeImageFromPrompt(input: {
  gameId: string;
  prompt: string;
  pathPrefix: string;
}) {
  if (shouldUseMockAi()) {
    return mockGenerateChallenge(input.prompt);
  }

  const client = getOpenAI();
  if (!client) {
    return mockGenerateChallenge(input.prompt);
  }

  try {
    const outputFormat = imageOutputFormat();
    const result = await client.images.generate({
      model: imageModel(),
      prompt: input.prompt,
      size: imageSize(),
      quality: challengeImageQuality(),
      output_format: outputFormat,
      output_compression: outputFormat === "png" ? undefined : 86,
      background: "opaque"
    });
    const base64 = result.data?.[0]?.b64_json;
    if (!base64) {
      throw new Error("OpenAI did not return image data.");
    }

    const contentType = imageContentType(outputFormat);
    const path = `${input.gameId}/${input.pathPrefix}-${Date.now()}.${imageExtension(outputFormat)}`;

    try {
      const stored = await uploadImageBase64({
        base64,
        path,
        contentType
      });

      return {
        imageUrl: stored.url,
        storagePath: stored.path,
        prompt: input.prompt
      };
    } catch (uploadError) {
      console.error("Challenge image upload failed; using generated data URL.", uploadError);
      return {
        imageUrl: `data:${contentType};base64,${base64}`,
        storagePath: null,
        prompt: input.prompt
      };
    }
  } catch (error) {
    console.error("Challenge image generation failed; using fallback challenge.", error);
    return mockGenerateChallenge(input.prompt);
  }
}

async function refineStudentImagePrompt(
  client: OpenAI,
  input: {
    basePrompt: string;
    studentPrompt: string;
    additionalInstruction?: string | null;
  }
) {
  const fallbackPrompt = buildStudentImagePrompt(input);

  try {
    const response = await client.responses.create({
      model: promptModel(),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "You are the Dragon Prompt Companion for a live classroom game.",
                "Rewrite the provided context into exactly one image-generation prompt.",
                "Preserve the original challenge dragon and scene, then apply the host round instruction and the student's locked prompt chain.",
                "Be concrete about subject, composition, action, lighting, setting, style, and visible details.",
                "Do not mention the player, the classroom, scoring, voting, prompt engineering, instructions, markdown, or JSON.",
                "Return only the final prompt text.",
                "",
                fallbackPrompt
              ].join("\n")
            }
          ]
        }
      ],
      max_output_tokens: 700
    });

    const refinedPrompt = response.output_text.trim();
    return refinedPrompt || fallbackPrompt;
  } catch {
    return fallbackPrompt;
  }
}

export async function generateStudentImage(input: {
  gameId: string;
  roundNumber: number;
  playerName: string;
  playerId: string;
  prompt: string;
  basePrompt: string;
  additionalInstruction?: string | null;
}) {
  const imagePrompt = buildStudentImagePrompt({
    basePrompt: input.basePrompt,
    studentPrompt: input.prompt,
    additionalInstruction: input.additionalInstruction
  });

  if (shouldUseMockAi()) {
    const mock = await mockGenerateImage(imagePrompt, input.playerName);
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
    return mockGenerateImage(imagePrompt, input.playerName);
  }

  const refinedPrompt = await refineStudentImagePrompt(client, {
    basePrompt: input.basePrompt,
    studentPrompt: input.prompt,
    additionalInstruction: input.additionalInstruction
  });

  const outputFormat = imageOutputFormat();
  const result = await client.images.generate({
    model: imageModel(),
    prompt: refinedPrompt,
    size: imageSize(),
    quality: studentImageQuality(),
    output_format: outputFormat,
    output_compression: outputFormat === "png" ? undefined : 86,
    background: "opaque"
  });
  const base64 = result.data?.[0]?.b64_json;
  if (!base64) {
    throw new Error("OpenAI did not return image data.");
  }

  const stored = await uploadImageBase64({
    base64,
    path: `${input.gameId}/round-${input.roundNumber}/${input.playerId}-${Date.now()}.${imageExtension(outputFormat)}`,
    contentType: imageContentType(outputFormat)
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
              "Reward visual similarity, dragon features, scene, mood, composition, and prompt faithfulness.",
              input.prompt ? `Intended prompt context: ${input.prompt.slice(0, 3000)}` : ""
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

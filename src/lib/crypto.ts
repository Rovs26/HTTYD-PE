import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

function appSecret() {
  const configured = process.env.APP_SECRET;
  if (configured && (process.env.NODE_ENV !== "production" || configured.length >= 32)) {
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_SECRET must be configured with at least 32 characters.");
  }

  return "development-secret-change-me";
}

export function createToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

export function createJoinCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[randomBytes(1)[0] % alphabet.length];
  }
  return code;
}

export function hashSecret(value: string) {
  return createHmac("sha256", appSecret()).update(value).digest("hex");
}

export function verifySecret(value: string | null | undefined, expectedHash: string) {
  if (!value) {
    return false;
  }

  const actual = Buffer.from(hashSecret(value), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}

export function constantTimeEqual(
  value: string | null | undefined,
  expected: string
) {
  const actualDigest = createHash("sha256").update(value ?? "").digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

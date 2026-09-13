import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { log, newRequestId } from "@/lib/logger";

export class AppError extends Error {
  status: number;
  /** Stable machine-readable code so the UI can react to the kind, not the wording. */
  code: string;

  constructor(message: string, status = 400, code = "app_error") {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

/**
 * A student-facing sentence for a validation failure.
 *
 * Zod's defaults are written for developers — a teenager who typed three words got back
 * "String must contain at least 8 character(s)". These are the fields a student or host can
 * actually put text into, so each gets wording that says what to do next. Anything else
 * falls back to a plain sentence rather than leaking the raw rule.
 */
export function friendlyValidationMessage(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return "Something in that request was not valid. Check it and try again.";
  }

  const field = issue.path[0];

  if (field === "prompt") {
    return issue.code === "too_big"
      ? "That prompt is too long. Keep it under 4000 characters."
      : "Write a bit more before locking it in — at least 8 characters.";
  }
  if (field === "name") {
    return "Enter a name — up to 80 characters.";
  }
  if (field === "pin") {
    return "The host PIN needs to be between 4 and 32 characters.";
  }
  if (field === "votedForPlayerId") {
    return "Pick a dragon to vote for.";
  }
  if (field === "playerToken" || field === "hostToken") {
    return "This device is not signed in to the game any more. Rejoin with the game code.";
  }
  if (field === "additionalInstruction") {
    return "That instruction is too long. Keep it under 1000 characters.";
  }

  return "Something in that request was not valid. Check it and try again.";
}

export type ApiErrorBody = {
  error: string;
  code: string;
  requestId?: string;
  details?: unknown;
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(error: unknown) {
  if (error instanceof AppError) {
    // Expected, actionable failures are the normal path — they are the messages the host and
    // students are meant to read, so they are not logged as errors.
    return NextResponse.json<ApiErrorBody>(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json<ApiErrorBody>(
      {
        error: friendlyValidationMessage(error),
        code: "invalid_request",
        // The raw rules stay available for debugging; they are just no longer the message.
        details: error.flatten()
      },
      { status: 422 }
    );
  }

  // Anything else is a real defect. Give it an id the user can quote back.
  const requestId = newRequestId();
  log.error("Unhandled API error", { requestId, error });

  return NextResponse.json<ApiErrorBody>(
    {
      error: `Something went wrong on the server. Quote reference ${requestId} if you need to report it.`,
      code: "internal_error",
      requestId
    },
    { status: 500 }
  );
}

export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

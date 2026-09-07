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
      { error: "Invalid request", code: "invalid_request", details: error.flatten() },
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

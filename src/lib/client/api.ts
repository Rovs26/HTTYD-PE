"use client";

/** A failed API call, carrying the status and machine-readable code the server sent. */
export class ApiError extends Error {
  status: number;
  code: string;
  requestId?: string;

  constructor(
    message: string,
    options: { status: number; code?: string; requestId?: string }
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code ?? "unknown";
    this.requestId = options.requestId;
  }

  /** The caller's own credentials are no longer valid — re-authenticating is the fix. */
  get isAuthFailure() {
    return this.status === 401;
  }

  /** The action was legal but not right now (wrong phase, already locked, game ended). */
  get isConflict() {
    return this.status === 409;
  }

  get isRateLimited() {
    return this.status === 429;
  }
}

export async function requestJson<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    ...init
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(data.error ?? "Request failed", {
      status: response.status,
      code: data.code,
      requestId: data.requestId
    });
  }

  return data as T;
}

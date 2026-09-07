/**
 * Minimal structured logging.
 *
 * Seven bare `console.*` calls used to be the whole observability story, and a failure
 * reached the host as "Unexpected server error" with nothing to correlate against the server
 * output. Every request now carries a short id that appears both in the log line and in the
 * error the host sees, so a teacher can read an id off the screen and it can be found.
 */

export type LogFields = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", message: string, fields: LogFields = {}) {
  const line = { level, message, ...fields };
  const serialized = JSON.stringify(line, (_key, value) =>
    value instanceof Error
      ? { name: value.name, message: value.message, stack: value.stack }
      : value
  );

  if (level === "error") {
    console.error(serialized);
  } else if (level === "warn") {
    console.warn(serialized);
  } else {
    console.log(serialized);
  }
}

export const log = {
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields)
};

/**
 * Short, human-transcribable id. A teacher may need to read this off a projector, so it is
 * 8 characters of unambiguous alphabet rather than a full UUID.
 */
export function newRequestId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (const byte of bytes) {
    id += alphabet[byte % alphabet.length];
  }
  return id;
}

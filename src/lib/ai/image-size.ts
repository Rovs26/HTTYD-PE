/**
 * Choosing the pixel size for a generated dragon.
 *
 * `1024x1024` is the default and nothing ships smaller. `gpt-image-2` does accept arbitrary
 * `WIDTHxHEIGHT` sizes — both edges divisible by 16, aspect within 1:3 to 3:1, above an
 * undocumented minimum pixel budget — so a deliberately configured smaller size still works.
 * The validation below exists so that a mistyped `OPENAI_IMAGE_SIZE` falls back here instead
 * of earning a 400 from the API in front of a class.
 */

/** Sizes every image model understands. */
const NAMED_SIZES = ["1024x1024", "1536x1024", "1024x1536", "auto"] as const;

/** Models that accept an arbitrary WIDTHxHEIGHT rather than only the named sizes. */
const ARBITRARY_SIZE_MODELS = [/^gpt-image-2/, /^gpt-image-latest/];

/** The default for every model. Nothing renders smaller unless it is configured to. */
export const DEFAULT_SIZE = "1024x1024";

const EDGE_MULTIPLE = 16;
/**
 * The API's undocumented "minimum pixel budget", measured against the live endpoint:
 *
 *     720x720 (0.52MP)  rejected      832x832 (0.69MP)  accepted
 *     768x768 (0.59MP)  rejected      896x896 (0.80MP)  accepted
 *
 * The floor sits between 0.59MP and 0.69MP. Anything below this is refused locally rather
 * than sent to be rejected mid-lesson.
 */
const MIN_PIXELS = 832 * 832;
const MAX_WIDTH = 3840;
const MAX_HEIGHT = 2160;
const MAX_ASPECT = 3;

export function modelSupportsArbitrarySize(model: string) {
  return ARBITRARY_SIZE_MODELS.some((pattern) => pattern.test(model));
}

/**
 * True when `value` is a size this model will actually accept. The API rejects the whole
 * request when it is not, so anything doubtful is refused here rather than mid-lesson.
 */
export function isValidImageSize(model: string, value: string) {
  if ((NAMED_SIZES as readonly string[]).includes(value)) {
    return true;
  }

  if (!modelSupportsArbitrarySize(model)) {
    return false;
  }

  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) {
    return false;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);

  if (width % EDGE_MULTIPLE !== 0 || height % EDGE_MULTIPLE !== 0) {
    return false;
  }
  if (width * height < MIN_PIXELS) {
    return false;
  }
  if (width > MAX_WIDTH || height > MAX_HEIGHT) {
    return false;
  }

  const aspect = width / height;
  return aspect <= MAX_ASPECT && aspect >= 1 / MAX_ASPECT;
}

/**
 * The size to request, given the configured model and `OPENAI_IMAGE_SIZE`.
 *
 * An unusable value falls back to the default rather than failing the request — a typo in an
 * env var should not take the game down in front of a class.
 */
export function resolveImageSize(model: string, configured: string | undefined) {
  const value = configured?.trim();

  if (value && isValidImageSize(model, value)) {
    return value;
  }

  return DEFAULT_SIZE;
}

/**
 * Choosing the pixel size for a generated dragon.
 *
 * This used to whitelist four values and silently coerce everything else back to
 * `1024x1024`, on the belief that the Images API accepted nothing else. That is only true of
 * the older models. `gpt-image-2` accepts arbitrary `WIDTHxHEIGHT` sizes provided both edges
 * divide by 16 and the aspect ratio stays between 1:3 and 3:1, so a classroom can ask for a
 * smaller, cheaper, faster image — which is the whole point, with thirty phones waiting.
 */

/** Sizes every image model understands. */
const NAMED_SIZES = ["1024x1024", "1536x1024", "1024x1536", "auto"] as const;

/** Models that accept an arbitrary WIDTHxHEIGHT rather than only the named sizes. */
const ARBITRARY_SIZE_MODELS = [/^gpt-image-2/, /^gpt-image-latest/];

/**
 * Smallest square the API actually renders, and so the default: 34% fewer pixels than
 * `1024x1024`, which is the cheapest and quickest this can honestly be made.
 *
 * 720x720 was asked for and is not possible. The documented rules (edges divisible by 16,
 * aspect within 1:3–3:1) are necessary but not sufficient — there is also an undocumented
 * floor the API calls the "current minimum pixel budget". Measured against the live API:
 *
 *     720x720 (0.52MP)  rejected      832x832 (0.69MP)  accepted, ~103KB
 *     768x768 (0.59MP)  rejected      896x896 (0.80MP)  accepted, ~116KB
 *
 * The floor sits between 0.59MP and 0.69MP. `832x832` is the smallest verified-good square;
 * it is kept rather than shaved closer because the API calls that budget "current", so a
 * size sitting exactly on the boundary could start failing mid-lesson.
 */
export const DEFAULT_FLEXIBLE_SIZE = "832x832";
export const DEFAULT_NAMED_SIZE = "1024x1024";

const EDGE_MULTIPLE = 16;
/** The measured floor above. Configuring anything smaller earns a 400 from the API. */
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
 * An unusable value falls back to the best default the model supports rather than failing the
 * request — a typo in an env var should not take the game down in front of a class.
 */
export function resolveImageSize(model: string, configured: string | undefined) {
  const value = configured?.trim();

  if (value && isValidImageSize(model, value)) {
    return value;
  }

  return modelSupportsArbitrarySize(model) ? DEFAULT_FLEXIBLE_SIZE : DEFAULT_NAMED_SIZE;
}

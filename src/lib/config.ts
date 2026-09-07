export function getPublicAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

export function getImageBucket() {
  return process.env.SUPABASE_IMAGES_BUCKET ?? "dragon-images";
}

export function hasSupabaseServerConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function hasSupabaseBrowserConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  );
}

export function getSupabaseBrowserKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

export function shouldUseMockAi() {
  if (process.env.AI_PROVIDER === "mock") {
    return true;
  }

  if (!process.env.OPENAI_API_KEY) {
    if (isProductionRuntime()) {
      throw new Error(
        "OPENAI_API_KEY is required in production unless AI_PROVIDER=mock is explicitly configured."
      );
    }
    return true;
  }

  return false;
}

"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserKey } from "@/lib/config";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowser() {
  const key = getSupabaseBrowserKey();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !key) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      key
    );
  }

  return browserClient;
}

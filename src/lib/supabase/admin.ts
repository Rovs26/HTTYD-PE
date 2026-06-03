import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/http";

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError(
      "Supabase server credentials are missing. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      503
    );
  }

  if (!adminClient) {
    adminClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }

  return adminClient;
}

import "server-only";
import { createAdminClient } from "@supabase/server/core";
import type { Database } from "@/lib/database.types";

// Client dùng secret key, bỏ qua RLS — CHỈ import từ code chạy trên server
// (API routes, Server Components). Không bao giờ được import vào "use client".
export function getSupabaseAdmin() {
  return createAdminClient<Database>();
}

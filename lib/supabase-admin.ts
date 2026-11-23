// Kết nối Supabase bằng khóa bí mật (service role). CHỈ dùng trong route máy chủ (app/api/...).
// Khóa này bỏ qua mọi giới hạn bảo mật, nên mọi truy vấn phải tự gắn đúng user_id.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function adminConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function admin(): SupabaseClient {
  if (!adminConfigured()) throw new Error("Chưa cấu hình SUPABASE_SERVICE_ROLE_KEY trên máy chủ.");
  cached ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

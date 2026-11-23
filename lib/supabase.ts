import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** null khi chưa cài Supabase: web chạy ở "chế độ thử", dữ liệu lưu trong trình duyệt. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

export const DEMO = !supabase;

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Tích hợp Supabase của Vercel có thể đặt tên khóa theo một trong hai kiểu
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** null khi chưa cài Supabase: web chạy ở "chế độ thử", dữ liệu lưu trong trình duyệt. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

export const DEMO = !supabase;

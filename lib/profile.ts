// Đọc/sửa hồ sơ của chính người đang đăng nhập (qua Supabase, có bảo mật RLS).
import { supabase } from "./supabase.ts";

export interface MyProfile {
  id: string;
  display_name: string;
  email: string;
  role: "member" | "moderator" | "admin";
  telegram_chat_id: number | null;
  notify_email: boolean;
  notify_telegram: boolean;
  digest_enabled: boolean;
  digest_hour: number;
  timezone: string;
}

export type ProfilePatch = Partial<Pick<MyProfile, "display_name" | "notify_email" | "notify_telegram" | "digest_enabled" | "digest_hour" | "timezone">>;

export async function loadProfile(): Promise<MyProfile | null> {
  if (!supabase) return null;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MyProfile | null) ?? null;
}

export async function saveProfile(id: string, patch: ProfilePatch): Promise<void> {
  const { error } = await supabase!.from("profiles").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Gọi API máy chủ của web kèm đăng nhập. */
export async function callApi<T = Record<string, unknown>>(path: string, method: "POST" | "DELETE" = "POST", body?: unknown): Promise<T> {
  const { data } = await supabase!.auth.getSession();
  const res = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Lỗi ${res.status}`);
  return json;
}

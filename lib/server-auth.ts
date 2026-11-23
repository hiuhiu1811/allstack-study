// Xác định người gọi API từ trình duyệt: web gửi kèm "Authorization: Bearer <access token>".

import { admin } from "./supabase-admin.ts";

export interface Caller { id: string; email: string }

export async function callerFrom(req: Request): Promise<Caller | null> {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  const { data, error } = await admin().auth.getUser(m[1]);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
}

export async function isAdminUser(userId: string): Promise<boolean> {
  const sb = admin();
  const { data: p } = await sb.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (p?.role === "admin") return true;
  const { data: a } = await sb.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  return !!a;
}

/** So khớp chuỗi bí mật, không lộ độ dài khớp qua thời gian. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const { timingSafeEqual } = await import("node:crypto");
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function siteOrigin(req: Request): string {
  const env = process.env.SITE_URL?.replace(/\/+$/, "");
  if (env) return env;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "https://allstack-study.vercel.app";
}

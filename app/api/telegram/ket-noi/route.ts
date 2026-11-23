// POST: tạo đường dẫn t.me/<bot>?start=<mã dùng một lần, hết hạn 10 phút>. DELETE: ngắt kết nối.
import { randomBytes } from "node:crypto";
import { callerFrom } from "@/lib/server-auth.ts";
import { admin, adminConfigured } from "@/lib/supabase-admin.ts";
import { sendTelegram, telegramConfigured } from "@/lib/telegram.ts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME?.replace(/^@/, "");
  if (!adminConfigured() || !telegramConfigured() || !bot) {
    return Response.json({ error: "Máy chủ chưa cấu hình bot Telegram (TELEGRAM_BOT_TOKEN, NEXT_PUBLIC_TELEGRAM_BOT_NAME)." }, { status: 503 });
  }
  const who = await callerFrom(req);
  if (!who) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const sb = admin();
  await sb.from("telegram_link_codes").delete().eq("user_id", who.id); // mỗi người một mã còn hiệu lực
  const code = randomBytes(18).toString("base64url");
  const { error } = await sb.from("telegram_link_codes").insert({ code, user_id: who.id, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ url: `https://t.me/${bot}?start=${code}` });
}

export async function DELETE(req: Request) {
  if (!adminConfigured()) return Response.json({ error: "Máy chủ chưa cấu hình." }, { status: 503 });
  const who = await callerFrom(req);
  if (!who) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const sb = admin();
  const { data } = await sb.from("profiles").select("telegram_chat_id").eq("id", who.id).maybeSingle();
  const { error } = await sb.from("profiles").update({ telegram_chat_id: null }).eq("id", who.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (data?.telegram_chat_id && telegramConfigured()) await sendTelegram(data.telegram_chat_id as number, "Đã ngắt kết nối với tài khoản AllStack.").catch(() => {});
  return Response.json({ ok: true });
}

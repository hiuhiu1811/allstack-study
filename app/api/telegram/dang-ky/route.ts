// Đăng ký webhook cho bot bằng một cú bấm (thay cho dòng lệnh).
// Cách 1: quản trị viên bấm nút ở trang Cài đặt (POST, kèm đăng nhập).
// Cách 2: mở địa chỉ  /api/telegram/dang-ky?khoa=<TELEGRAM_WEBHOOK_SECRET>  một lần trên trình duyệt (GET).
import { callerFrom, isAdminUser, safeEqual, siteOrigin } from "@/lib/server-auth.ts";
import { adminConfigured } from "@/lib/supabase-admin.ts";
import { tg } from "@/lib/telegram.ts";

export const dynamic = "force-dynamic";

async function register(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !process.env.TELEGRAM_BOT_TOKEN) throw new Error("Thiếu biến TELEGRAM_BOT_TOKEN hoặc TELEGRAM_WEBHOOK_SECRET trên Vercel (nhớ Redeploy sau khi thêm).");
  const url = siteOrigin(req) + "/api/telegram";
  const me = await tg<{ username: string }>("getMe", {});
  await tg("setWebhook", { url, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
  await tg("setMyCommands", { commands: [
    { command: "homnay", description: "Lịch hôm nay" },
    { command: "tuan", description: "Lịch 7 ngày tới" },
    { command: "viec", description: "Việc nhóm" },
    { command: "help", description: "Hướng dẫn" },
  ] });
  return { bot: me.username, url };
}

export async function POST(req: Request) {
  if (!adminConfigured()) return Response.json({ error: "Máy chủ chưa cấu hình." }, { status: 503 });
  const who = await callerFrom(req);
  if (!who) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  if (!(await isAdminUser(who.id))) return Response.json({ error: "Chỉ quản trị viên được đăng ký webhook." }, { status: 403 });
  try {
    return Response.json({ ok: true, ...(await register(req)) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const html = (status: number, body: string) =>
    new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font:16px system-ui;max-width:560px;margin:40px auto;padding:0 16px">${body}</body>`,
      { status, headers: { "content-type": "text/html; charset=utf-8" } });
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const given = new URL(req.url).searchParams.get("khoa") ?? "";
  if (!secret || !(await safeEqual(given, secret))) {
    return html(401, "<h2>Chưa đúng khóa</h2><p>Mở địa chỉ dạng <code>/api/telegram/dang-ky?khoa=GIÁ_TRỊ_TELEGRAM_WEBHOOK_SECRET</code>.</p>");
  }
  try {
    const r = await register(req);
    return html(200, `<h2>✅ Đã đăng ký bot @${r.bot}</h2><p>Webhook: <code>${r.url}</code></p><p>Giờ mở Telegram và thử nhắn cho bot.</p>`);
  } catch (e) {
    return html(500, `<h2>❌ Chưa đăng ký được</h2><p>${(e as Error).message.replace(/</g, "&lt;")}</p>`);
  }
}

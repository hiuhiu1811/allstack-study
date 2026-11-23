// Webhook của bot Telegram. Telegram gửi kèm "X-Telegram-Bot-Api-Secret-Token" để ta biết là hàng thật.
import { safeEqual, siteOrigin } from "@/lib/server-auth.ts";
import { adminConfigured } from "@/lib/supabase-admin.ts";
import { sendTelegram } from "@/lib/telegram.ts";
import { handleUpdate, type Update } from "@/lib/telegram-bot.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !process.env.TELEGRAM_BOT_TOKEN || !adminConfigured()) return Response.json({ error: "Bot chưa cấu hình." }, { status: 503 });
  if (!(await safeEqual(req.headers.get("x-telegram-bot-api-secret-token") ?? "", secret))) {
    return Response.json({ error: "Sai khóa." }, { status: 401 });
  }
  const update = (await req.json().catch(() => null)) as Update | null;
  if (!update) return Response.json({ ok: true });
  try {
    await handleUpdate(update, siteOrigin(req));
  } catch (e) {
    console.error("telegram:", (e as Error).message);
    const chat = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    if (chat) await sendTelegram(chat, "Có lỗi khi xử lý, bạn thử lại sau nhé.").catch(() => {});
  }
  return Response.json({ ok: true }); // luôn trả 200 để Telegram không gửi lại liên tục
}

// Gọi API của Telegram Bot. Chỉ dùng trên máy chủ.

const API = "https://api.telegram.org";

export interface InlineButton { text: string; callback_data?: string; url?: string }

export function telegramConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Chưa cấu hình TELEGRAM_BOT_TOKEN.");
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { ok: boolean; result?: T; description?: string } | null;
  if (!json?.ok) throw new Error(`Telegram ${method}: ${json?.description ?? res.status}`);
  return json.result as T;
}

export async function sendTelegram(chatId: number | string, text: string, buttons?: InlineButton[][]) {
  return tg("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4000),
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

/** Tải một file người dùng gửi cho bot (Telegram giới hạn 20MB). */
export async function downloadFile(fileId: string): Promise<Buffer> {
  const info = await tg<{ file_path: string }>("getFile", { file_id: fileId });
  const res = await fetch(`${API}/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${info.file_path}`);
  if (!res.ok) throw new Error("Không tải được file từ Telegram.");
  return Buffer.from(await res.arrayBuffer());
}

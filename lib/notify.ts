// Gửi thông báo cho một người dùng theo các kênh họ đã bật trong hồ sơ (email, Telegram).
// Dùng chung cho nhắc lịch ở đây và nhắc hạn việc ở phần Nhóm sau này: sendReminder(userId, text).

import { mailConfigured, sendEmail } from "./mailer.ts";
import { admin } from "./supabase-admin.ts";
import { sendTelegram, telegramConfigured } from "./telegram.ts";

export interface SendResult {
  email: boolean;
  telegram: boolean;
  /** true khi ít nhất một kênh gửi thành công */
  sent: boolean;
  /** true khi có ít nhất một kênh đủ điều kiện để thử gửi (đã bật, đã cấu hình). false = không có chỗ nào để gửi. */
  attempted: boolean;
  errors: string[];
}

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  telegram_chat_id: number | null;
  notify_email: boolean;
  notify_telegram: boolean;
  digest_enabled: boolean;
  digest_hour: number;
  timezone: string;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await admin().from("profiles").select("*").eq("id", userId).maybeSingle();
  return (data as Profile | null) ?? null;
}

/** channels: giới hạn kênh gửi (mặc định cả email và Telegram nếu người dùng đã bật). */
export async function sendReminder(
  userId: string,
  text: string,
  opts: { subject?: string; channels?: ("email" | "telegram")[]; profile?: Profile } = {},
): Promise<SendResult> {
  const out: SendResult = { email: false, telegram: false, sent: false, attempted: false, errors: [] };
  const p = opts.profile ?? (await getProfile(userId));
  if (!p) {
    out.errors.push("Không thấy hồ sơ người dùng.");
    return out;
  }
  const want = opts.channels ?? ["email", "telegram"];
  if (want.includes("email") && p.notify_email && p.email && mailConfigured()) {
    out.attempted = true;
    try {
      await sendEmail(p.email, opts.subject ?? "AllStack nhắc việc", text);
      out.email = true;
    } catch (e) {
      out.errors.push("email: " + (e as Error).message);
    }
  }
  if (want.includes("telegram") && p.notify_telegram && p.telegram_chat_id && telegramConfigured()) {
    out.attempted = true;
    try {
      await sendTelegram(p.telegram_chat_id, text);
      out.telegram = true;
    } catch (e) {
      out.errors.push("telegram: " + (e as Error).message);
    }
  }
  out.sent = out.email || out.telegram;
  return out;
}

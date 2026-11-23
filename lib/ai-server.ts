// Gọi AI dự phòng kèm giới hạn 20 lần/người/ngày. Chỉ dùng trên máy chủ.

import { AI_DAILY_LIMIT, aiEnabled, applyAiResult, askGemini } from "./ai-fallback.ts";
import type { Parsed } from "./parser.ts";
import { admin } from "./supabase-admin.ts";

/** Lấy một lượt dùng AI trong ngày. false = đã hết lượt. */
async function takeQuota(userId: string, day: string): Promise<boolean> {
  const sb = admin();
  const { data } = await sb.from("ai_usage").select("count").eq("user_id", userId).eq("day", day).maybeSingle();
  const used = (data?.count as number | undefined) ?? 0;
  if (used >= AI_DAILY_LIMIT) return false;
  await sb.from("ai_usage").upsert({ user_id: userId, day, count: used + 1 });
  return true;
}

/** Thử đọc ngày giờ bằng AI cho câu mà bộ đọc theo mẫu bỏ sót. Mọi lỗi/hết lượt/tắt AI đều trả null (giữ nguyên kết quả cũ). */
export async function aiParse(userId: string, sentence: string, p: Parsed, today: string): Promise<Parsed | null> {
  if (!aiEnabled() || p.foundDate) return null;
  try {
    if (!(await takeQuota(userId, today))) return null;
    return applyAiResult(p, await askGemini(sentence, today));
  } catch {
    return null;
  }
}

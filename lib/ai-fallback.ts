// AI dự phòng cho bộ đọc lịch (TÙY CHỌN, mặc định TẮT).
// Chỉ chạy khi đặt biến GEMINI_API_KEY (gói miễn phí) VÀ bộ đọc theo mẫu không thấy ngày giờ.
// Chỉ gửi đúng câu người dùng nhập, nhận lại ngày/giờ dạng JSON; kết quả vẫn hiện thẻ xem trước để người dùng kiểm tra.

import type { Parsed } from "./parser.ts";

export const AI_DAILY_LIMIT = 20;

export function aiEnabled(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export interface AiTime { date?: string | null; start?: string | null; end?: string | null }

/** Chỉ nhận ngày YYYY-MM-DD và giờ HH:MM hợp lệ, bỏ mọi thứ khác. Trả null nếu không dùng được. */
export function applyAiResult(p: Parsed, raw: unknown): Parsed | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as AiTime;
  const okDate = typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !Number.isNaN(Date.parse(r.date));
  const okTime = (t: unknown): t is string => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  if (!okDate && !okTime(r.start)) return null;
  const out: Parsed = { ...p, confident: false };
  if (okDate) {
    out.date = r.date as string;
    out.foundDate = true;
  }
  if (okTime(r.start)) {
    out.start = r.start;
    if (okTime(r.end) && r.end > r.start) out.end = r.end;
  }
  return out;
}

/** Hỏi Gemini ngày giờ trong câu. Ném lỗi nếu gọi thất bại. todayText: ngày hiện tại của người dùng, VD "2026-11-23". */
export async function askGemini(sentence: string, todayText: string): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("AI dự phòng đang tắt.");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const prompt =
    `Hôm nay là ${todayText} (giờ Việt Nam). Từ câu sau, chỉ lấy ngày và giờ của sự kiện. ` +
    `Trả JSON {"date":"YYYY-MM-DD" hoặc null,"start":"HH:MM" hoặc null,"end":"HH:MM" hoặc null}. Không viết gì thêm.\nCâu: ` +
    JSON.stringify(sentence.slice(0, 300));
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    }),
  });
  if (!res.ok) throw new Error("Gemini trả lỗi " + res.status);
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return JSON.parse(text);
}

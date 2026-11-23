// Web hỏi AI dự phòng khi bộ đọc theo mẫu không thấy ngày. Mặc định TẮT (cần biến GEMINI_API_KEY).
import { aiEnabled } from "@/lib/ai-fallback.ts";
import { aiParse } from "@/lib/ai-server.ts";
import { parseEvent } from "@/lib/parser.ts";
import { callerFrom } from "@/lib/server-auth.ts";
import { adminConfigured } from "@/lib/supabase-admin.ts";
import { dateIn, safeTz, wallClockNow } from "@/lib/tz.ts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!aiEnabled() || !adminConfigured()) return Response.json({ enabled: false });
  const who = await callerFrom(req);
  if (!who) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { text?: string; tz?: string };
  const text = String(body.text ?? "").slice(0, 300);
  if (!text.trim()) return Response.json({ enabled: true, result: null });
  const tz = safeTz(body.tz);
  const now = Date.now();
  const base = parseEvent(text, wallClockNow(now, tz));
  const result = await aiParse(who.id, text, base, dateIn(now, tz));
  return Response.json({ enabled: true, result });
}

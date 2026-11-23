// Xóa tài khoản của chính người gọi. Dữ liệu (lịch, ghi chú, hồ sơ...) tự xóa theo vì các bảng gắn "on delete cascade".
import { callerFrom } from "@/lib/server-auth.ts";
import { admin, adminConfigured } from "@/lib/supabase-admin.ts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!adminConfigured()) return Response.json({ error: "Máy chủ chưa cấu hình SUPABASE_SERVICE_ROLE_KEY nên chưa xóa tài khoản được." }, { status: 503 });
  const who = await callerFrom(req);
  if (!who) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { error } = await admin().auth.admin.deleteUser(who.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

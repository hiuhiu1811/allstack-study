// Quét và gửi nhắc việc. Supabase (pg_cron) gọi route này mỗi 5 phút, kèm "Authorization: Bearer <CRON_SECRET>".
import { digestDue, digestText, dueReminders, eventsOnDate, reminderText } from "@/lib/remind.ts";
import { getProfile, sendReminder, type Profile } from "@/lib/notify.ts";
import { safeEqual } from "@/lib/server-auth.ts";
import { admin, adminConfigured } from "@/lib/supabase-admin.ts";
import { addDays } from "@/lib/dates.ts";
import { safeTz, startOfDayIso } from "@/lib/tz.ts";
import type { CalEvent } from "@/lib/types.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ev = Pick<CalEvent, "id" | "user_id" | "title" | "start_at" | "end_at" | "all_day" | "location" | "cancelled" | "remind_minutes">;
const COLS = "id,user_id,title,start_at,end_at,all_day,location,cancelled,remind_minutes";

async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !adminConfigured()) return Response.json({ error: "Chưa cấu hình CRON_SECRET hoặc SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  const given = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  if (!(await safeEqual(given, secret))) return Response.json({ error: "Sai khóa." }, { status: 401 });

  const sb = admin();
  const now = Date.now();
  const summary = { events: 0, digests: 0, errors: [] as string[] };
  const profiles = new Map<string, Profile | null>();
  const profileOf = async (id: string) => {
    if (!profiles.has(id)) profiles.set(id, await getProfile(id));
    return profiles.get(id)!;
  };

  // 1. Nhắc sự kiện sắp diễn ra
  const { data: evs, error } = await sb
    .from("events").select(COLS)
    .eq("cancelled", false).not("remind_minutes", "is", null)
    .gt("start_at", new Date(now).toISOString())
    .lte("start_at", new Date(now + 3 * 86400_000).toISOString())
    .limit(1000);
  if (error) summary.errors.push("events: " + error.message);
  for (const e of dueReminders((evs ?? []) as Ev[], now)) {
    // "Giữ chỗ" trước: bảng có ràng buộc duy nhất nên hai lượt quét cùng lúc không gửi trùng
    const claim = await sb.from("reminder_log").insert({ user_id: e.user_id, kind: "event", ref: e.id }).select("id").maybeSingle();
    if (claim.error || !claim.data) continue; // đã nhắc rồi (hoặc lỗi ghi)
    const p = await profileOf(e.user_id!);
    if (!p) continue;
    const r = await sendReminder(e.user_id!, reminderText(e, safeTz(p.timezone), now), { subject: `Nhắc: ${e.title}`, profile: p });
    if (r.sent) summary.events++;
    else if (r.attempted) {
      // Có kênh nhưng gửi lỗi: bỏ giữ chỗ để lượt sau thử lại
      await sb.from("reminder_log").delete().eq("id", claim.data.id);
      summary.errors.push(`nhắc ${e.id}: ${r.errors.join("; ")}`);
    }
  }

  // 2. Email tóm tắt buổi sáng
  const { data: ps } = await sb.from("profiles").select("*").eq("digest_enabled", true).eq("notify_email", true).limit(2000);
  const due = ((ps ?? []) as Profile[])
    .map((p) => ({ p, ...digestDue({ ...p, timezone: safeTz(p.timezone) }, now) }))
    .filter((x) => x.due && x.p.email);
  if (due.length) {
    const { data: done } = await sb.from("reminder_log").select("user_id,ref").eq("kind", "digest")
      .in("user_id", due.map((x) => x.p.id)).in("ref", [...new Set(due.map((x) => x.date))]);
    const sent = new Set((done ?? []).map((d) => `${d.user_id}|${d.ref}`));
    for (const { p, date } of due) {
      if (sent.has(`${p.id}|${date}`)) continue;
      const tz = safeTz(p.timezone);
      const claim = await sb.from("reminder_log").insert({ user_id: p.id, kind: "digest", ref: date }).select("id").maybeSingle();
      if (claim.error || !claim.data) continue;
      const { data: day } = await sb.from("events").select(COLS).eq("user_id", p.id).eq("cancelled", false)
        .lt("start_at", startOfDayIso(addDays(date, 1), tz))
        .or(`start_at.gte.${startOfDayIso(date, tz)},end_at.gte.${startOfDayIso(date, tz)}`);
      const list = eventsOnDate((day ?? []) as Ev[], date, tz);
      if (!list.length) continue; // hôm nay không có lịch: không gửi thư
      const r = await sendReminder(p.id, digestText(date, list, tz), { subject: `Lịch hôm nay của bạn (${list.length} việc)`, channels: ["email"], profile: p });
      if (r.sent) summary.digests++;
      else if (r.attempted) {
        await sb.from("reminder_log").delete().eq("id", claim.data.id);
        summary.errors.push(`tóm tắt ${p.id}: ${r.errors.join("; ")}`);
      }
    }
  }

  // 3. Dọn dữ liệu cũ
  const iso = (ms: number) => new Date(ms).toISOString();
  await sb.from("telegram_drafts").delete().lt("created_at", iso(now - 86400_000));
  await sb.from("telegram_link_codes").delete().lt("expires_at", iso(now));
  await sb.from("reminder_log").delete().lt("sent_at", iso(now - 30 * 86400_000));
  await sb.from("ai_usage").delete().lt("day", new Date(now - 7 * 86400_000).toISOString().slice(0, 10));

  return Response.json({ ok: true, ...summary });
}

export const GET = run;
export const POST = run;

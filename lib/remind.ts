// Logic thuần (không đụng mạng/cơ sở dữ liệu) cho nhắc việc và tin nhắn bot, để dễ kiểm thử.

import { addDays, formatVN } from "./dates.ts";
import { dateIn, hourIn, timeIn } from "./tz.ts";
import type { CalEvent } from "./types.ts";

type Ev = Pick<CalEvent, "id" | "title" | "start_at" | "end_at" | "all_day" | "location" | "cancelled">;

/** Sự kiện cần nhắc ngay bây giờ: đã đến giờ nhắc (bắt đầu trừ remind_minutes) nhưng chưa bắt đầu, chưa hủy. */
export function dueReminders<T extends Ev & { remind_minutes: number | null }>(events: T[], nowMs: number): T[] {
  return events.filter((e) => {
    if (e.remind_minutes == null || e.cancelled) return false;
    const start = new Date(e.start_at).getTime();
    return start - e.remind_minutes * 60_000 <= nowMs && nowMs < start;
  });
}

/** "14:00–15:30" hoặc "Cả ngày" theo múi giờ tz. */
export function timeText(e: Ev, tz: string): string {
  if (e.all_day) return "Cả ngày";
  const s = timeIn(new Date(e.start_at).getTime(), tz);
  return e.end_at ? `${s}–${timeIn(new Date(e.end_at).getTime(), tz)}` : s;
}

export function eventLine(e: Ev, tz: string): string {
  return `${timeText(e, tz)} ${e.title}${e.location ? ` (${e.location})` : ""}`;
}

export function reminderText(e: Ev, tz: string, nowMs: number): string {
  const start = new Date(e.start_at).getTime();
  const mins = Math.max(1, Math.round((start - nowMs) / 60_000));
  const h = Math.floor(mins / 60);
  const when =
    mins >= 1440 ? `${Math.round(mins / 1440)} ngày nữa`
    : mins >= 60 ? `${h} tiếng${mins % 60 ? ` ${mins % 60} phút` : ""} nữa`
    : `${mins} phút nữa`;
  const day = dateIn(start, tz);
  const today = dateIn(nowMs, tz);
  const dayText = day === today ? "hôm nay" : formatVN(day);
  return `⏰ Sắp tới (${when}): ${e.title}\n${e.all_day ? "Cả ngày" : "Lúc " + timeIn(start, tz)}, ${dayText}${e.location ? `\nĐịa điểm: ${e.location}` : ""}`;
}

/** Giờ gửi tóm tắt: trong khoảng digest_hour đến digest_hour + 2 giờ (để lỡ một lượt quét vẫn gửi bù). */
export function digestDue(
  p: { digest_enabled: boolean; digest_hour: number; timezone: string },
  nowMs: number,
): { due: boolean; date: string } {
  const date = dateIn(nowMs, p.timezone);
  if (!p.digest_enabled) return { due: false, date };
  const h = hourIn(nowMs, p.timezone);
  return { due: h >= p.digest_hour && h <= p.digest_hour + 2, date };
}

/** Sự kiện chưa hủy chạm vào ngày date (YYYY-MM-DD tại tz), theo thứ tự giờ. */
export function eventsOnDate<T extends Ev>(events: T[], date: string, tz: string): T[] {
  return events
    .filter((e) => {
      if (e.cancelled) return false;
      const s = dateIn(new Date(e.start_at).getTime(), tz);
      let last = e.end_at ? dateIn(new Date(e.end_at).getTime(), tz) : s;
      if (e.end_at && last > s && timeIn(new Date(e.end_at).getTime(), tz) === "00:00") last = addDays(last, -1);
      return s <= date && date <= last;
    })
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
}

export function digestText(date: string, events: Ev[], tz: string): string {
  return `Lịch ${formatVN(date)}:\n` + events.map((e) => "• " + eventLine(e, tz)).join("\n");
}

/** Danh sách lịch nhiều ngày, nhóm theo ngày, dùng cho /homnay và /tuan. */
export function agendaText(from: string, days: number, events: Ev[], tz: string, conflicts: Set<string> = new Set()): string {
  const parts: string[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    const list = eventsOnDate(events, day, tz);
    if (!list.length) continue;
    parts.push(formatVN(day) + "\n" + list.map((e) => `• ${eventLine(e, tz)}${conflicts.has(e.id) ? " ⚠ trùng giờ" : ""}`).join("\n"));
  }
  return parts.join("\n\n");
}

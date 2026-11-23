// Bản nháp sự kiện và cách đổi thành các dòng dữ liệu. Không đụng tới nơi lưu nên dùng được cả ở máy chủ.
// Truyền tz (múi giờ người dùng) khi chạy trên máy chủ; ở trình duyệt để trống thì dùng giờ máy.

import { addDays, diffDays, isoDate, isoTime, toIso } from "./dates.ts";
import type { Parsed, Repeat } from "./parser.ts";
import type { NewEvent } from "./store.ts";
import type { CalEvent, Kind } from "./types.ts";

export interface Draft {
  title: string;
  kind: Kind;
  date: string;
  endDate: string; // "" = trong ngày
  allDay: boolean;
  start: string; // "" khi cả ngày
  end: string;
  location: string;
  note: string;
  remind: number | null;
  repeat: Repeat;
  repeatUntil: string;
}

export type Scope = "one" | "future" | "all";

export function emptyDraft(date: string): Draft {
  return {
    title: "", kind: "cn", date, endDate: "", allDay: false, start: "08:00", end: "", location: "", note: "",
    remind: null, repeat: "none", repeatUntil: addDays(date, 84),
  };
}

export function draftFromParsed(p: Parsed): Draft {
  const allDay = !p.start;
  return {
    title: p.title, kind: p.kind, date: p.date, endDate: p.endDate ?? "", allDay,
    start: p.start ?? "", end: p.end ?? "", location: p.location, note: p.note,
    remind: p.remindMinutes, repeat: p.repeat, repeatUntil: addDays(p.date, p.repeat === "daily" ? 30 : 84),
  };
}

export function draftFromEvent(e: CalEvent, tz?: string): Draft {
  const date = isoDate(e.start_at, tz);
  let endDate = "";
  let end = "";
  if (e.end_at) {
    const ed = isoDate(e.end_at, tz);
    if (e.all_day) endDate = ed > date ? ed : "";
    else {
      if (ed > date) endDate = ed;
      end = isoTime(e.end_at, tz);
    }
  }
  return {
    title: e.title, kind: e.kind, date, endDate, allDay: e.all_day, start: e.all_day ? "" : isoTime(e.start_at, tz), end,
    location: e.location, note: e.note, remind: e.remind_minutes, repeat: "none", repeatUntil: addDays(date, 84),
  };
}

/** Thời gian bắt đầu/kết thúc của bản nháp đặt vào một ngày cụ thể. */
export function timesOn(d: Draft, date: string, tz?: string): Pick<CalEvent, "start_at" | "end_at" | "all_day"> {
  const span = d.endDate && d.endDate > d.date ? diffDays(d.date, d.endDate) : 0;
  const endDay = addDays(date, span);
  if (d.allDay || !d.start) {
    return { start_at: toIso(date, null, tz), end_at: span ? toIso(endDay, null, tz) : null, all_day: true };
  }
  let endAt: string | null = null;
  if (d.end) endAt = toIso(endDay, d.end, tz);
  else if (span) endAt = toIso(endDay, d.start, tz);
  if (endAt && endAt <= toIso(date, d.start, tz)) endAt = null;
  return { start_at: toIso(date, d.start, tz), end_at: endAt, all_day: false };
}

export function fields(d: Draft) {
  return {
    title: d.title.trim() || "(Không tiêu đề)", kind: d.kind, location: d.location.trim(), note: d.note.trim(),
    remind_minutes: d.remind,
  };
}

/** Một bản nháp xem trước để kiểm tra trùng lịch. */
export function previewTimes(d: Draft, tz?: string) {
  return { ...timesOn(d, d.date, tz), cancelled: false };
}

/** Tạo các dòng cần lưu. Sự kiện lặp được tách thành từng buổi có chung series_id (tối đa 200 buổi). */
export function rowsFromDraft(d: Draft, tz?: string): NewEvent[] {
  const base = { ...fields(d), cancelled: false, done: false };
  if (d.repeat === "none") return [{ ...base, ...timesOn(d, d.date, tz), series_id: null }];
  const step = d.repeat === "daily" ? 1 : 7;
  const until = d.repeatUntil && d.repeatUntil >= d.date ? d.repeatUntil : addDays(d.date, step * 12);
  const series = crypto.randomUUID();
  const rows: NewEvent[] = [];
  for (let day = d.date; day <= until && rows.length < 200; day = addDays(day, step)) {
    rows.push({ ...base, ...timesOn(d, day, tz), series_id: series });
  }
  return rows;
}


// Chuyển qua lại giữa "bản nháp" trong form và dòng dữ liệu sự kiện,
// và xử lý sửa/hủy/xóa cho sự kiện lặp lại (chỉ buổi này / từ buổi này / tất cả).

import { addDays, diffDays, isoDate, isoTime, toIso } from "./dates.ts";
import type { Parsed, Repeat } from "./parser.ts";
import { store, type NewEvent } from "./store.ts";
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

export function draftFromEvent(e: CalEvent): Draft {
  const date = isoDate(e.start_at);
  let endDate = "";
  let end = "";
  if (e.end_at) {
    const ed = isoDate(e.end_at);
    if (e.all_day) endDate = ed > date ? ed : "";
    else {
      if (ed > date) endDate = ed;
      end = isoTime(e.end_at);
    }
  }
  return {
    title: e.title, kind: e.kind, date, endDate, allDay: e.all_day, start: e.all_day ? "" : isoTime(e.start_at), end,
    location: e.location, note: e.note, remind: e.remind_minutes, repeat: "none", repeatUntil: addDays(date, 84),
  };
}

/** Thời gian bắt đầu/kết thúc của bản nháp đặt vào một ngày cụ thể. */
function timesOn(d: Draft, date: string): Pick<CalEvent, "start_at" | "end_at" | "all_day"> {
  const span = d.endDate && d.endDate > d.date ? diffDays(d.date, d.endDate) : 0;
  const endDay = addDays(date, span);
  if (d.allDay || !d.start) {
    return { start_at: toIso(date, null), end_at: span ? toIso(endDay, null) : null, all_day: true };
  }
  let endAt: string | null = null;
  if (d.end) endAt = toIso(endDay, d.end);
  else if (span) endAt = toIso(endDay, d.start);
  if (endAt && endAt <= toIso(date, d.start)) endAt = null;
  return { start_at: toIso(date, d.start), end_at: endAt, all_day: false };
}

function fields(d: Draft) {
  return {
    title: d.title.trim() || "(Không tiêu đề)", kind: d.kind, location: d.location.trim(), note: d.note.trim(),
    remind_minutes: d.remind,
  };
}

/** Một bản nháp xem trước để kiểm tra trùng lịch. */
export function previewTimes(d: Draft) {
  return { ...timesOn(d, d.date), cancelled: false };
}

/** Tạo các dòng cần lưu. Sự kiện lặp được tách thành từng buổi có chung series_id (tối đa 200 buổi). */
export function rowsFromDraft(d: Draft): NewEvent[] {
  const base = { ...fields(d), cancelled: false, done: false };
  if (d.repeat === "none") return [{ ...base, ...timesOn(d, d.date), series_id: null }];
  const step = d.repeat === "daily" ? 1 : 7;
  const until = d.repeatUntil && d.repeatUntil >= d.date ? d.repeatUntil : addDays(d.date, step * 12);
  const series = crypto.randomUUID();
  const rows: NewEvent[] = [];
  for (let day = d.date; day <= until && rows.length < 200; day = addDays(day, step)) {
    rows.push({ ...base, ...timesOn(d, day), series_id: series });
  }
  return rows;
}

async function targets(ev: CalEvent, scope: Scope): Promise<CalEvent[]> {
  if (scope === "one" || !ev.series_id) return [ev];
  const all = await store.seriesEvents(ev.series_id);
  return scope === "all" ? all : all.filter((e) => e.start_at >= ev.start_at);
}

/** Lưu thay đổi. Với nhiều buổi: giữ ngày riêng của từng buổi, dời theo số ngày đã đổi, áp giờ mới. */
export async function saveEdit(ev: CalEvent, d: Draft, scope: Scope) {
  const shift = diffDays(isoDate(ev.start_at), d.date);
  const rows = (await targets(ev, scope)).map((row) => ({
    ...row,
    ...fields(d),
    ...timesOn(d, addDays(isoDate(row.start_at), shift)),
  }));
  await store.upsertEvents(rows);
}

export async function setCancelled(ev: CalEvent, cancelled: boolean, scope: Scope) {
  const rows = (await targets(ev, scope)).map((r) => ({ ...r, cancelled }));
  await store.upsertEvents(rows);
}

/** Xóa và trả về các dòng đã xóa để có thể hoàn tác. */
export async function removeEvents(ev: CalEvent, scope: Scope): Promise<CalEvent[]> {
  const rows = await targets(ev, scope);
  await store.deleteEvents(rows.map((r) => r.id));
  return rows;
}

/** Kéo thả sang ngày khác: giữ nguyên giờ, chỉ đổi buổi này. */
export async function moveToDate(ev: CalEvent, date: string) {
  const d = draftFromEvent(ev);
  const shift = diffDays(d.date, date);
  d.date = date;
  if (d.endDate) d.endDate = addDays(d.endDate, shift);
  await store.upsertEvents([{ ...ev, ...timesOn(d, date) }]);
}

/** Các ngày (YYYY-MM-DD) mà sự kiện chiếm, dùng để vẽ trên lịch tháng/tuần. */
export function daysOf(e: CalEvent): string[] {
  const s = isoDate(e.start_at);
  if (!e.end_at) return [s];
  let last = isoDate(e.end_at);
  // Sự kiện có giờ kết thúc đúng 0h hôm sau thì không tính sang ngày đó
  if (!e.all_day && isoTime(e.end_at) === "00:00" && last > s) last = addDays(last, -1);
  const out: string[] = [];
  for (let d = s; d <= last && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

export function timeLabel(e: CalEvent): string {
  if (e.all_day) return "Cả ngày";
  const s = isoTime(e.start_at);
  return e.end_at ? `${s}–${isoTime(e.end_at)}` : s;
}

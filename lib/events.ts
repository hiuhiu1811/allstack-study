// Sửa/hủy/xóa sự kiện (kể cả sự kiện lặp: chỉ buổi này / từ buổi này / tất cả). Chạy ở trình duyệt.
// Phần bản nháp nằm ở lib/draft.ts, được xuất lại ở đây để các trang cũ không phải đổi.

import { addDays, diffDays, isoDate, isoTime } from "./dates.ts";
import { draftFromEvent, fields, timesOn } from "./draft.ts";
import { store } from "./store.ts";
import type { Draft } from "./draft.ts";
import type { CalEvent } from "./types.ts";

export { emptyDraft, draftFromParsed, draftFromEvent, previewTimes, rowsFromDraft } from "./draft.ts";
export type { Draft } from "./draft.ts";

export type Scope = "one" | "future" | "all";

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

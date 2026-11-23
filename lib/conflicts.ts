import type { CalEvent } from "./types.ts";

/** Khoảng thời gian của sự kiện tính bằng mili giây. Không có giờ kết thúc thì tính là 1 tiếng. */
function span(e: Pick<CalEvent, "start_at" | "end_at">): [number, number] {
  const s = new Date(e.start_at).getTime();
  const end = e.end_at ? new Date(e.end_at).getTime() : s + 3600_000;
  return [s, Math.max(end, s + 60_000)];
}

/** Sự kiện cả ngày và sự kiện đã hủy không tính trùng. */
function counts(e: Pick<CalEvent, "all_day" | "cancelled">): boolean {
  return !e.all_day && !e.cancelled;
}

/** Trả về tập id các sự kiện bị trùng giờ với ít nhất một sự kiện khác. */
export function conflictIds(events: CalEvent[]): Set<string> {
  const list = events.filter(counts).map((e) => ({ id: e.id, s: span(e) })).sort((a, b) => a.s[0] - b.s[0]);
  const out = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length && list[j].s[0] < list[i].s[1]; j++) {
      out.add(list[i].id);
      out.add(list[j].id);
    }
  }
  return out;
}

/** Các sự kiện trùng giờ với một sự kiện sắp lưu (bỏ qua chính nó). */
export function conflictsWith(
  draft: Pick<CalEvent, "start_at" | "end_at" | "all_day" | "cancelled"> & { id?: string },
  events: CalEvent[],
): CalEvent[] {
  if (!counts(draft)) return [];
  const [a, b] = span(draft);
  return events.filter((e) => e.id !== draft.id && counts(e) && span(e)[0] < b && a < span(e)[1]);
}

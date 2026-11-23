// Xử lý múi giờ cho phần chạy trên máy chủ (máy chủ Vercel chạy giờ UTC, còn người dùng ở giờ Việt Nam).
// Ngày giờ "treo tường" (YYYY-MM-DD + HH:MM) được hiểu theo múi giờ của người dùng, không theo máy.

export const DEFAULT_TZ = "Asia/Ho_Chi_Minh";

interface Parts { y: number; mo: number; d: number; h: number; mi: number; s: number }

function partsOf(ms: number, tz: string): Parts {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { y: o.year, mo: o.month, d: o.day, h: o.hour, mi: o.minute, s: o.second };
}

/** Múi giờ hợp lệ không? (tránh lỗi khi dữ liệu hồ sơ bị sai) */
export function safeTz(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

const p2 = (n: number) => (n < 10 ? "0" + n : String(n));

/** Độ lệch (mili giây) của múi giờ so với UTC tại thời điểm ms. */
function offsetMs(ms: number, tz: string): number {
  const p = partsOf(ms, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/** Ngày YYYY-MM-DD tại múi giờ tz của một thời điểm. */
export function dateIn(ms: number, tz: string): string {
  const p = partsOf(ms, tz);
  return `${p.y}-${p2(p.mo)}-${p2(p.d)}`;
}

/** Giờ HH:MM tại múi giờ tz. */
export function timeIn(ms: number, tz: string): string {
  const p = partsOf(ms, tz);
  return `${p2(p.h)}:${p2(p.mi)}`;
}

export function hourIn(ms: number, tz: string): number {
  return partsOf(ms, tz).h;
}

/** Đổi "ngày + giờ treo tường tại tz" thành mốc ISO (UTC). time = null nghĩa là 0h. */
export function zonedToIso(date: string, time: string | null, tz: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time ? time.split(":").map(Number) : [0, 0];
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let t = wall - offsetMs(wall, tz);
  t = wall - offsetMs(t, tz);
  return new Date(t).toISOString();
}

/** Mốc ISO đầu ngày (0h) tại tz. */
export function startOfDayIso(date: string, tz: string): string {
  return zonedToIso(date, null, tz);
}

/**
 * Một Date mà các hàm getFullYear/getHours... (giờ máy) trả đúng giờ treo tường của người dùng.
 * Dùng làm "bây giờ" cho bộ đọc lịch (lib/parser.ts) khi chạy trên máy chủ.
 */
export function wallClockNow(ms: number, tz: string): Date {
  const p = partsOf(ms, tz);
  return new Date(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
}

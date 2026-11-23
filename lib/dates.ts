// Các hàm ngày giờ dùng chung. Ngày luôn ở dạng chuỗi "YYYY-MM-DD" theo giờ máy người dùng.

export function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** Thứ trong tuần, 0 = Thứ 2 ... 6 = Chủ nhật (tuần Việt Nam bắt đầu từ Thứ 2). */
export function weekdayVN(s: string): number {
  return (parseYmd(s).getDay() + 6) % 7;
}

export function startOfWeek(s: string): string {
  return addDays(s, -weekdayVN(s));
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86400000);
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(min: number): string {
  min = Math.max(0, Math.min(min, 23 * 60 + 59));
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

/** Gộp ngày + giờ thành mốc thời gian ISO (theo múi giờ máy). */
export function toIso(date: string, time: string | null): string {
  const d = parseYmd(date);
  if (time) {
    const [h, m] = time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d.toISOString();
}

export function isoDate(iso: string): string {
  return ymd(new Date(iso));
}

export function isoTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const WEEKDAY_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
export const WEEKDAY_LONG = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];

export function formatVN(s: string): string {
  const d = parseYmd(s);
  return `${WEEKDAY_LONG[weekdayVN(s)]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

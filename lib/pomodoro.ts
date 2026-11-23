// Logic đồng hồ Pomodoro và thống kê. Không phụ thuộc trình duyệt nên kiểm thử được.
// Đếm giờ theo mốc thời gian thật (endAt): chuyển tab hay máy chậm vẫn đúng.

import { addDays, ymd } from "./dates.ts";
import type { StudySession } from "./types.ts";

export type Phase = "focus" | "short" | "long";

export interface PomoConfig {
  focus: number; // phút
  short: number;
  long: number;
  cycles: number; // số phiên học trước khi nghỉ dài
}

export const PRESETS: { label: string; focus: number; short: number }[] = [
  { label: "25/5", focus: 25, short: 5 },
  { label: "50/10", focus: 50, short: 10 },
  { label: "90/15", focus: 90, short: 15 },
];

export const PHASE_LABEL: Record<Phase, string> = { focus: "Học", short: "Nghỉ ngắn", long: "Nghỉ dài" };

export interface TimerState {
  phase: Phase;
  running: boolean;
  endAt: number | null; // mốc kết thúc (ms) khi đang chạy
  leftMs: number; // thời gian còn lại khi đang dừng
  startedAt: number | null; // mốc bắt đầu phiên (ms), null = chưa bắt đầu
  doneFocus: number; // số phiên học đã hoàn thành
}

/** Một phiên học cần ghi vào cơ sở dữ liệu. */
export interface SessionRecord {
  started_at: string;
  minutes: number;
  completed: boolean;
}

export function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, Math.round(v)));
}

export function phaseMs(cfg: PomoConfig, phase: Phase): number {
  const m = phase === "focus" ? cfg.focus : phase === "short" ? cfg.short : cfg.long;
  return Math.max(1, m) * 60000;
}

export function initTimer(cfg: PomoConfig, phase: Phase = "focus", doneFocus = 0): TimerState {
  return { phase, running: false, endAt: null, leftMs: phaseMs(cfg, phase), startedAt: null, doneFocus };
}

export function remaining(t: TimerState, now: number): number {
  return t.running && t.endAt != null ? Math.max(0, t.endAt - now) : t.leftMs;
}

export function startTimer(t: TimerState, now: number): TimerState {
  if (t.running) return t;
  return { ...t, running: true, endAt: now + t.leftMs, startedAt: t.startedAt ?? now };
}

export function pauseTimer(t: TimerState, now: number): TimerState {
  if (!t.running) return t;
  return { ...t, running: false, endAt: null, leftMs: remaining(t, now) };
}

/** Khi đổi số phút lúc phiên chưa bắt đầu thì cập nhật luôn thời gian hiển thị. */
export function syncIdle(t: TimerState, cfg: PomoConfig): TimerState {
  if (t.running || t.startedAt != null) return t;
  return { ...t, leftMs: phaseMs(cfg, t.phase) };
}

/** Số phút đã học trong phiên hiện tại (chỉ tính khi đang ở phiên học). */
function studiedRecord(t: TimerState, cfg: PomoConfig, now: number, completed: boolean): SessionRecord | null {
  if (t.phase !== "focus" || t.startedAt == null) return null;
  const total = phaseMs(cfg, "focus");
  const minutes = completed ? Math.round(total / 60000) : Math.floor(Math.max(0, total - remaining(t, now)) / 60000);
  if (minutes < 1) return null;
  return { started_at: new Date(t.startedAt).toISOString(), minutes, completed };
}

export interface StepResult {
  timer: TimerState;
  record: SessionRecord | null;
  /** true nếu vừa hết giờ tự nhiên (cần phát chuông) */
  rang: boolean;
}

function nextAfter(t: TimerState, cfg: PomoConfig, done: boolean, now: number): TimerState {
  if (t.phase === "focus") {
    const doneFocus = t.doneFocus + (done ? 1 : 0);
    const phase: Phase = done && doneFocus % Math.max(1, cfg.cycles) === 0 ? "long" : "short";
    // Sau phiên học thì nghỉ chạy luôn khi hết giờ tự nhiên; nếu bấm Bỏ qua thì chờ bấm Bắt đầu.
    const next = initTimer(cfg, phase, doneFocus);
    return done ? startTimer(next, now) : next;
  }
  return initTimer(cfg, "focus", t.doneFocus);
}

/** Gọi liên tục: nếu đang chạy và đã quá giờ thì kết thúc phiên và chuyển phiên. */
export function tick(t: TimerState, cfg: PomoConfig, now: number): StepResult {
  if (!t.running || t.endAt == null || now < t.endAt) return { timer: t, record: null, rang: false };
  return { timer: nextAfter(t, cfg, true, now), record: studiedRecord(t, cfg, now, true), rang: true };
}

/** Bấm "Bỏ qua": sang phiên kế tiếp. Phiên học đang dở vẫn ghi số phút đã học (nếu ≥ 1). */
export function skip(t: TimerState, cfg: PomoConfig, now: number): StepResult {
  return { timer: nextAfter(t, cfg, false, now), record: studiedRecord(t, cfg, now, false), rang: false };
}

/** Bấm "Đặt lại": về đầu phiên hiện tại. Phiên học đang dở vẫn ghi số phút đã học. */
export function reset(t: TimerState, cfg: PomoConfig, now: number): StepResult {
  return { timer: initTimer(cfg, t.phase, t.doneFocus), record: studiedRecord(t, cfg, now, false), rang: false };
}

export function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm < 10 ? "0" + mm : mm}:${ss < 10 ? "0" + ss : ss}`;
}

// ---------------- Thống kê ----------------

const dayOf = (s: StudySession) => ymd(new Date(s.started_at));

export function minutesOnDay(sessions: StudySession[], day: string): number {
  return sessions.filter((s) => dayOf(s) === day).reduce((a, s) => a + s.minutes, 0);
}

/** n ngày gần nhất tính tới `today`, cũ đến mới. */
export function lastDays(sessions: StudySession[], today: string, n = 7): { date: string; minutes: number }[] {
  const out: { date: string; minutes: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    out.push({ date, minutes: minutesOnDay(sessions, date) });
  }
  return out;
}

/** Tổng phút theo môn từ ngày `fromDay` trở đi, môn học nhiều nhất đứng đầu. */
export function bySubject(sessions: StudySession[], fromDay: string): { subject: string; minutes: number }[] {
  const map = new Map<string, number>();
  for (const s of sessions) {
    if (dayOf(s) < fromDay) continue;
    const key = s.subject.trim() || "Chưa chọn môn";
    map.set(key, (map.get(key) ?? 0) + s.minutes);
  }
  return [...map.entries()].map(([subject, minutes]) => ({ subject, minutes })).sort((a, b) => b.minutes - a.minutes);
}

/** Số ngày liên tục có học. Hôm nay chưa học thì vẫn tính chuỗi tới hôm qua. */
export function streak(sessions: StudySession[], today: string): number {
  const days = new Set(sessions.map(dayOf));
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} phút`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} giờ ${m} phút` : `${h} giờ`;
}

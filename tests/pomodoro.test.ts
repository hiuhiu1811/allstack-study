// Thử logic đếm giờ Pomodoro, thống kê, chuỗi ngày. Chạy: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initTimer, startTimer, pauseTimer, tick, skip, reset, remaining, syncIdle, formatClock,
  lastDays, bySubject, streak, minutesOnDay, formatMinutes, clampInt, type PomoConfig,
} from "../lib/pomodoro.ts";
import { toIso } from "../lib/dates.ts";
import { validateMedia, safeFileName } from "../lib/media.ts";
import type { StudySession } from "../lib/types.ts";

const CFG: PomoConfig = { focus: 25, short: 5, long: 15, cycles: 4 };
const T0 = 1_000_000_000_000;
const MIN = 60000;

test("đếm theo mốc thời gian thật, tạm dừng giữ nguyên số còn lại", () => {
  let t = startTimer(initTimer(CFG), T0);
  assert.equal(remaining(t, T0 + 10 * MIN), 15 * MIN);
  t = pauseTimer(t, T0 + 10 * MIN);
  assert.equal(remaining(t, T0 + 99 * MIN), 15 * MIN); // dừng thì không trôi
  t = startTimer(t, T0 + 20 * MIN);
  assert.equal(remaining(t, T0 + 25 * MIN), 10 * MIN);
});

test("phiên 1 phút: hết giờ thì ghi 1 phút và tự chạy nghỉ ngắn", () => {
  const cfg = { ...CFG, focus: 1 };
  const t = startTimer(initTimer(cfg), T0);
  assert.equal(tick(t, cfg, T0 + 59000).rang, false);
  const r = tick(t, cfg, T0 + MIN);
  assert.equal(r.rang, true);
  assert.equal(r.record?.minutes, 1);
  assert.equal(r.record?.completed, true);
  assert.equal(r.timer.phase, "short");
  assert.equal(r.timer.running, true);
  assert.equal(r.timer.doneFocus, 1);
});

test("máy ngủ lâu rồi mới tick vẫn chuyển phiên đúng, chỉ ghi một phiên", () => {
  const t = startTimer(initTimer(CFG), T0);
  const r = tick(t, CFG, T0 + 500 * MIN);
  assert.equal(r.record?.minutes, 25);
  assert.equal(r.timer.phase, "short");
});

test("nghỉ dài sau đủ số phiên học, hết nghỉ thì về học và chờ bấm Bắt đầu", () => {
  let t = initTimer(CFG, "focus", 3);
  t = startTimer(t, T0);
  const r = tick(t, CFG, T0 + 25 * MIN);
  assert.equal(r.timer.phase, "long");
  const b = tick(r.timer, CFG, T0 + 25 * MIN + 15 * MIN);
  assert.equal(b.record, null); // không ghi phiên nghỉ
  assert.equal(b.timer.phase, "focus");
  assert.equal(b.timer.running, false);
});

test("bỏ giữa chừng: ghi số phút đã học nếu ≥ 1, dưới 1 phút thì không ghi", () => {
  const t = startTimer(initTimer(CFG), T0);
  const a = skip(t, CFG, T0 + 7 * MIN + 30000);
  assert.equal(a.record?.minutes, 7);
  assert.equal(a.record?.completed, false);
  assert.equal(a.timer.phase, "short");
  assert.equal(a.timer.running, false);
  assert.equal(a.timer.doneFocus, 0); // phiên dở không tính là hoàn thành
  assert.equal(skip(t, CFG, T0 + 30000).record, null);
  const r = reset(t, CFG, T0 + 3 * MIN);
  assert.equal(r.record?.minutes, 3);
  assert.equal(r.timer.leftMs, 25 * MIN);
  assert.equal(r.timer.running, false);
});

test("tạm dừng rồi đặt lại vẫn ghi đúng số phút; bỏ qua phiên nghỉ không ghi gì", () => {
  let t = startTimer(initTimer(CFG), T0);
  t = pauseTimer(t, T0 + 5 * MIN);
  assert.equal(reset(t, CFG, T0 + 60 * MIN).record?.minutes, 5);
  const brk = initTimer(CFG, "short");
  assert.equal(skip(startTimer(brk, T0), CFG, T0 + 2 * MIN).record, null);
});

test("đổi số phút khi chưa bắt đầu thì cập nhật luôn", () => {
  const t = syncIdle(initTimer(CFG), { ...CFG, focus: 50 });
  assert.equal(t.leftMs, 50 * MIN);
  const run = startTimer(initTimer(CFG), T0);
  assert.equal(syncIdle(run, { ...CFG, focus: 50 }).leftMs, 25 * MIN);
});

test("hiển thị đồng hồ và số", () => {
  assert.equal(formatClock(25 * MIN), "25:00");
  assert.equal(formatClock(59001), "01:00");
  assert.equal(formatClock(0), "00:00");
  assert.equal(clampInt(0, 1, 180), 1);
  assert.equal(clampInt(NaN, 1, 180), 1);
  assert.equal(clampInt(999, 1, 180), 180);
  assert.equal(formatMinutes(45), "45 phút");
  assert.equal(formatMinutes(125), "2 giờ 5 phút");
});

// ---- thống kê ----
const TODAY = "2026-11-23";
const mk = (date: string, minutes: number, subject = "Toán"): StudySession => ({
  id: date + minutes + subject, subject, started_at: toIso(date, "09:00"), minutes, completed: true,
});

test("giờ học hôm nay và 7 ngày gần nhất", () => {
  const s = [mk("2026-11-23", 25), mk("2026-11-23", 30, "Anh"), mk("2026-11-20", 50), mk("2026-11-01", 99)];
  assert.equal(minutesOnDay(s, TODAY), 55);
  const days = lastDays(s, TODAY);
  assert.equal(days.length, 7);
  assert.equal(days[0].date, "2026-11-17");
  assert.equal(days[6].minutes, 55);
  assert.equal(days[3].minutes, 50); // 20/11
});

test("theo môn trong tuần, môn nhiều nhất đứng đầu", () => {
  const s = [mk("2026-11-23", 25), mk("2026-11-22", 60, "Anh"), mk("2026-11-10", 500), mk("2026-11-23", 10, "")];
  const r = bySubject(s, "2026-11-23");
  assert.deepEqual(r, [{ subject: "Toán", minutes: 25 }, { subject: "Chưa chọn môn", minutes: 10 }]);
  assert.equal(bySubject(s, "2026-11-17")[0].subject, "Anh");
});

test("chuỗi ngày liên tục", () => {
  assert.equal(streak([], TODAY), 0);
  assert.equal(streak([mk("2026-11-23", 5)], TODAY), 1);
  assert.equal(streak([mk("2026-11-23", 5), mk("2026-11-22", 5), mk("2026-11-21", 5)], TODAY), 3);
  // hôm nay chưa học: chuỗi vẫn còn tới hôm qua
  assert.equal(streak([mk("2026-11-22", 5), mk("2026-11-21", 5)], TODAY), 2);
  // đứt chuỗi: hôm qua không học
  assert.equal(streak([mk("2026-11-21", 5), mk("2026-11-20", 5)], TODAY), 0);
  // ngày bị hở giữa chừng
  assert.equal(streak([mk("2026-11-23", 5), mk("2026-11-21", 5)], TODAY), 1);
  // nhiều phiên cùng ngày chỉ tính 1 ngày
  assert.equal(streak([mk("2026-11-23", 5), mk("2026-11-23", 5)], TODAY), 1);
});

// ---- thư viện âm thanh ----
test("không cho lưu khi thiếu nguồn hoặc giấy phép", () => {
  const ok = { title: "Tiếng mưa", source: "pixabay.com/ten-tac-gia", license: "Pixabay License" };
  assert.equal(validateMedia(ok, true), null);
  assert.match(validateMedia({ ...ok, license: "  " }, true)!, /Giấy phép/);
  assert.match(validateMedia({ ...ok, source: "" }, true)!, /Nguồn/);
  assert.match(validateMedia({ ...ok, title: "" }, true)!, /tên/);
  assert.match(validateMedia(ok, false)!, /file/);
});

test("tên file an toàn", () => {
  assert.equal(safeFileName("Tiếng Mưa Rơi (1).MP3"), "tieng-mua-roi-1.mp3");
  assert.equal(safeFileName("???.png"), "file.png");
});

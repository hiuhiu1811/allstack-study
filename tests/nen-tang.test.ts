// Thử phần nền tảng: múi giờ, nhắc việc, lệnh bot, AI dự phòng. Chạy: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAiResult } from "../lib/ai-fallback.ts";
import { agendaText, digestDue, dueReminders, eventsOnDate, reminderText } from "../lib/remind.ts";
import { draftFromParsed, rowsFromDraft } from "../lib/draft.ts";
import { draftSummary, editUrl, parseCallback, parseCommand } from "../lib/bot.ts";
import { parseEvent } from "../lib/parser.ts";
import { dateIn, hourIn, safeTz, startOfDayIso, timeIn, wallClockNow, zonedToIso } from "../lib/tz.ts";

const VN = "Asia/Ho_Chi_Minh";

test("múi giờ: đổi giờ treo tường Việt Nam sang UTC và ngược lại", () => {
  assert.equal(zonedToIso("2026-11-24", "08:00", VN), "2026-11-24T01:00:00.000Z");
  assert.equal(zonedToIso("2026-11-24", null, VN), "2026-11-23T17:00:00.000Z");
  const t = Date.parse("2026-11-23T18:30:00Z"); // 01:30 sáng 24/11 giờ VN
  assert.equal(dateIn(t, VN), "2026-11-24");
  assert.equal(timeIn(t, VN), "01:30");
  assert.equal(hourIn(t, VN), 1);
  assert.equal(startOfDayIso("2026-11-24", VN), "2026-11-23T17:00:00.000Z");
});

test("múi giờ: có giờ mùa hè vẫn đúng, múi giờ sai thì quay về mặc định", () => {
  assert.equal(zonedToIso("2026-07-01", "12:00", "America/New_York"), "2026-07-01T16:00:00.000Z");
  assert.equal(zonedToIso("2026-01-01", "12:00", "America/New_York"), "2026-01-01T17:00:00.000Z");
  assert.equal(safeTz("Khong/Co"), VN);
  assert.equal(safeTz(null), VN);
});

test("bộ đọc lịch chạy đúng giờ Việt Nam dù máy chủ ở UTC", () => {
  // 02:00 sáng thứ 3 24/11 giờ VN = 19:00 UTC thứ 2 23/11
  const now = Date.parse("2026-11-23T19:00:00Z");
  const p = parseEvent("mai 8h học nhóm Toán phòng 204", wallClockNow(now, VN));
  assert.equal(p.date, "2026-11-25");
  assert.equal(p.start, "08:00");
  const rows = rowsFromDraft(draftFromParsed(p), VN);
  assert.equal(rows[0].start_at, "2026-11-25T01:00:00.000Z"); // 8h VN
  assert.equal(rows[0].location, "phòng 204");
});

const ev = (over: object) => ({
  id: "e1", title: "Học nhóm", start_at: "2026-11-24T01:00:00.000Z", end_at: null, all_day: false,
  location: "", cancelled: false, remind_minutes: 15 as number | null, ...over,
});

test("nhắc việc: chỉ nhắc khi đến giờ nhắc và chưa bắt đầu", () => {
  const start = Date.parse("2026-11-24T01:00:00Z");
  const e = ev({});
  assert.equal(dueReminders([e], start - 20 * 60_000).length, 0); // còn 20 phút: chưa tới
  assert.equal(dueReminders([e], start - 15 * 60_000).length, 1); // đúng 15 phút
  assert.equal(dueReminders([e], start - 3 * 60_000).length, 1); // lỡ lượt quét vẫn nhắc bù
  assert.equal(dueReminders([e], start).length, 0); // đã bắt đầu
  assert.equal(dueReminders([ev({ cancelled: true })], start - 10 * 60_000).length, 0);
  assert.equal(dueReminders([ev({ remind_minutes: null })], start - 10 * 60_000).length, 0);
});

test("nội dung tin nhắc", () => {
  const start = Date.parse("2026-11-24T01:00:00Z");
  const t = reminderText(ev({ location: "phòng 204" }), VN, start - 15 * 60_000);
  assert.match(t, /15 phút nữa\): Học nhóm/);
  assert.match(t, /Lúc 08:00/);
  assert.match(t, /phòng 204/);
});

test("email tóm tắt: đúng giờ đã chọn theo múi giờ, cho phép gửi bù 2 tiếng, tắt thì không gửi", () => {
  const prof = { digest_enabled: true, digest_hour: 7, timezone: VN };
  assert.equal(digestDue(prof, Date.parse("2026-11-23T23:55:00Z")).due, false); // 6:55 VN
  const at7 = digestDue(prof, Date.parse("2026-11-24T00:02:00Z")); // 7:02 VN
  assert.deepEqual(at7, { due: true, date: "2026-11-24" });
  assert.equal(digestDue(prof, Date.parse("2026-11-24T02:30:00Z")).due, true); // 9:30 VN
  assert.equal(digestDue(prof, Date.parse("2026-11-24T04:00:00Z")).due, false); // 11:00 VN
  assert.equal(digestDue({ ...prof, digest_enabled: false }, Date.parse("2026-11-24T00:02:00Z")).due, false);
});

test("lịch trong ngày và danh sách /tuan", () => {
  const list = [
    ev({ id: "a", title: "Họp", start_at: "2026-11-24T07:00:00.000Z" }), // 14h
    ev({ id: "b", title: "Học", start_at: "2026-11-24T01:00:00.000Z", end_at: "2026-11-24T03:00:00.000Z" }), // 8h-10h
    ev({ id: "c", title: "Hủy", start_at: "2026-11-24T02:00:00.000Z", cancelled: true }),
    ev({ id: "d", title: "Mai", start_at: "2026-11-25T01:00:00.000Z" }),
  ];
  assert.deepEqual(eventsOnDate(list, "2026-11-24", VN).map((e) => e.id), ["b", "a"]);
  const text = agendaText("2026-11-24", 2, list, VN, new Set(["a"]));
  assert.match(text, /Thứ 3, 24\/11\/2026\n• 08:00–10:00 Học\n• 14:00 Họp ⚠ trùng giờ/);
  assert.match(text, /Thứ 4, 25\/11\/2026\n• 08:00 Mai/);
  assert.equal(agendaText("2026-12-01", 1, list, VN), "");
});

test("lệnh và nút bấm của bot", () => {
  assert.deepEqual(parseCommand("/homnay"), { cmd: "homnay", arg: "" });
  assert.deepEqual(parseCommand("/tuan@AllStackBot"), { cmd: "tuan", arg: "" });
  assert.deepEqual(parseCommand("/start abc_123"), { cmd: "start", arg: "abc_123" });
  assert.deepEqual(parseCommand("/lung_tung"), { cmd: "khac", arg: "" });
  assert.equal(parseCommand("mai 8h học nhóm"), null);
  const id = "123e4567-e89b-12d3-a456-426614174000";
  assert.deepEqual(parseCallback(`s:${id}`), { act: "save", id });
  assert.deepEqual(parseCallback(`x:${id}`), { act: "drop", id });
  assert.deepEqual(parseCallback(`m:${id}`), { act: "commit", id });
  assert.deepEqual(parseCallback(`t:${id}:3`), { act: "toggle", id, index: 3 });
  assert.equal(parseCallback("s:khong-phai-uuid"), null);
  assert.equal(parseCallback(`z:${id}`), null);
  assert.ok(`s:${id}`.length <= 64 && `t:${id}:19`.length <= 64);
});

test("tóm tắt bản nháp và đường dẫn sửa trên web", () => {
  const p = parseEvent("mai 8h học nhóm Toán phòng 204, nhắc trước 1 tiếng", new Date(2026, 10, 23, 9, 0));
  const s = draftSummary(draftFromParsed(p));
  assert.match(s, /Học nhóm Toán/);
  assert.match(s, /08:00/);
  assert.match(s, /phòng 204/);
  assert.match(s, /Nhắc trước 1 tiếng/);
  assert.equal(editUrl("https://x.vn", "mai 8h học & chơi"), "https://x.vn/nhap-lich?q=mai%208h%20h%E1%BB%8Dc%20%26%20ch%C6%A1i");
});

test("AI dự phòng: chỉ nhận ngày giờ hợp lệ", () => {
  const base = parseEvent("họp nhóm abc", new Date(2026, 10, 23, 9, 0));
  assert.equal(base.foundDate, false);
  const ok = applyAiResult(base, { date: "2026-12-02", start: "14:30", end: "16:00" });
  assert.equal(ok?.date, "2026-12-02");
  assert.equal(ok?.start, "14:30");
  assert.equal(ok?.end, "16:00");
  assert.equal(ok?.foundDate, true);
  assert.equal(ok?.confident, false);
  assert.equal(ok?.title, base.title);
  assert.equal(applyAiResult(base, { date: "mai", start: "25:00" }), null);
  assert.equal(applyAiResult(base, null), null);
  assert.equal(applyAiResult(base, "rác"), null);
  assert.equal(applyAiResult(base, { date: "2026-02-30x" }), null);
});

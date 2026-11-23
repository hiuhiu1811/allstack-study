// Bộ câu thử cho bộ đọc lịch. Chạy: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEvent, findMilestones } from "../lib/parser.ts";

// Mốc "hôm nay" cố định: Thứ 2, 23/11/2026, 9h sáng
const NOW = new Date(2026, 10, 23, 9, 0);

type Want = Partial<ReturnType<typeof parseEvent>>;
const cases: [string, Want][] = [
  ["Thứ 6 14h họp nhóm KTL ở thư viện, mang laptop", { date: "2026-11-27", start: "14:00", kind: "hop", location: "thư viện", title: "Họp nhóm KTL", note: "mang laptop", confident: true }],
  ["Thứ 6 tuần này 14h họp nhóm ở thư viện, nhớ mang laptop", { date: "2026-11-27", start: "14:00", location: "thư viện", title: "Họp nhóm", note: "nhớ mang laptop" }],
  ["mai 8h học nhóm Toán phòng 204", { date: "2026-11-24", start: "08:00", kind: "hoc", location: "phòng 204", title: "Học nhóm Toán" }],
  ["Sáng mai 8h học nhóm Toán ở phòng 204", { date: "2026-11-24", start: "08:00", location: "phòng 204", title: "Học nhóm Toán" }],
  ["2h chiều nay gặp thầy hướng dẫn", { date: "2026-11-23", start: "14:00", kind: "hop", title: "Gặp thầy hướng dẫn" }],
  ["tối nay 7g30 ôn IELTS", { date: "2026-11-23", start: "19:30", kind: "hoc", title: "Ôn IELTS" }],
  ["25/11 nộp báo cáo thực tập", { date: "2026-11-25", start: null, kind: "han", title: "Nộp báo cáo thực tập", confident: true }],
  ["deadline tiểu luận Marketing 30/11 23h59", { date: "2026-11-30", start: "23:59", kind: "han" }],
  ["từ 14h đến 16h thứ 5 họp CLB tại hội trường A", { date: "2026-11-26", start: "14:00", end: "16:00", location: "hội trường A", title: "Họp CLB" }],
  ["14h-15h30 mốt seminar khoa", { date: "2026-11-25", start: "14:00", end: "15:30", kind: "hoc" }],
  ["9 giờ sáng CN chạy bộ công viên", { date: "2026-11-29", start: "09:00", kind: "cn", title: "Chạy bộ công viên" }],
  ["thứ 2 tuần sau 10h phỏng vấn", { date: "2026-11-30", start: "10:00" }],
  ["Học tiếng Anh mỗi thứ 3 lúc 19h", { date: "2026-11-24", start: "19:00", repeat: "weekly", kind: "hoc", title: "Học tiếng Anh" }],
  ["chạy bộ hàng ngày 6h sáng", { date: "2026-11-23", start: "06:00", repeat: "daily" }],
  ["thứ 6 14h họp nhóm nhắc trước 1 tiếng", { remindMinutes: 60, title: "Họp nhóm" }],
  ["mai 9h thi cuối kỳ Kinh tế lượng, nhắc trước 1 ngày", { date: "2026-11-24", kind: "han", remindMinutes: 1440, title: "Thi cuối kỳ Kinh tế lượng" }],
  ["3h họp nhóm", { start: "15:00", date: "2026-11-23", foundDate: false, confident: false }],
  ["mai 14h học trong 2 tiếng", { start: "14:00", end: "16:00" }],
  ["ngày 28 đi khám răng 15h", { date: "2026-11-28", start: "15:00", title: "Đi khám răng" }],
  ["ngày 5 đóng tiền nhà", { date: "2026-12-05" }],
  ["20/11 họp lớp 18h", { date: "2027-11-20" }],
  ["cuối tuần đi Đà Lạt", { date: "2026-11-28", title: "Đi Đà Lạt" }],
  ["từ 1/12 đến 5/12 thực tập ở công ty ABC", { date: "2026-12-01", endDate: "2026-12-05", location: "công ty ABC", title: "Thực tập", confident: true }],
  ["T5 8h30 học Kinh tế vi mô", { date: "2026-11-26", start: "08:30" }],
  ["chiều thứ 4 họp nhóm", { date: "2026-11-25", start: "14:00" }],
  ["chiều thứ 4 3h họp nhóm", { date: "2026-11-25", start: "15:00" }],
  ["8-10h sáng thứ 7 học bơi", { date: "2026-11-28", start: "08:00", end: "10:00", title: "Học bơi" }],
  ["Thứ 6 tuần này 14h họp, thứ 2 tuần sau 9h nộp bài", { confident: false }],
  ["họp nhóm", { confident: false, foundDate: false, title: "Họp nhóm" }],
  ["14:30 25-11-2026 bảo vệ đề cương", { date: "2026-11-25", start: "14:30", title: "Bảo vệ đề cương" }],
];

for (const [input, want] of cases) {
  test(input, () => {
    const got = parseEvent(input, NOW);
    for (const [k, v] of Object.entries(want)) {
      assert.deepEqual((got as unknown as Record<string, unknown>)[k], v, `${k}: ${JSON.stringify(got)}`);
    }
  });
}

test("biên bản họp: tìm các mốc", () => {
  const text = `Biên bản họp nhóm 20/11
- An làm phần tổng quan, nộp trước 25/11.
- Bình chạy mô hình, xong trước thứ 6.
- Họp lại thứ 2 tuần sau 14h ở thư viện.
Kết thúc lúc 16h.`;
  const ms = findMilestones(text, NOW);
  assert.ok(ms.length >= 3, JSON.stringify(ms.map((m) => m.title)));
});

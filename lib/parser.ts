// Bộ đọc lịch theo mẫu (không dùng AI).
// Nhận một câu tiếng Việt như "Thứ 6 14h họp nhóm KTL ở thư viện, mang laptop"
// và đọc ra ngày, giờ, loại việc, địa điểm, tiêu đề, ghi chú.
// Cách làm: tìm từng "mảnh" (giờ, ngày, nhắc, lặp, địa điểm...), cắt mảnh đó khỏi câu,
// phần chữ còn lại thành tiêu đề và ghi chú.

import { addDays, fromMinutes, startOfWeek, toMinutes, weekdayVN, ymd } from "./dates.ts";

export type Kind = "hop" | "hoc" | "han" | "cn";
export type Repeat = "none" | "daily" | "weekly";

export interface Parsed {
  title: string;
  date: string; // YYYY-MM-DD
  endDate: string | null; // khi việc kéo dài nhiều ngày
  start: string | null; // HH:MM
  end: string | null;
  location: string;
  note: string;
  kind: Kind;
  remindMinutes: number | null;
  repeat: Repeat;
  /** true khi bộ đọc chắc chắn; false thì giao diện nhắc người dùng kiểm tra kỹ. */
  confident: boolean;
  /** Bộ đọc có tìm thấy ngày nào trong câu không. */
  foundDate: boolean;
}

const L = "[\\p{L}\\p{N}]";
const B = `(?<!${L})`; // đầu từ
const E = `(?!${L})`; // cuối từ

const PERIOD = "sáng|trưa|chiều|tối|đêm";
const PERIOD_DEFAULT: Record<string, string> = { "sáng": "08:00", "trưa": "12:00", "chiều": "14:00", "tối": "19:00", "đêm": "21:00" };

const WD_WORDS: Record<string, number> = {
  "2": 0, "hai": 0, "3": 1, "ba": 1, "4": 2, "tư": 2, "bốn": 2, "5": 3, "năm": 3,
  "6": 4, "sáu": 4, "7": 5, "bảy": 5, "bẩy": 5,
};
const WEEKDAY = "thứ\\s*(?:[2-7]|hai|ba|tư|bốn|năm|sáu|bảy|bẩy)|t[2-7]|chủ\\s*nhật|cn";

function weekdayIndex(word: string): number {
  const w = word.toLowerCase().replace(/\s+/g, " ").trim();
  if (/^(chủ ?nhật|cn)$/.test(w)) return 6;
  const m = w.match(/^(?:thứ ?|t)(.+)$/);
  return m ? WD_WORDS[m[1].trim()] ?? 0 : 0;
}

/** Áp buổi (sáng/chiều...) vào giờ. */
function applyPeriod(h: number, period: string | undefined): number {
  if (!period) return h;
  const p = period.toLowerCase();
  if ((p === "chiều" || p === "tối" || p === "đêm") && h < 12) return h + 12;
  if (p === "trưa" && h < 5) return h + 12;
  if (p === "sáng" && h === 12) return 0;
  return h;
}

/** Không nói buổi: 1h đến 6h thường là buổi chiều ("3h họp" = 15:00). */
function guessHour(h: number): number {
  return h >= 1 && h <= 6 ? h + 12 : h;
}

class Cutter {
  rest: string;
  constructor(rest: string) {
    this.rest = rest;
  }
  /** Tìm mẫu đầu tiên, gọi fn, rồi xóa mảnh đó khỏi câu. */
  take(re: RegExp, fn: (m: RegExpExecArray) => boolean | void): boolean {
    const m = re.exec(this.rest);
    if (!m) return false;
    if (fn(m) === false) return false;
    this.rest = this.rest.slice(0, m.index) + " " + this.rest.slice(m.index + m[0].length);
    return true;
  }
  takeAll(re: RegExp, fn: (m: RegExpExecArray) => void) {
    while (this.take(re, fn)) {
      /* lặp đến khi hết */
    }
  }
}

const TIME_CORE = `(\\d{1,2})\\s*(?:h|g|giờ|:)\\s*(\\d{1,2})?(?:\\s*(?:p|ph|phút))?(?:\\s*(rưỡi))?`;

function readTime(hStr: string, mStr: string | undefined, half: string | undefined): [number, number] | null {
  const h = Number(hStr);
  const m = half ? 30 : mStr ? Number(mStr) : 0;
  if (h > 24 || m > 59) return null;
  return [h === 24 ? 0 : h, m];
}

export function parseEvent(input: string, now: Date = new Date()): Parsed {
  const today = ymd(now);
  const c = new Cutter(" " + input.normalize("NFC").replace(/\s+/g, " ") + " ");
  const r: Parsed = {
    title: "", date: today, endDate: null, start: null, end: null, location: "", note: "",
    kind: "cn", remindMinutes: null, repeat: "none", confident: false, foundDate: false,
  };
  const dates: string[] = [];
  let periodWord: string | undefined;
  let explicitPeriod = false;

  // 1. Nhắc trước: "nhắc trước 1 tiếng", "nhắc tôi trước 30 phút", "nhắc trước 1 ngày"
  c.take(new RegExp(`${B}nhắc(?:\\s+(?:tôi|mình|em))?(?:\\s+trước)?\\s+(\\d+)\\s*(phút|p|tiếng|giờ|h|ngày)(?:\\s+trước)?${E}`, "iu"), (m) => {
    const n = Number(m[1]);
    const u = m[2].toLowerCase();
    r.remindMinutes = u === "ngày" ? n * 1440 : u === "phút" || u === "p" ? n : n * 60;
  });

  // 2. Lặp lại: "hàng ngày", "mỗi tuần", "mỗi thứ 3" (giữ "thứ 3" lại để đọc ngày)
  c.take(new RegExp(`${B}(?:mỗi|hàng|hằng)\\s+(ngày|tuần)${E}`, "iu"), (m) => {
    r.repeat = m[1].toLowerCase() === "ngày" ? "daily" : "weekly";
  });
  c.take(new RegExp(`${B}(?:mỗi|các|hàng)\\s+(?=(?:${WEEKDAY})${E})`, "iu"), () => {
    r.repeat = "weekly";
  });

  // 3. Khoảng giờ: "từ 14h đến 16h", "14h-16h", "8-10h sáng", "14:00 - 15:30"
  c.take(
    new RegExp(
      `${B}(?:từ\\s+)?(\\d{1,2})(?:\\s*(?:h|g|giờ|:)\\s*(\\d{1,2})?)?\\s*(?:-|–|đến|tới)\\s*${TIME_CORE}(?:\\s+(${PERIOD}))?${E}`,
      "iu",
    ),
    (m) => {
      const a = readTime(m[1], m[2], undefined);
      const b = readTime(m[3], m[4], m[5]);
      if (!a || !b) return false;
      // "8-10" không có chữ h nào thì không phải giờ
      if (!/h|g|giờ|:/i.test(m[0])) return false;
      const period = m[6];
      let ha = a[0], hb = b[0];
      if (period) {
        explicitPeriod = true;
        hb = applyPeriod(hb, period);
        ha = applyPeriod(ha, period);
        if (ha > hb) ha -= 12;
      } else {
        ha = guessHour(ha);
        hb = guessHour(hb);
        if (hb < ha && hb + 12 <= 23) hb += 12;
      }
      r.start = fromMinutes(ha * 60 + a[1]);
      r.end = fromMinutes(hb * 60 + b[1]);
    },
  );

  // 4. Giờ đơn: "14h", "14h30", "14:30", "2h chiều", "9 giờ sáng", "7g tối", "lúc 8h"
  if (!r.start) {
    c.take(new RegExp(`${B}(?:lúc|vào lúc|vào)?\\s*${TIME_CORE}(?:\\s+(${PERIOD})(?!\\s+nay))?${E}`, "iu"), (m) => {
      const t = readTime(m[1], m[2], m[3]);
      if (!t) return false;
      let h = t[0];
      if (m[4]) {
        explicitPeriod = true;
        periodWord = m[4];
        h = applyPeriod(h, m[4]);
      }
      r.start = fromMinutes(h * 60 + t[1]);
    });
  }

  // 5. Thời lượng: "trong 2 tiếng", "trong 90 phút", "1 tiếng rưỡi"
  c.take(new RegExp(`${B}(?:trong\\s+)?(\\d+(?:[.,]\\d+)?)\\s*(tiếng|giờ|phút|p)(?:\\s+(rưỡi))?${E}`, "iu"), (m) => {
    if (!r.start || r.end) return false;
    let mins = parseFloat(m[1].replace(",", "."));
    const u = m[2].toLowerCase();
    if (u === "tiếng" || u === "giờ") mins = mins * 60 + (m[3] ? 30 : 0);
    r.end = fromMinutes(toMinutes(r.start) + Math.round(mins));
  });

  // 6. Ngày
  const addDate = (d: string) => dates.push(d);
  const explicitDate = (dd: string, mm: string, yy?: string): string | null => {
    const d = Number(dd), mo = Number(mm);
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    let y = yy ? Number(yy) : now.getFullYear();
    if (yy && yy.length === 2) y += 2000;
    let s = ymd(new Date(y, mo - 1, d));
    if (!yy && s < today) s = ymd(new Date(y + 1, mo - 1, d));
    return s;
  };
  const DATE = `(?:ngày\\s+)?(\\d{1,2})\\s*[/-]\\s*(\\d{1,2})(?:\\s*[/-]\\s*(\\d{2,4}))?`;

  // 6a. Khoảng ngày: "từ 25/11 đến 28/11", "25/11 - 28/11"
  c.take(new RegExp(`${B}(?:từ\\s+)?${DATE}\\s*(?:-|–|đến|tới)\\s*${DATE}${E}`, "iu"), (m) => {
    const a = explicitDate(m[1], m[2], m[3]);
    const b = explicitDate(m[4], m[5], m[6]);
    if (!a || !b) return false;
    addDate(a);
    r.endDate = b >= a ? b : null;
  });
  // 6b. Ngày cụ thể: "25/11", "25-11-2026", "ngày 25/11"
  c.takeAll(new RegExp(`${B}${DATE}${E}`, "iu"), (m) => {
    const d = explicitDate(m[1], m[2], m[3]);
    if (d) addDate(d);
  });
  // 6c. "ngày 25" (không có tháng)
  c.takeAll(new RegExp(`${B}ngày\\s+(\\d{1,2})${E}`, "iu"), (m) => {
    const d = Number(m[1]);
    if (d < 1 || d > 31) return;
    let s = ymd(new Date(now.getFullYear(), now.getMonth(), d));
    if (s < today) s = ymd(new Date(now.getFullYear(), now.getMonth() + 1, d));
    addDate(s);
  });
  // 6d. Buổi + nay: "tối nay", "sáng nay"
  c.take(new RegExp(`${B}(${PERIOD})\\s+nay${E}`, "iu"), (m) => {
    addDate(today);
    if (!periodWord) periodWord = m[1];
  });
  // 6e. Ngày tương đối
  c.takeAll(new RegExp(`${B}(hôm\\s+nay|bữa\\s+nay|nay|ngày\\s+mai|mai|ngày\\s+mốt|ngày\\s+kia|mốt|kia)${E}`, "iu"), (m) => {
    const w = m[1].toLowerCase().replace(/\s+/g, " ");
    if (w === "kia") return; // "kia" một mình thường không phải ngày
    const off = /nay/.test(w) ? 0 : /mai/.test(w) ? 1 : 2;
    addDate(addDays(today, off));
  });
  // 6f. Thứ trong tuần: "thứ 6", "T6", "CN", "thứ 6 tuần này", "thứ 2 tuần sau"
  c.takeAll(new RegExp(`${B}(${WEEKDAY})(?:\\s+(tuần\\s+này|tuần\\s+sau|tuần\\s+tới|tuần\\s+trước))?${E}`, "iu"), (m) => {
    const wd = weekdayIndex(m[1]);
    const which = m[2]?.toLowerCase().replace(/\s+/g, " ");
    const monday = startOfWeek(today);
    let d: string;
    if (which === "tuần này") d = addDays(monday, wd);
    else if (which === "tuần sau" || which === "tuần tới") d = addDays(monday, 7 + wd);
    else if (which === "tuần trước") d = addDays(monday, wd - 7);
    else {
      const diff = (wd - weekdayVN(today) + 7) % 7;
      d = addDays(today, diff);
    }
    addDate(d);
  });
  // 6g. "cuối tuần" = Thứ 7; "tuần sau" một mình = Thứ 2 tuần sau
  c.take(new RegExp(`${B}cuối\\s+tuần(?:\\s+(này|sau|tới))?${E}`, "iu"), (m) => {
    const monday = startOfWeek(today);
    const next = m[1] && m[1].toLowerCase() !== "này";
    addDate(addDays(monday, (next ? 7 : 0) + 5));
  });
  c.take(new RegExp(`${B}(tuần\\s+sau|tuần\\s+tới)${E}`, "iu"), () => {
    addDate(addDays(startOfWeek(today), 7));
  });

  // 7. Buổi đứng riêng: "sáng mai 8h", "chiều thứ 5"
  c.take(new RegExp(`${B}(?:buổi\\s+)?(${PERIOD})${E}`, "iu"), (m) => {
    if (!periodWord) periodWord = m[1];
  });
  if (periodWord && !explicitPeriod) {
    if (r.start) {
      const h = applyPeriod(Math.floor(toMinutes(r.start) / 60), periodWord);
      const shift = h * 60 + (toMinutes(r.start) % 60) - toMinutes(r.start);
      r.start = fromMinutes(toMinutes(r.start) + shift);
      if (r.end) r.end = fromMinutes(toMinutes(r.end) + shift);
    } else {
      r.start = PERIOD_DEFAULT[periodWord.toLowerCase()];
    }
  } else if (r.start && !explicitPeriod) {
    // Giờ không nói buổi: 1h-6h hiểu là chiều
    const sm = toMinutes(r.start);
    const h = Math.floor(sm / 60);
    const g = guessHour(h);
    if (g !== h && !r.end) r.start = fromMinutes(g * 60 + (sm % 60));
  }

  // 8. Địa điểm: "ở thư viện", "tại phòng 204", "phòng 204"
  c.take(new RegExp(`${B}(?:ở|tại)\\s+([^,;.\\n]+?)(?=\\s*(?:[,;.\\n]|$|\\s+(?:nhớ|mang|cần|với)\\s))`, "iu"), (m) => {
    r.location = m[1].trim();
  });
  if (!r.location) {
    c.take(new RegExp(`${B}(phòng\\s+[\\p{L}\\p{N}.-]+)${E}`, "iu"), (m) => {
      r.location = m[1].trim();
    });
  }

  // 9. Phần còn lại: đoạn đầu là tiêu đề, các đoạn sau là ghi chú
  const cleaned = c.rest
    .replace(new RegExp(`${B}(lúc|vào|từ|đến|tới|nhé|nha|nhá|có|là)${E}`, "giu"), " ")
    .replace(/\s+([,;.])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,;.\-–:\s]+|[,;.\-–:\s]+$/g, "");
  const parts = cleaned.split(/\s*[,;\n]\s*|\.\s+/).map((s) => s.trim()).filter(Boolean);
  let title = parts.shift() ?? "";
  // "họp nhóm, nhớ mang laptop": nếu đoạn đầu bắt đầu bằng nhớ/mang thì là ghi chú
  if (/^(nhớ|mang|cần)\s/i.test(title) && parts.length) {
    parts.push(title);
    title = parts.shift()!;
  }
  r.title = title ? title.charAt(0).toUpperCase() + title.slice(1) : "";
  r.note = parts.join(", ");

  // 10. Loại việc theo từ khóa
  const lower = (input + " ").toLowerCase();
  if (new RegExp(`${B}(họp|meeting|gặp)${E}`, "u").test(lower)) r.kind = "hop";
  else if (new RegExp(`${B}(nộp|hạn|deadline|thi|kiểm tra)${E}`, "u").test(lower) && !new RegExp(`${B}ôn${E}`, "u").test(lower)) r.kind = "han";
  else if (new RegExp(`${B}(học|ôn|lớp|tiết|bài giảng|seminar)${E}`, "u").test(lower)) r.kind = "hoc";

  // 11. Chốt ngày
  const uniq = [...new Set(dates)];
  if (uniq.length) {
    r.date = uniq[0];
    r.foundDate = true;
  }
  if (r.repeat === "daily" && !r.foundDate) r.foundDate = true; // "hàng ngày" bắt đầu từ hôm nay
  if (r.endDate && r.endDate <= r.date) r.endDate = null;
  // Hạn nộp không giờ: để cả ngày
  r.confident = uniq.length <= 1 && r.foundDate && (!!r.start || r.kind === "han" || !!r.endDate) && r.title.length > 0;
  return r;
}

/** Tìm các mốc thời gian trong biên bản họp: mỗi câu/dòng có ngày được coi là một mốc. */
export function findMilestones(text: string, now: Date = new Date()): Parsed[] {
  const lines = text
    .normalize("NFC")
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.replace(/^[\s\-*•\d.)]+/, "").trim())
    .filter((s) => s.length > 3);
  const out: Parsed[] = [];
  for (const line of lines) {
    const p = parseEvent(line, now);
    if (p.foundDate && p.title) out.push(p);
  }
  return out;
}

// Logic thuần của bot Telegram: nhận lệnh, nút bấm, tóm tắt bản nháp.

import { formatVN } from "./dates.ts";
import type { Draft } from "./draft.ts";
import { KIND_LABEL } from "./types.ts";

export type Command = "start" | "homnay" | "tuan" | "viec" | "help";

/** "/homnay@TenBot" -> { cmd: "homnay", arg: "" }. Không phải lệnh thì trả null. */
export function parseCommand(text: string): { cmd: Command | "khac"; arg: string } | null {
  const m = /^\/([a-zA-Z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!m) return null;
  const c = m[1].toLowerCase();
  const known: Command[] = ["start", "homnay", "tuan", "viec", "help"];
  return { cmd: (known as string[]).includes(c) ? (c as Command) : "khac", arg: (m[2] ?? "").trim() };
}

/** Nút bấm: "s:<id>" lưu, "x:<id>" bỏ, "t:<id>:<số>" bật/tắt mốc thứ số, "m:<id>" đưa các mốc đã chọn vào lịch. */
export type Callback =
  | { act: "save" | "drop" | "commit"; id: string }
  | { act: "toggle"; id: string; index: number };

export function parseCallback(data: string): Callback | null {
  const p = data.split(":");
  const id = p[1];
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  if (p[0] === "s" && p.length === 2) return { act: "save", id };
  if (p[0] === "x" && p.length === 2) return { act: "drop", id };
  if (p[0] === "m" && p.length === 2) return { act: "commit", id };
  if (p[0] === "t" && p.length === 3 && /^\d{1,3}$/.test(p[2])) return { act: "toggle", id, index: Number(p[2]) };
  return null;
}

export function draftSummary(d: Draft): string {
  const when = d.allDay || !d.start ? "cả ngày" : d.end ? `${d.start}–${d.end}` : d.start;
  const lines = [
    `📌 ${d.title || "(Không tiêu đề)"}`,
    `🗓 ${formatVN(d.date)}${d.endDate ? " đến " + formatVN(d.endDate) : ""}, ${when}`,
    `🏷 ${KIND_LABEL[d.kind]}`,
  ];
  if (d.location) lines.push(`📍 ${d.location}`);
  if (d.note) lines.push(`📝 ${d.note}`);
  if (d.remind != null) lines.push(`⏰ Nhắc trước ${d.remind >= 1440 ? d.remind / 1440 + " ngày" : d.remind >= 60 ? d.remind / 60 + " tiếng" : d.remind + " phút"}`);
  if (d.repeat !== "none") lines.push(`🔁 Lặp ${d.repeat === "daily" ? "hàng ngày" : "hàng tuần"} đến ${formatVN(d.repeatUntil)}`);
  return lines.join("\n");
}

/** Đường dẫn mở trang nhập lịch với câu đã điền sẵn (giới hạn độ dài để vừa nút Telegram). */
export function editUrl(origin: string, text: string): string {
  return `${origin}/nhap-lich?q=${encodeURIComponent(text.slice(0, 300))}`;
}

import type { Kind } from "./parser.ts";

export type { Kind };

/** Một sự kiện trên lịch (một dòng trong bảng events). */
export interface CalEvent {
  id: string;
  user_id?: string;
  title: string;
  start_at: string; // ISO
  end_at: string | null; // ISO, null = không có giờ kết thúc
  all_day: boolean;
  location: string;
  note: string;
  kind: Kind;
  remind_minutes: number | null;
  cancelled: boolean;
  done: boolean;
  series_id: string | null; // các buổi của cùng một sự kiện lặp có chung series_id
  created_at?: string;
}

/** Ghi chú hoặc biên bản họp gắn với một ngày. */
export interface Note {
  id: string;
  user_id?: string;
  date: string; // YYYY-MM-DD
  type: "note" | "minutes";
  subject: string;
  title: string;
  content: string;
  created_at?: string;
}

export const KIND_LABEL: Record<Kind, string> = { hop: "Họp", hoc: "Học", han: "Hạn nộp", cn: "Cá nhân" };
export const KIND_CLASS: Record<Kind, string> = { hop: "t-hop", hoc: "t-hoc", han: "t-han", cn: "t-cn" };

export const REMIND_OPTIONS: [number | null, string][] = [
  [null, "Không nhắc"],
  [15, "15 phút"],
  [30, "30 phút"],
  [60, "1 tiếng"],
  [120, "2 tiếng"],
  [1440, "1 ngày"],
];

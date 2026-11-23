// Lớp lưu dữ liệu. Có 2 cách lưu dùng chung một giao diện:
// - Supabase (khi đã cài): dữ liệu nằm trên máy chủ, mỗi người chỉ xem được của mình.
// - Chế độ thử (chưa cài Supabase): dữ liệu nằm trong trình duyệt (localStorage).

import { supabase } from "./supabase.ts";
import type { CalEvent, Note } from "./types.ts";

export type NewEvent = Omit<CalEvent, "id" | "user_id" | "created_at"> & { id?: string };
export type NewNote = Omit<Note, "id" | "user_id" | "created_at"> & { id?: string };

export interface Store {
  listEvents(fromIso: string, toIso: string): Promise<CalEvent[]>;
  seriesEvents(seriesId: string): Promise<CalEvent[]>;
  insertEvents(rows: NewEvent[]): Promise<CalEvent[]>;
  /** Ghi đè các dòng đã có (cũng dùng để hoàn tác khi xóa nhầm). */
  upsertEvents(rows: CalEvent[]): Promise<void>;
  updateEvent(id: string, patch: Partial<CalEvent>): Promise<void>;
  deleteEvents(ids: string[]): Promise<void>;
  listNotes(fromDate?: string, toDate?: string): Promise<Note[]>;
  insertNote(n: NewNote): Promise<Note>;
  updateNote(id: string, patch: Partial<Note>): Promise<void>;
  deleteNote(id: string): Promise<void>;
}

function uuid(): string {
  return crypto.randomUUID();
}

// ---------------- Supabase ----------------
function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

const supaStore: Store = {
  async listEvents(fromIso, toIso) {
    const { data, error } = await supabase!
      .from("events")
      .select("*")
      .lt("start_at", toIso)
      .or(`start_at.gte.${fromIso},end_at.gte.${fromIso}`)
      .order("start_at");
    fail(error);
    return (data ?? []) as CalEvent[];
  },
  async seriesEvents(seriesId) {
    const { data, error } = await supabase!.from("events").select("*").eq("series_id", seriesId).order("start_at");
    fail(error);
    return (data ?? []) as CalEvent[];
  },
  async insertEvents(rows) {
    const { data, error } = await supabase!.from("events").insert(rows).select();
    fail(error);
    return (data ?? []) as CalEvent[];
  },
  async upsertEvents(rows) {
    const { error } = await supabase!.from("events").upsert(rows);
    fail(error);
  },
  async updateEvent(id, patch) {
    const { error } = await supabase!.from("events").update(patch).eq("id", id);
    fail(error);
  },
  async deleteEvents(ids) {
    const { error } = await supabase!.from("events").delete().in("id", ids);
    fail(error);
  },
  async listNotes(fromDate, toDate) {
    let q = supabase!.from("notes").select("*");
    if (fromDate) q = q.gte("date", fromDate);
    if (toDate) q = q.lte("date", toDate);
    const { data, error } = await q.order("date", { ascending: false }).order("created_at", { ascending: false });
    fail(error);
    return (data ?? []) as Note[];
  },
  async insertNote(n) {
    const { data, error } = await supabase!.from("notes").insert(n).select().single();
    fail(error);
    return data as Note;
  },
  async updateNote(id, patch) {
    const { error } = await supabase!.from("notes").update(patch).eq("id", id);
    fail(error);
  },
  async deleteNote(id) {
    const { error } = await supabase!.from("notes").delete().eq("id", id);
    fail(error);
  },
};

// ---------------- Chế độ thử (trình duyệt) ----------------
const EV_KEY = "allstack_demo_events";
const NOTE_KEY = "allstack_demo_notes";

function load<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key) || "[]") as T[];
  } catch {
    return [];
  }
}
function save<T>(key: string, rows: T[]) {
  localStorage.setItem(key, JSON.stringify(rows));
}
const byStart = (a: CalEvent, b: CalEvent) => a.start_at.localeCompare(b.start_at);

const localStore: Store = {
  async listEvents(fromIso, toIso) {
    return load<CalEvent>(EV_KEY)
      .filter((e) => e.start_at < toIso && (e.start_at >= fromIso || (e.end_at ?? "") >= fromIso))
      .sort(byStart);
  },
  async seriesEvents(seriesId) {
    return load<CalEvent>(EV_KEY).filter((e) => e.series_id === seriesId).sort(byStart);
  },
  async insertEvents(rows) {
    const all = load<CalEvent>(EV_KEY);
    const created = rows.map((r) => ({ ...r, id: r.id ?? uuid(), created_at: new Date().toISOString() }) as CalEvent);
    save(EV_KEY, [...all, ...created]);
    return created;
  },
  async upsertEvents(rows) {
    const map = new Map(load<CalEvent>(EV_KEY).map((e) => [e.id, e]));
    for (const r of rows) map.set(r.id, r);
    save(EV_KEY, [...map.values()]);
  },
  async updateEvent(id, patch) {
    save(EV_KEY, load<CalEvent>(EV_KEY).map((e) => (e.id === id ? { ...e, ...patch } : e)));
  },
  async deleteEvents(ids) {
    const set = new Set(ids);
    save(EV_KEY, load<CalEvent>(EV_KEY).filter((e) => !set.has(e.id)));
  },
  async listNotes(fromDate, toDate) {
    return load<Note>(NOTE_KEY)
      .filter((n) => (!fromDate || n.date >= fromDate) && (!toDate || n.date <= toDate))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  },
  async insertNote(n) {
    const note = { ...n, id: n.id ?? uuid(), created_at: new Date().toISOString() } as Note;
    save(NOTE_KEY, [...load<Note>(NOTE_KEY), note]);
    return note;
  },
  async updateNote(id, patch) {
    save(NOTE_KEY, load<Note>(NOTE_KEY).map((n) => (n.id === id ? { ...n, ...patch } : n)));
  },
  async deleteNote(id) {
    save(NOTE_KEY, load<Note>(NOTE_KEY).filter((n) => n.id !== id));
  },
};

export const store: Store = supabase ? supaStore : localStore;

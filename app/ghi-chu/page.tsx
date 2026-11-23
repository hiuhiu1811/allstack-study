"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatVN } from "@/lib/dates.ts";
import { store } from "@/lib/store.ts";
import type { Note } from "@/lib/types.ts";

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [filter, setFilter] = useState<"all" | "note" | "minutes">("all");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Note | null>(null);
  const [del, setDel] = useState<Note | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      setNotes(await store.listNotes());
    } catch (e) {
      setErr("Không tải được ghi chú: " + (e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const shown = notes.filter(
    (n) => (filter === "all" || n.type === filter) && (!q || (n.title + n.subject + n.content).toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <h1 style={{ margin: 0 }}>Ghi chú và biên bản họp</h1>
        <span className="spacer" />
        <Link className="btn sm primary" href="/nhap-lich?mode=note">+ Ghi chú</Link>
        <Link className="btn sm" href="/nhap-lich?mode=minutes">+ Biên bản họp</Link>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className={"btn sm" + (filter === "all" ? " on" : "")} onClick={() => setFilter("all")}>Tất cả</button>
        <button className={"btn sm" + (filter === "note" ? " on" : "")} onClick={() => setFilter("note")}>🗒 Ghi chú</button>
        <button className={"btn sm" + (filter === "minutes" ? " on" : "")} onClick={() => setFilter("minutes")}>📝 Biên bản</button>
        <input placeholder="Tìm…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 200 }} />
      </div>
      {err && <div className="err">{err}</div>}
      {shown.length === 0 && <div className="card muted">Chưa có ghi chú nào.</div>}
      {shown.map((n) => (
        <div key={n.id} className="notecard">
          <div className="row">
            <span>{n.type === "minutes" ? "📝" : "🗒"}</span>
            <b>{formatVN(n.date)}</b>
            {n.subject && <span className="tag t-hoc">{n.subject}</span>}
            {n.title && <span>{n.title}</span>}
            <span className="spacer" />
            <button className="btn sm" onClick={() => setEdit(n)}>Sửa</button>
            <button className="btn sm danger" onClick={() => setDel(n)}>Xóa</button>
          </div>
          <pre>{n.content}</pre>
        </div>
      ))}

      {edit && (
        <div className="overlay open">
          <div className="modal wide">
            <h3>Sửa {edit.type === "minutes" ? "biên bản" : "ghi chú"}</h3>
            <div className="f">
              <span>Ngày</span>
              <input type="date" value={edit.date} onChange={(e) => e.target.value && setEdit({ ...edit, date: e.target.value })} />
              {edit.type === "note" ? (
                <><span>Môn</span><input value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></>
              ) : (
                <><span>Tiêu đề</span><input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></>
              )}
            </div>
            <textarea style={{ width: "100%", height: 240 }} value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} />
            <div className="actions">
              <button className="btn" onClick={() => setEdit(null)}>Thôi</button>
              <button className="btn primary" onClick={async () => {
                await store.updateNote(edit.id, { date: edit.date, subject: edit.subject, title: edit.title, content: edit.content });
                setEdit(null);
                load();
              }}>Lưu</button>
            </div>
          </div>
        </div>
      )}
      {del && (
        <div className="overlay open">
          <div className="modal">
            <h3>Xóa {del.type === "minutes" ? "biên bản" : "ghi chú"} ngày {formatVN(del.date)}?</h3>
            <p className="muted">Xóa rồi không lấy lại được.</p>
            <div className="actions">
              <button className="btn" onClick={() => setDel(null)}>Thôi</button>
              <button className="btn danger" onClick={async () => {
                await store.deleteNote(del.id);
                setDel(null);
                load();
              }}>Xóa</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

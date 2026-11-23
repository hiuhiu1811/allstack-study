"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { EventForm } from "@/components/EventDialogs.tsx";
import { formatVN, ymd } from "@/lib/dates.ts";
import { draftFromParsed, rowsFromDraft, type Draft } from "@/lib/events.ts";
import { findMilestones, parseEvent } from "@/lib/parser.ts";
import { store } from "@/lib/store.ts";

type Mode = "lich" | "minutes" | "note";

interface Msg {
  id: number;
  from: "me" | "bot";
  text: string;
  preview?: Draft;
  saved?: string; // chữ hiện sau khi lưu / bỏ qua
  milestones?: { draft: Draft; label: string; checked: boolean }[];
}

const HINT: Record<Mode, string> = {
  lich: "Thêm lịch: gõ thời gian, việc, địa điểm, ghi chú. Mỗi dòng là một lịch. Web đọc ra để bạn kiểm tra rồi mới lưu.",
  minutes: "Biên bản họp: dán nội dung hoặc chọn file Word (.docx). Phần chữ được lưu vào ngày họp, file gốc không lưu lại.",
  note: "Ghi chú: ghi chú bài giảng hoặc học nhóm, chọn ngày và môn.",
};

const EXAMPLES = [
  "Thứ 6 14h họp nhóm KTL ở thư viện, nhớ mang laptop",
  "Sáng mai 8h học nhóm Toán phòng 204",
  "25/11 nộp báo cáo thực tập, nhắc trước 1 ngày",
  "Học tiếng Anh mỗi thứ 3 lúc 19h",
  "từ 1/12 đến 5/12 thực tập ở công ty ABC",
  "tối nay 7g30 ôn IELTS trong 1 tiếng rưỡi",
];

let seq = 1;

export default function ChatPage() {
  const [mode, setMode] = useState<Mode>("lich");
  const [text, setText] = useState("");
  const [date, setDate] = useState(ymd(new Date()));
  const [subject, setSubject] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 0, from: "bot", text: "Chào bạn! Gõ lịch như nhắn tin cho bạn bè, ví dụ \"mai 8h học nhóm Toán phòng 204\". Mình đọc ra rồi bạn kiểm tra và bấm Lưu." },
  ]);
  const [err, setErr] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);

  // Đọc ?mode=note&date=... khi mở từ trang Lịch
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const m = q.get("mode");
    if (m === "minutes" || m === "note") setMode(m);
    const d = q.get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setDate(d);
    const t = q.get("q");
    if (t) setText(t);
  }, []);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  const push = (...m: Omit<Msg, "id">[]) => setMsgs((list) => [...list, ...m.map((x) => ({ ...x, id: seq++ }))]);
  const patch = (id: number, p: Partial<Msg>) => setMsgs((list) => list.map((m) => (m.id === id ? { ...m, ...p } : m)));

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setErr("");
    if (mode === "lich") {
      const lines = t.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      const out: Omit<Msg, "id">[] = [{ from: "me", text: t }];
      for (const line of lines) {
        const p = parseEvent(line);
        let say = lines.length > 1 ? `“${line}”: ` : "";
        if (p.confident) say += "Mình đọc được như sau, kiểm tra rồi bấm Lưu:";
        else if (!p.foundDate) say += "Mình không thấy ngày nên tạm để hôm nay. Bạn sửa lại ngày giờ nếu cần:";
        else say += "Câu này hơi lạ, mình chưa chắc đã đọc đúng. Bạn kiểm tra kỹ ngày giờ nhé:";
        out.push({ from: "bot", text: say, preview: draftFromParsed(p) });
      }
      push(...out);
      setText("");
      return;
    }
    try {
      if (mode === "note") {
        await store.insertNote({ date, type: "note", subject: subject.trim(), title: "", content: t });
        push({ from: "me", text: t }, { from: "bot", text: `Đã lưu ghi chú${subject ? ` môn ${subject}` : ""} vào ngày ${formatVN(date)}.` });
        setText("");
        return;
      }
      // Biên bản họp
      const firstLine = t.split("\n")[0].trim().slice(0, 80);
      await store.insertNote({ date, type: "minutes", subject: "", title: firstLine || "Biên bản họp", content: t });
      const ms = findMilestones(t).filter((p) => !(p.date === date && /biên bản/i.test(p.title)));
      push(
        { from: "me", text: t.length > 300 ? t.slice(0, 300) + "…" : t },
        ms.length
          ? {
              from: "bot",
              text: `Đã lưu biên bản vào ngày ${formatVN(date)}. Có ${ms.length} mốc thời gian, tích chọn mốc muốn đưa vào lịch:`,
              milestones: ms.map((p) => ({ draft: draftFromParsed(p), label: `${formatVN(p.date)}${p.start ? " " + p.start : ""}: ${p.title}`, checked: true })),
            }
          : { from: "bot", text: `Đã lưu biên bản vào ngày ${formatVN(date)}. Mình không thấy mốc thời gian nào trong biên bản.` },
      );
      setText("");
    } catch (e) {
      setErr("Chưa lưu được: " + (e as Error).message);
    }
  };

  const readDocx = async (f: File) => {
    setErr("");
    try {
      const mammoth = await import("mammoth");
      const res = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() });
      setText(res.value.replace(/\n{3,}/g, "\n\n").trim());
      // Tìm ngày họp ở đầu biên bản
      const head = parseEvent(res.value.slice(0, 200));
      if (head.foundDate) setDate(head.date);
    } catch {
      setErr("Không đọc được file. Hãy chọn file Word dạng .docx.");
    }
  };

  return (
    <>
      <h1>Nhập lịch bằng chat</h1>
      <div className="chat">
        <div className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            <button className={"btn sm" + (mode === "lich" ? " on" : "")} onClick={() => setMode("lich")}>Thêm lịch</button>
            <button className={"btn sm" + (mode === "minutes" ? " on" : "")} onClick={() => setMode("minutes")}>Biên bản họp</button>
            <button className={"btn sm" + (mode === "note" ? " on" : "")} onClick={() => setMode("note")}>Ghi chú</button>
            <span className="spacer" />
            <Link className="btn sm" href="/lich">Xem lịch →</Link>
          </div>
          <div className="msgs" ref={box}>
            {msgs.map((m) => (
              <div key={m.id} className={"bubble " + (m.from === "me" ? "me" : "bot")} style={m.preview || m.milestones ? { maxWidth: "92%" } : undefined}>
                <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
                {m.preview && !m.saved && (
                  <EventForm compact initial={m.preview}
                    onClose={() => patch(m.id, { saved: "Đã bỏ qua." })}
                    onSubmit={async (d) => {
                      try {
                        const rows = await store.insertEvents(rowsFromDraft(d));
                        patch(m.id, { saved: `✓ Đã lưu ${rows.length > 1 ? rows.length + " buổi" : ""} “${d.title}” vào ngày ${formatVN(d.date)}${d.start && !d.allDay ? " lúc " + d.start : ""}.` });
                      } catch (e) {
                        setErr("Chưa lưu được: " + (e as Error).message);
                      }
                    }} />
                )}
                {m.milestones && !m.saved && (
                  <div className="preview">
                    {m.milestones.map((x, i) => (
                      <label key={i} className="row" style={{ fontSize: 13, marginBottom: 4, flexWrap: "nowrap", alignItems: "flex-start" }}>
                        <input type="checkbox" checked={x.checked}
                          onChange={() => patch(m.id, { milestones: m.milestones!.map((y, j) => (j === i ? { ...y, checked: !y.checked } : y)) })} />
                        <span>{x.label}</span>
                      </label>
                    ))}
                    <div className="row" style={{ marginTop: 8 }}>
                      <button className="btn primary sm" onClick={async () => {
                        const chosen = m.milestones!.filter((x) => x.checked);
                        try {
                          await store.insertEvents(chosen.flatMap((x) => rowsFromDraft(x.draft)));
                          patch(m.id, { saved: `✓ Đã đưa ${chosen.length} mốc vào lịch.` });
                        } catch (e) {
                          setErr("Chưa lưu được: " + (e as Error).message);
                        }
                      }}>Đưa vào lịch</button>
                      <button className="btn sm" onClick={() => patch(m.id, { saved: "Không đưa mốc nào vào lịch." })}>Bỏ qua</button>
                    </div>
                  </div>
                )}
                {m.saved && <div className="src" style={{ fontSize: 12.5 }}>{m.saved}</div>}
              </div>
            ))}
          </div>
          {err && <div className="err">{err}</div>}
          {mode !== "lich" && (
            <div className="row" style={{ marginBottom: 8, fontSize: 13 }}>
              <label className="row">{mode === "minutes" ? "Ngày họp" : "Ngày"} <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
              {mode === "note" && <label className="row">Môn <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="VD: Kinh tế lượng" /></label>}
              {mode === "minutes" && (
                <>
                  <button className="btn sm" onClick={() => file.current?.click()}>📎 Chọn file Word</button>
                  <input ref={file} type="file" accept=".docx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readDocx(f); e.target.value = ""; }} />
                </>
              )}
            </div>
          )}
          <div className="composer">
            <textarea value={text} onChange={(e) => setText(e.target.value)}
              style={mode === "lich" ? undefined : { height: 120 }}
              placeholder={mode === "lich" ? "VD: Sáng mai 8h học nhóm Toán ở phòng 204" : mode === "minutes" ? "Dán nội dung biên bản họp vào đây…" : "Nội dung ghi chú…"}
              onKeyDown={(e) => {
                if (mode === "lich" && e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }} />
            <button className="btn primary" onClick={send}>{mode === "lich" ? "Gửi" : "Lưu"}</button>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{HINT[mode]}</div>
        </div>

        <aside className="card">
          <h2>Gõ thử</h2>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Bấm một câu để điền vào ô chat.</div>
          <div style={{ display: "grid", gap: 6 }}>
            {EXAMPLES.map((x) => (
              <button key={x} className="btn sm" style={{ textAlign: "left" }} onClick={() => { setMode("lich"); setText(x); }}>{x}</button>
            ))}
          </div>
          <h3>Web hiểu được</h3>
          <ul style={{ fontSize: 12.5, paddingLeft: 18, margin: 0, lineHeight: 1.6 }}>
            <li>Giờ: 14h, 14h30, 14:30, 2h chiều, 7g tối</li>
            <li>Khoảng giờ: 14h-16h, từ 8h đến 10h, trong 2 tiếng</li>
            <li>Ngày: 25/11, ngày 25, hôm nay, mai, mốt, thứ 6, CN, thứ 2 tuần sau, cuối tuần</li>
            <li>Nhiều ngày: từ 1/12 đến 5/12</li>
            <li>Loại: họp, học/ôn/lớp, nộp/hạn/deadline/thi</li>
            <li>Địa điểm: sau chữ “ở”, “tại”, “phòng”</li>
            <li>Lặp: mỗi thứ 3, hàng tuần, hàng ngày</li>
            <li>Nhắc: nhắc trước 1 tiếng, nhắc trước 1 ngày</li>
          </ul>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Phần này không dùng AI. Đọc sai thì bạn sửa trong thẻ trước khi lưu.</div>
        </aside>
      </div>
    </>
  );
}

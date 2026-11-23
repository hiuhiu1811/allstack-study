"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EventDialogs, type Dialog } from "@/components/EventDialogs.tsx";
import { conflictIds } from "@/lib/conflicts.ts";
import { addDays, diffDays, formatVN, isoDate, parseYmd, startOfWeek, toIso, WEEKDAY_SHORT, ymd } from "@/lib/dates.ts";
import { daysOf, emptyDraft, moveToDate, timeLabel } from "@/lib/events.ts";
import { store } from "@/lib/store.ts";
import { KIND_CLASS, KIND_LABEL, type CalEvent, type Note } from "@/lib/types.ts";

type View = "month" | "week" | "gantt";

export default function CalendarPage() {
  const today = ymd(new Date());
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(today);
  const [sel, setSel] = useState(today);
  const [ganttDays, setGanttDays] = useState(30);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pop, setPop] = useState<{ x: number; y: number; date: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [err, setErr] = useState("");

  // Khoảng ngày đang hiển thị
  const [from, days] = useMemo((): [string, number] => {
    if (view === "week") return [startOfWeek(anchor), 7];
    if (view === "gantt") return [startOfWeek(anchor), ganttDays];
    const first = ymd(new Date(parseYmd(anchor).getFullYear(), parseYmd(anchor).getMonth(), 1));
    const start = startOfWeek(first);
    const last = addDays(ymd(new Date(parseYmd(first).getFullYear(), parseYmd(first).getMonth() + 1, 1)), -1);
    return [start, Math.ceil((diffDays(start, last) + 1) / 7) * 7];
  }, [view, anchor, ganttDays]);

  const load = useCallback(async () => {
    try {
      const to = addDays(from, days);
      const [ev, nt] = await Promise.all([
        store.listEvents(toIso(from, null), toIso(to, null)),
        store.listNotes(from, to),
      ]);
      setEvents(ev);
      setNotes(nt);
      setErr("");
    } catch (e) {
      setErr("Không tải được lịch: " + (e as Error).message);
    }
  }, [from, days]);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of events) for (const d of daysOf(e)) m.set(d, [...(m.get(d) ?? []), e]);
    return m;
  }, [events]);
  const clashes = useMemo(() => conflictIds(events), [events]);
  const notesOn = (d: string) => notes.filter((n) => n.date === d);

  const move = (step: number) => {
    if (view === "month") {
      const a = parseYmd(anchor);
      setAnchor(ymd(new Date(a.getFullYear(), a.getMonth() + step, 1)));
    } else setAnchor(addDays(anchor, step * (view === "week" ? 7 : Math.min(ganttDays, 30))));
  };

  const title =
    view === "month"
      ? `Tháng ${parseYmd(anchor).getMonth() + 1}/${parseYmd(anchor).getFullYear()}`
      : `${fmtShort(from)} – ${fmtShort(addDays(from, days - 1))}`;

  const toggleDone = async (e: CalEvent) => {
    setEvents((list) => list.map((x) => (x.id === e.id ? { ...x, done: !x.done } : x)));
    await store.updateEvent(e.id, { done: !e.done }).catch(() => load());
  };

  const dayCells = Array.from({ length: days }, (_, i) => addDays(from, i));
  const month = parseYmd(anchor).getMonth();

  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <h1 style={{ margin: 0 }}>{title}</h1>
        <button className="btn sm" onClick={() => move(-1)}>‹</button>
        <button className="btn sm" onClick={() => { setAnchor(today); setSel(today); }}>Hôm nay</button>
        <button className="btn sm" onClick={() => move(1)}>›</button>
        <span className="spacer" />
        <button className={"btn sm" + (view === "month" ? " on" : "")} onClick={() => setView("month")}>Tháng</button>
        <button className={"btn sm" + (view === "week" ? " on" : "")} onClick={() => setView("week")}>Tuần</button>
        <button className={"btn sm" + (view === "gantt" ? " on" : "")} onClick={() => setView("gantt")}>Biểu đồ</button>
        <button className="btn sm primary" onClick={() => setDialog({ type: "form", draft: emptyDraft(sel) })}>+ Thêm sự kiện</button>
      </div>
      <div className="row muted" style={{ fontSize: 12, marginBottom: 8 }}>
        <span className="tag t-hop">Họp</span><span className="tag t-hoc">Học</span><span className="tag t-han">Hạn nộp</span><span className="tag t-cn">Cá nhân</span>
        <span>📝 biên bản họp · 🗒 ghi chú · ⚠ trùng lịch · <span className="cancel-txt">gạch ngang</span> = đã hủy · ↻ lặp lại · kéo thả để dời ngày</span>
      </div>
      {err && <div className="err">{err}</div>}

      <div className="cal-wrap">
        <div className="card" style={{ padding: 8 }}>
          {view === "gantt" ? (
            <Gantt from={from} days={days} today={today} events={events} ganttDays={ganttDays} setGanttDays={setGanttDays}
              onOpen={(ev) => setDialog({ type: "detail", ev })} />
          ) : (
            <>
              <div className="cal-head">{WEEKDAY_SHORT.map((w) => <div key={w}>{w}</div>)}</div>
              <div className={"cal-grid" + (view === "week" ? " week" : "")}>
                {dayCells.map((d) => {
                  const list = byDay.get(d) ?? [];
                  const ns = notesOn(d);
                  const max = view === "week" ? 50 : 3;
                  const cls = ["day"];
                  if (view === "month" && parseYmd(d).getMonth() !== month) cls.push("out");
                  if (d === today) cls.push("today");
                  if (d === sel) cls.push("sel");
                  if (dragOver === d) cls.push("drop-on");
                  return (
                    <div key={d} className={cls.join(" ")}
                      onClick={() => setSel(d)}
                      onDoubleClick={() => setDialog({ type: "form", draft: emptyDraft(d) })}
                      onMouseMove={(e) => list.length && setPop({ x: e.clientX, y: e.clientY, date: d })}
                      onMouseLeave={() => setPop(null)}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(d); }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={async (e) => {
                        e.preventDefault();
                        setDragOver(null);
                        const ev = events.find((x) => x.id === e.dataTransfer.getData("text/plain"));
                        if (ev && isoDate(ev.start_at) !== d) { await moveToDate(ev, d); load(); }
                      }}>
                      <div className="dn">
                        <span>{parseYmd(d).getDate()}</span>
                        <span className="icons">
                          {ns.some((n) => n.type === "minutes") && "📝"}
                          {ns.some((n) => n.type === "note") && "🗒"}
                          {list.some((e) => clashes.has(e.id)) && "⚠"}
                        </span>
                      </div>
                      {list.slice(0, max).map((e) => (
                        <div key={e.id + d} draggable
                          className={`ev ${KIND_CLASS[e.kind]}${e.cancelled ? " cancel" : ""}${e.done ? " done-txt" : ""}`}
                          title={`${timeLabel(e)} ${e.title}`}
                          onDragStart={(x) => { x.dataTransfer.setData("text/plain", e.id); setPop(null); }}
                          onClick={(x) => { x.stopPropagation(); setSel(d); setDialog({ type: "detail", ev: e }); }}>
                          {!e.all_day && isoDate(e.start_at) === d && <span className="wk-time">{timeLabel(e).slice(0, 5)}</span>}
                          {e.series_id && "↻ "}{e.title}
                        </div>
                      ))}
                      {list.length > max && <div className="more">+{list.length - max} việc nữa</div>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <aside className="card side">
          <div className="row">
            <h2 style={{ margin: 0 }}>{formatVN(sel)}</h2>
          </div>
          <h3>Việc trong ngày</h3>
          {(byDay.get(sel) ?? []).length === 0 && <div className="muted" style={{ fontSize: 13 }}>Chưa có việc nào.</div>}
          <ul className="todo">
            {(byDay.get(sel) ?? []).map((e) => (
              <li key={e.id} className="evrow" onClick={() => setDialog({ type: "detail", ev: e })}>
                <input type="checkbox" checked={e.done} title="Đánh dấu đã xong"
                  onClick={(x) => x.stopPropagation()} onChange={() => toggleDone(e)} />
                <span className="time">{timeLabel(e)}</span>
                <span className={(e.cancelled ? "cancel-txt " : "") + (e.done ? "done-txt" : "")} style={{ flex: 1 }}>
                  {e.title}
                  {e.location && <span className="muted"> · {e.location}</span>}
                </span>
                <span className={"tag " + KIND_CLASS[e.kind]}>{KIND_LABEL[e.kind]}</span>
                {clashes.has(e.id) && <span title="Trùng lịch">⚠</span>}
              </li>
            ))}
          </ul>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => setDialog({ type: "form", draft: emptyDraft(sel) })}>+ Thêm việc ngày này</button>
          </div>
          {(byDay.get(sel) ?? []).some((e) => clashes.has(e.id)) && (
            <div className="warn" style={{ marginTop: 8 }}>⚠ Có việc trùng giờ trong ngày này.</div>
          )}

          <div className="sec">
            <h3 style={{ marginTop: 0 }}>📝 Biên bản họp</h3>
            {notesOn(sel).filter((n) => n.type === "minutes").map((n) => (
              <div key={n.id} style={{ marginBottom: 8 }}>
                <b style={{ fontSize: 13 }}>{n.title || "Biên bản"}</b>
                <div className="minutes" style={{ whiteSpace: "pre-wrap" }}>{n.content}</div>
              </div>
            ))}
            {!notesOn(sel).some((n) => n.type === "minutes") && <div className="muted" style={{ fontSize: 13 }}>Không có.</div>}
          </div>
          <div className="sec">
            <h3 style={{ marginTop: 0 }}>🗒 Ghi chú</h3>
            {notesOn(sel).filter((n) => n.type === "note").map((n) => (
              <div key={n.id} style={{ fontSize: 13, marginBottom: 6 }}>
                {n.subject && <span className="tag t-hoc">{n.subject}</span>} {n.title && <b>{n.title}: </b>}
                <span style={{ whiteSpace: "pre-wrap" }}>{n.content}</span>
              </div>
            ))}
            {!notesOn(sel).some((n) => n.type === "note") && <div className="muted" style={{ fontSize: 13 }}>Không có.</div>}
            <div className="row" style={{ marginTop: 8 }}>
              <Link className="btn sm" href={`/nhap-lich?mode=minutes&date=${sel}`}>+ Biên bản</Link>
              <Link className="btn sm" href={`/nhap-lich?mode=note&date=${sel}`}>+ Ghi chú</Link>
              <Link className="btn sm" href="/ghi-chu">Sửa/xóa ghi chú</Link>
            </div>
          </div>
        </aside>
      </div>

      {pop && (
        <div className="pop" style={{ display: "block", left: Math.min(pop.x + 14, window.innerWidth - 280), top: Math.min(pop.y + 14, window.innerHeight - 200) }}>
          <h4>{formatVN(pop.date)}</h4>
          {(byDay.get(pop.date) ?? []).map((e) => (
            <div key={e.id} style={{ fontSize: 12.5, marginBottom: 3 }} className={e.cancelled ? "cancel-txt" : ""}>
              {e.done ? "☑" : "☐"} <span className="muted">{timeLabel(e)}</span> {e.title}{clashes.has(e.id) ? " ⚠" : ""}
            </div>
          ))}
        </div>
      )}

      <EventDialogs dialog={dialog} setDialog={setDialog} onChanged={load} />
    </>
  );
}

function fmtShort(d: string) {
  const x = parseYmd(d);
  return `${x.getDate()}/${x.getMonth() + 1}`;
}

const BAR: Record<string, string> = { hoc: "h", hop: "p", han: "d", cn: "c" };

function Gantt(props: {
  from: string; days: number; today: string; events: CalEvent[]; ganttDays: number;
  setGanttDays: (n: number) => void; onOpen: (e: CalEvent) => void;
}) {
  const { from, days, today, events } = props;
  const to = addDays(from, days - 1);
  // Chỉ vẽ việc kéo dài nhiều ngày và hạn nộp; sự kiện ngắn trong ngày bỏ qua cho đỡ rối
  const items = events.filter((e) => daysOf(e).length > 1 || e.kind === "han");
  const pct = (d: string) => (diffDays(from, d) / days) * 100;
  const todayPct = today >= from && today <= to ? pct(today) + 50 / days : null;
  const cols = `minmax(140px,200px) repeat(${days}, minmax(${days > 31 ? 8 : 22}px, 1fr))`;
  const span = `2 / span ${days}`;

  const groups: { name: string; rows: CalEvent[]; empty: string }[] = [
    { name: "Lộ trình học", rows: [], empty: "Sẽ hiện khi có phần Lộ trình học" },
    { name: "Việc nhóm", rows: [], empty: "Sẽ hiện khi có phần Nhóm" },
    { name: "Cá nhân", rows: items, empty: "Chưa có việc nhiều ngày hay hạn nộp trong khoảng này" },
  ];

  return (
    <div className="gantt">
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="muted" style={{ fontSize: 12.5 }}>Khoảng hiển thị:</span>
        {[[14, "2 tuần"], [30, "1 tháng"], [91, "3 tháng"]].map(([n, l]) => (
          <button key={n} className={"btn sm" + (props.ganttDays === n ? " on" : "")} onClick={() => props.setGanttDays(n as number)}>{l}</button>
        ))}
        <span className="muted" style={{ fontSize: 12 }}>Thanh = việc nhiều ngày · ◆ = hạn nộp, ngày thi · vạch xanh = hôm nay</span>
      </div>
      <div className="gt" style={{ gridTemplateColumns: cols }}>
        <div className="gl" />
        {Array.from({ length: days }, (_, i) => {
          const d = addDays(from, i);
          const x = parseYmd(d);
          const we = x.getDay() === 0 || x.getDay() === 6;
          const show = days <= 31 || x.getDate() === 1 || x.getDay() === 1;
          return (
            <div key={d} className={"gh" + (we ? " we" : "") + (d === today ? " td" : "")} title={formatVN(d)}>
              {show ? (days > 31 ? `${x.getDate()}/${x.getMonth() + 1}` : x.getDate()) : ""}
            </div>
          );
        })}
        {groups.map((g) => (
          <GanttGroup key={g.name} {...g} span={span} pct={pct} from={from} to={to} today={today} days={days} todayPct={todayPct} onOpen={props.onOpen} />
        ))}
      </div>
    </div>
  );
}

function GanttGroup(p: {
  name: string; rows: CalEvent[]; empty: string; span: string; pct: (d: string) => number; from: string; to: string;
  today: string; days: number; todayPct: number | null; onOpen: (e: CalEvent) => void;
}) {
  const line = p.todayPct !== null && <div className="gtoday" style={{ left: `${p.todayPct}%` }} />;
  return (
    <>
      <div className="gl grp">{p.name}</div>
      <div className="gr grp" style={{ gridColumn: p.span }}>{line}</div>
      {p.rows.length === 0 && (
        <>
          <div className="gl muted" style={{ fontSize: 11.5 }}>{p.empty}</div>
          <div className="gr" style={{ gridColumn: p.span }}>{line}</div>
        </>
      )}
      {p.rows.map((e) => {
        const ds = daysOf(e);
        const s = ds[0] < p.from ? p.from : ds[0];
        const last = ds[ds.length - 1] > p.to ? p.to : ds[ds.length - 1];
        const multi = ds.length > 1;
        const left = p.pct(s);
        const width = ((diffDays(s, last) + 1) / p.days) * 100;
        const done = e.done || ds[ds.length - 1] < p.today;
        const prog = multi && !e.done && ds[0] <= p.today && p.today <= ds[ds.length - 1]
          ? (diffDays(ds[0], p.today) / ds.length) * 100 : 0;
        return (
          <div key={e.id} style={{ display: "contents" }}>
            <div className={"gl" + (e.cancelled ? " cancel-txt" : "")} title={e.title}>{e.title}</div>
            <div className="gr" style={{ gridColumn: p.span }}>
              {line}
              {multi ? (
                <div className={`gbar ${BAR[e.kind]}${done ? " done" : ""}${e.cancelled ? " cancel" : ""}`}
                  style={{ left: `${left}%`, width: `${width}%`, cursor: "pointer", color: "#fff" }}
                  title={`${e.title}: ${formatVN(ds[0])} → ${formatVN(ds[ds.length - 1])}`} onClick={() => p.onOpen(e)}>
                  {prog > 0 && <span className="gprog" style={{ width: `${prog}%` }} />}
                  <span style={{ position: "relative" }}>{e.title}</span>
                </div>
              ) : (
                <div className="gdia" style={{ left: `calc(${left + 50 / p.days}% - 6px)`, opacity: done ? 0.45 : 1 }}
                  title={`${e.title}: ${formatVN(ds[0])}`} onClick={() => p.onOpen(e)} />
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

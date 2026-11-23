"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EventDialogs, type Dialog } from "@/components/EventDialogs.tsx";
import { conflictIds } from "@/lib/conflicts.ts";
import { addDays, formatVN, toIso, ymd } from "@/lib/dates.ts";
import { daysOf, timeLabel } from "@/lib/events.ts";
import { store } from "@/lib/store.ts";
import { formatMinutes, minutesOnDay } from "@/lib/pomodoro.ts";
import { KIND_CLASS, KIND_LABEL, type CalEvent } from "@/lib/types.ts";

export default function TodayPage() {
  const router = useRouter();
  const today = ymd(new Date());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [q, setQ] = useState("");
  const [studied, setStudied] = useState(0);

  const load = useCallback(async () => {
    setEvents(await store.listEvents(toIso(today, null), toIso(addDays(today, 8), null)).catch(() => []));
  }, [today]);
  useEffect(() => {
    load();
    store.listStudySessions(toIso(today, null)).then((s) => setStudied(minutesOnDay(s, today))).catch(() => {});
  }, [load, today]);

  const clashes = useMemo(() => conflictIds(events), [events]);
  const todays = events.filter((e) => daysOf(e).includes(today));
  const deadlines = events.filter((e) => e.kind === "han" && !e.cancelled && !e.done && daysOf(e)[0] > today);

  const Row = ({ e, showDate }: { e: CalEvent; showDate?: boolean }) => (
    <li className="evrow" onClick={() => setDialog({ type: "detail", ev: e })}>
      <input type="checkbox" checked={e.done} onClick={(x) => x.stopPropagation()}
        onChange={async () => { await store.updateEvent(e.id, { done: !e.done }); load(); }} />
      <span className="time">{showDate ? formatVN(daysOf(e)[0]).replace(/, \d{4}$/, "").replace(/\/\d{4}$/, "") : timeLabel(e)}</span>
      <span style={{ flex: 1 }} className={(e.cancelled ? "cancel-txt " : "") + (e.done ? "done-txt" : "")}>
        {e.title}{e.location && <span className="muted"> · {e.location}</span>}
      </span>
      <span className={"tag " + KIND_CLASS[e.kind]}>{KIND_LABEL[e.kind]}</span>
      {clashes.has(e.id) && <span title="Trùng lịch">⚠</span>}
    </li>
  );

  return (
    <>
      <div className="grid g2">
        <div className="card">
          <h2>Lịch hôm nay · {formatVN(today)}</h2>
          {todays.length === 0 ? <div className="muted">Hôm nay chưa có việc nào.</div> : <ul className="todo">{todays.map((e) => <Row key={e.id} e={e} />)}</ul>}
          {todays.some((e) => clashes.has(e.id)) && <div className="warn" style={{ marginTop: 8 }}>⚠ Có việc trùng giờ hôm nay.</div>}
          <div className="row" style={{ marginTop: 10 }}><Link className="btn sm" href="/lich">Mở lịch →</Link></div>
        </div>
        <div className="card">
          <h2>Hạn nộp 7 ngày tới</h2>
          {deadlines.length === 0 ? <div className="muted">Không có hạn nộp nào.</div> : <ul className="todo">{deadlines.map((e) => <Row key={e.id} e={e} showDate />)}</ul>}
        </div>
      </div>
      <div className="muted" style={{ marginTop: 10 }}>
        ⏱ Hôm nay đã học {studied} phút{studied >= 60 ? ` (${formatMinutes(studied)})` : ""}. <Link href="/pomodoro">Mở Pomodoro →</Link>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <h2>Nhập nhanh</h2>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push("/nhap-lich?q=" + encodeURIComponent(q.trim())); }}>
          <input style={{ flex: 1 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="VD: Thứ 6 14h họp nhóm ở thư viện" />
          <button className="btn primary">Gửi</button>
        </form>
      </div>
      <EventDialogs dialog={dialog} setDialog={setDialog} onChanged={load} />
    </>
  );
}

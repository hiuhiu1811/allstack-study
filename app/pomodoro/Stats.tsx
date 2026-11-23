"use client";

import { parseYmd } from "@/lib/dates.ts";
import { bySubject, formatMinutes, lastDays, minutesOnDay, streak } from "@/lib/pomodoro.ts";
import type { StudySession } from "@/lib/types.ts";

const DAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** Thống kê học: hôm nay, 7 ngày gần nhất, theo môn trong tuần, chuỗi ngày. Vẽ bằng SVG/CSS. */
export function Stats({ sessions, today, weekStart }: { sessions: StudySession[]; today: string; weekStart: string }) {
  const days = lastDays(sessions, today, 7);
  const max = Math.max(30, ...days.map((d) => d.minutes));
  const subjects = bySubject(sessions, weekStart);
  const subjMax = Math.max(1, ...subjects.map((s) => s.minutes));
  const weekTotal = subjects.reduce((a, s) => a + s.minutes, 0);
  const run = streak(sessions, today);
  const H = 100;

  return (
    <div className="grid g2" style={{ marginTop: 12 }}>
      <div className="card">
        <h2>Thống kê học</h2>
        <div className="row" style={{ gap: 24, marginBottom: 8 }}>
          <div><div className="muted">Hôm nay</div><b style={{ fontSize: 20 }}>{formatMinutes(minutesOnDay(sessions, today))}</b></div>
          <div><div className="muted">Chuỗi ngày liên tục</div><b style={{ fontSize: 20 }}>🔥 {run} ngày</b></div>
        </div>
        <h3>7 ngày gần nhất</h3>
        <svg viewBox="0 0 280 130" role="img" aria-label="Số phút học 7 ngày gần nhất" style={{ width: "100%", maxWidth: 420 }}>
          <line x1="0" y1={H + 4} x2="280" y2={H + 4} stroke="var(--line)" />
          {days.map((d, i) => {
            const h = (d.minutes / max) * (H - 14);
            const x = i * 40 + 8;
            const isToday = d.date === today;
            return (
              <g key={d.date}>
                <rect x={x} y={H + 4 - h} width="24" height={h} rx="3" fill={isToday ? "var(--blue)" : "#9db8ec"} />
                {d.minutes > 0 && <text x={x + 12} y={H - h - 1} textAnchor="middle" fontSize="10" fill="var(--muted)">{d.minutes}</text>}
                <text x={x + 12} y={H + 20} textAnchor="middle" fontSize="11" fill={isToday ? "var(--blue)" : "var(--muted)"} fontWeight={isToday ? 700 : 400}>
                  {DAY[parseYmd(d.date).getDay()]}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="muted" style={{ fontSize: 12 }}>Đơn vị: phút.</div>
      </div>
      <div className="card">
        <h2>Theo môn (tuần này)</h2>
        {subjects.length === 0 ? (
          <div className="muted">Tuần này chưa có phiên học nào. Bấm Bắt đầu để học phiên đầu tiên.</div>
        ) : (
          <>
            {subjects.map((s) => (
              <div key={s.subject} style={{ marginBottom: 8 }}>
                <div className="row"><span>{s.subject}</span><span className="spacer" /><span className="muted">{formatMinutes(s.minutes)}</span></div>
                <div className="bar b" style={{ marginTop: 3 }}><i style={{ width: `${(s.minutes / subjMax) * 100}%` }} /></div>
              </div>
            ))}
            <div className="muted">Tổng tuần này: <b>{formatMinutes(weekTotal)}</b></div>
          </>
        )}
      </div>
    </div>
  );
}

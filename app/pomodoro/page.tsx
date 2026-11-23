"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startOfWeek, ymd } from "@/lib/dates.ts";
import {
  PHASE_LABEL, PRESETS, clampInt, formatClock, initTimer, pauseTimer, remaining, reset, skip, startTimer,
  syncIdle, tick, type StepResult, type TimerState,
} from "@/lib/pomodoro.ts";
import { CHIMES, NOISES, playChime, startNoise, startTrack, unlockAudio, type ChimeKind, type Playing } from "@/lib/sound.ts";
import { store } from "@/lib/store.ts";
import type { MediaItem, StudySession } from "@/lib/types.ts";
import { Stats } from "./Stats.tsx";

interface Cfg {
  subject: string;
  subjects: string[]; // các môn đã dùng
  focus: number;
  short: number;
  long: number;
  cycles: number;
  chime: ChimeKind;
  chimeVol: number;
  sound: string; // "trang" | "hong" | "nau" | "media:<id>"
  soundVol: number;
  loop: boolean;
  autoStop: boolean; // tự tắt nhạc khi đến giờ nghỉ
  bg: string; // "g:<id>" | "m:<id>"
}

const DEFAULT_CFG: Cfg = {
  subject: "", subjects: [], focus: 25, short: 5, long: 15, cycles: 4,
  chime: "chuong", chimeVol: 0.7, sound: "trang", soundVol: 0.4, loop: true, autoStop: true, bg: "g:nui",
};

// 6 nền chuyển màu dùng khi chưa có ảnh nào trong thư viện
const GRADIENTS: { id: string; label: string; css: string }[] = [
  { id: "nui", label: "Núi", css: "linear-gradient(180deg,#6b8fb5 0%,#a9c1d9 55%,#4f6b57 100%)" },
  { id: "rung", label: "Rừng", css: "linear-gradient(160deg,#1f4d36 0%,#3f7a4e 60%,#a7c47a 100%)" },
  { id: "bien", label: "Biển", css: "linear-gradient(180deg,#8ad0e8 0%,#2f86b8 55%,#0f4466 100%)" },
  { id: "mua", label: "Mưa", css: "linear-gradient(180deg,#59636e 0%,#7b8794 60%,#3d4650 100%)" },
  { id: "thuvien", label: "Thư viện", css: "linear-gradient(160deg,#5b3a24 0%,#8a5a36 55%,#c79a63 100%)" },
  { id: "dem", label: "Đêm", css: "linear-gradient(180deg,#0b1026 0%,#1b2452 60%,#3a3470 100%)" },
];

const CFG_KEY = "allstack_pomo_cfg";
const TIMER_KEY = "allstack_pomo_timer";

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* hết chỗ lưu: bỏ qua */
  }
}

export default function PomodoroPage() {
  const [cfg, setCfg] = useState<Cfg>(DEFAULT_CFG);
  const [timer, setTimer] = useState<TimerState>(() => initTimer(DEFAULT_CFG));
  const [now, setNow] = useState(0);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [sounds, setSounds] = useState<MediaItem[]>([]);
  const [images, setImages] = useState<MediaItem[]>([]);
  const [musicOn, setMusicOn] = useState(false);
  const [fs, setFs] = useState(false);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);

  const cfgRef = useRef(cfg);
  const timerRef = useRef(timer);
  const playing = useRef<Playing | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  const today = ymd(new Date());

  const loadSessions = useCallback(async () => {
    const from = new Date();
    from.setDate(from.getDate() - 400);
    setSessions(await store.listStudySessions(from.toISOString()).catch(() => []));
  }, []);

  const commit = useCallback((t: TimerState) => {
    timerRef.current = t;
    setTimer(t);
    writeJson(TIMER_KEY, t);
  }, []);

  const saveRecord = useCallback(
    async (rec: NonNullable<StepResult["record"]>) => {
      try {
        await store.addStudySession({ subject: cfgRef.current.subject.trim(), ...rec });
        setErr("");
        await loadSessions();
      } catch (e) {
        setErr("Không lưu được phiên học: " + (e instanceof Error ? e.message : "lỗi không rõ"));
      }
    },
    [loadSessions],
  );

  const apply = useCallback(
    (r: StepResult) => {
      commit(r.timer);
      if (r.record) void saveRecord(r.record);
      if (r.rang) {
        const wasFocus = r.record != null;
        playChime(cfgRef.current.chime, cfgRef.current.chimeVol);
        if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(wasFocus ? "Hết giờ học!" : "Hết giờ nghỉ!", {
            body: wasFocus ? "Nghỉ một chút nhé." : "Quay lại học thôi.",
          });
        }
      }
    },
    [commit, saveRecord],
  );

  // Khởi động: đọc lựa chọn lần trước, trạng thái đồng hồ, dữ liệu
  useEffect(() => {
    const saved = readJson<Partial<Cfg>>(CFG_KEY);
    const c = { ...DEFAULT_CFG, ...saved };
    cfgRef.current = c;
    setCfg(c);
    const t = readJson<TimerState>(TIMER_KEY);
    const start = t && t.phase && typeof t.leftMs === "number" ? t : initTimer(c);
    timerRef.current = syncIdle(start, c);
    setTimer(timerRef.current);
    setNow(Date.now());
    setReady(true);
    void loadSessions();
    store.listMedia("sound").then(setSounds).catch(() => {});
    store.listMedia("image").then(setImages).catch(() => {});
  }, [loadSessions]);

  // Đồng hồ: chỉ cập nhật hiển thị, giờ luôn tính từ Date.now()
  useEffect(() => {
    if (!ready) return;
    const run = () => {
      const n = Date.now();
      setNow(n);
      const r = tick(timerRef.current, cfgRef.current, n);
      if (r.rang) apply(r);
    };
    const id = setInterval(run, 250);
    document.addEventListener("visibilitychange", run);
    run();
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", run);
    };
  }, [ready, apply]);

  const left = remaining(timer, now || Date.now());
  const clock = formatClock(left);

  // Thời gian còn lại trên tiêu đề tab
  useEffect(() => {
    document.title = timer.running ? `${clock} · ${PHASE_LABEL[timer.phase]} — AllStack` : "Pomodoro — AllStack";
  }, [clock, timer.running, timer.phase]);
  useEffect(() => () => { document.title = "AllStack"; }, []);

  const update = (patch: Partial<Cfg>) => {
    const next = { ...cfgRef.current, ...patch };
    cfgRef.current = next;
    setCfg(next);
    writeJson(CFG_KEY, next);
    if ("focus" in patch || "short" in patch || "long" in patch) commit(syncIdle(timerRef.current, next));
  };

  // Âm thanh nền: tự tắt khi nghỉ nếu bật tùy chọn, tự bật lại khi vào phiên học
  const musicPlaying = musicOn && !(cfg.autoStop && timer.phase !== "focus");
  useEffect(() => {
    if (!musicPlaying) return;
    const c = cfgRef.current;
    let p: Playing | null = null;
    if (c.sound.startsWith("media:")) {
      const item = sounds.find((s) => s.id === c.sound.slice(6));
      if (item) p = startTrack(item.url, c.soundVol, c.loop);
    } else {
      p = startNoise(c.sound as "trang" | "hong" | "nau", c.soundVol);
    }
    playing.current = p;
    return () => {
      p?.stop();
      playing.current = null;
    };
  }, [musicPlaying, cfg.sound, cfg.loop, sounds]);
  useEffect(() => {
    playing.current?.setVolume(cfg.soundVol);
  }, [cfg.soundVol]);

  // Toàn màn hình
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setFs(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFs(false); };
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const enterFs = () => {
    setFs(true);
    stage.current?.requestFullscreen?.().catch(() => {}); // không hỗ trợ thì dùng chế độ phủ kín trang
  };
  const exitFs = () => {
    setFs(false);
    if (document.fullscreenElement) void document.exitFullscreen();
  };

  // ---- Nút điều khiển ----
  const onStart = () => {
    unlockAudio();
    if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
    const subj = cfgRef.current.subject.trim();
    if (subj && !cfgRef.current.subjects.includes(subj)) update({ subjects: [...cfgRef.current.subjects, subj] });
    commit(startTimer(timerRef.current, Date.now()));
  };
  const onPause = () => commit(pauseTimer(timerRef.current, Date.now()));
  const onSkip = () => apply(skip(timerRef.current, cfgRef.current, Date.now()));
  const onReset = () => apply(reset(timerRef.current, cfgRef.current, Date.now()));

  const num = (key: "focus" | "short" | "long" | "cycles", max: number) => (
    <input
      type="number" min={1} max={max} value={cfg[key]}
      onChange={(e) => update({ [key]: clampInt(Number(e.target.value), 1, max) })}
      style={{ width: 64 }}
    />
  );

  const subjectOptions = [...new Set([...cfg.subjects, ...sessions.map((s) => s.subject).filter(Boolean)])];
  const grad = GRADIENTS.find((g) => "g:" + g.id === cfg.bg);
  const img = images.find((i) => "m:" + i.id === cfg.bg);
  const bgCss = img ? `url(${img.url}) center/cover` : (grad ?? GRADIENTS[0]).css;
  const idle = !timer.running && timer.startedAt == null;
  const phaseName = PHASE_LABEL[timer.phase];
  const nextRound = (timer.doneFocus % Math.max(1, cfg.cycles)) + (timer.phase === "focus" ? 1 : 0);

  return (
    <>
      <h1>Pomodoro</h1>
      <div ref={stage} className={"pomo-stage card" + (fs ? " fs" : "")} style={fs ? { background: bgCss } : undefined}>
        <div className="pomo-set">
          <div className="row">
            <label>Môn học{" "}
              <input list="pomo-subjects" value={cfg.subject} placeholder="Chọn hoặc gõ môn mới"
                onChange={(e) => update({ subject: e.target.value })} style={{ width: 190 }} />
            </label>
            <datalist id="pomo-subjects">{subjectOptions.map((s) => <option key={s} value={s} />)}</datalist>
            <span className="spacer" />
            {PRESETS.map((p) => (
              <button key={p.label} className={"btn sm" + (cfg.focus === p.focus && cfg.short === p.short ? " on" : "")}
                onClick={() => update({ focus: p.focus, short: p.short })}>{p.label}</button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <label>Học {num("focus", 180)} phút</label>
            <label>Nghỉ ngắn {num("short", 60)} phút</label>
            <label>Nghỉ dài {num("long", 90)} phút</label>
            <label>Nghỉ dài sau {num("cycles", 12)} phiên</label>
          </div>
        </div>

        <div className="pomo-main">
          <div className={"pomo-phase " + timer.phase}>{phaseName}{timer.phase === "focus" && ` · phiên ${nextRound || cfg.cycles}/${cfg.cycles}`}</div>
          <div className="pomo-clock" aria-live="off">{clock}</div>
          {cfg.subject.trim() && <div className="pomo-subj">{cfg.subject.trim()}</div>}
          <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
            {timer.running ? (
              <button className="btn primary" onClick={onPause}>⏸ Tạm dừng</button>
            ) : (
              <button className="btn primary" onClick={onStart}>▶ {idle ? "Bắt đầu" : "Tiếp tục"}</button>
            )}
            <button className="btn" onClick={onSkip} title="Sang phiên kế tiếp">⏭ Bỏ qua</button>
            <button className="btn" onClick={onReset}>↺ Đặt lại</button>
            {fs ? (
              <button className="btn" onClick={exitFs}>✕ Thoát</button>
            ) : (
              <button className="btn" onClick={enterFs} title="Chế độ tập trung toàn màn hình">⛶</button>
            )}
          </div>
        </div>
        {fs && (img || grad) && (
          <div className="pomo-credit">
            {img ? `Ảnh: ${img.title} · ${img.source} · ${img.license}` : `Nền: ${grad!.label}`}
          </div>
        )}
      </div>

      {err && <div className="warn" style={{ marginTop: 8 }}>{err}</div>}

      <div className="grid g2" style={{ marginTop: 12 }}>
        <div className="card">
          <h2>Âm thanh nền</h2>
          <div className="row">
            <select value={cfg.sound} onChange={(e) => update({ sound: e.target.value })}>
              <optgroup label="Tạo bằng code">
                {NOISES.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </optgroup>
              {sounds.length > 0 && (
                <optgroup label="Thiên nhiên / nhạc tập trung">
                  {sounds.map((s) => <option key={s.id} value={"media:" + s.id}>{s.title}</option>)}
                </optgroup>
              )}
            </select>
            <button className={"btn" + (musicOn ? " on" : "")} onClick={() => { unlockAudio(); setMusicOn(!musicOn); }}>
              {musicOn ? "⏹ Tắt" : "▶ Phát"}
            </button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <label>Âm lượng{" "}
              <input type="range" min={0} max={1} step={0.05} value={cfg.soundVol} onChange={(e) => update({ soundVol: Number(e.target.value) })} />
            </label>
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <label><input type="checkbox" checked={cfg.loop} onChange={(e) => update({ loop: e.target.checked })} /> Phát lặp</label>
            <label><input type="checkbox" checked={cfg.autoStop} onChange={(e) => update({ autoStop: e.target.checked })} /> Tự tắt khi đến giờ nghỉ</label>
          </div>
          {(() => {
            const cur = sounds.find((s) => "media:" + s.id === cfg.sound);
            return cur ? <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{cur.title} · {cur.source} · {cur.license}</div> : null;
          })()}
          {sounds.length === 0 && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Chưa có bản thiên nhiên/nhạc nào trong thư viện. Tiếng ồn ở trên luôn dùng được.</div>}
        </div>
        <div className="card">
          <h2>Chuông và nền tập trung</h2>
          <div className="row">
            <label>Chuông{" "}
              <select value={cfg.chime} onChange={(e) => { const c = e.target.value as ChimeKind; update({ chime: c }); unlockAudio(); playChime(c, cfgRef.current.chimeVol); }}>
                {CHIMES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label>Âm lượng{" "}
              <input type="range" min={0} max={1} step={0.05} value={cfg.chimeVol} onChange={(e) => update({ chimeVol: Number(e.target.value) })} />
            </label>
            <button className="btn sm" onClick={() => { unlockAudio(); playChime(cfg.chime, cfg.chimeVol); }}>Thử chuông</button>
          </div>
          <h3>Nền khi bấm ⛶</h3>
          <div className="row">
            {images.map((i) => (
              <button key={i.id} className={"swatch" + (cfg.bg === "m:" + i.id ? " on" : "")} title={`${i.title} · ${i.source} · ${i.license}`}
                style={{ background: `url(${i.url}) center/cover` }} onClick={() => update({ bg: "m:" + i.id })} />
            ))}
            {GRADIENTS.map((g) => (
              <button key={g.id} className={"swatch" + (cfg.bg === "g:" + g.id ? " on" : "")} title={g.label}
                style={{ background: g.css }} onClick={() => update({ bg: "g:" + g.id })}>
                <span>{g.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <Stats sessions={sessions} today={today} weekStart={startOfWeek(today)} />
    </>
  );
}

// Âm thanh tạo bằng Web Audio API: chuông hết giờ, tiếng ồn trắng/hồng/nâu.
// Chỉ chạy trong trình duyệt. Phải gọi unlockAudio() trong lúc người dùng bấm nút (quy định của trình duyệt).

export type ChimeKind = "chuong" | "dingdong" | "bip";
export type NoiseKind = "trang" | "hong" | "nau";

export const CHIMES: { id: ChimeKind; label: string }[] = [
  { id: "chuong", label: "Chuông ngân" },
  { id: "dingdong", label: "Ding-dong" },
  { id: "bip", label: "Bíp bíp bíp" },
];
export const NOISES: { id: NoiseKind; label: string }[] = [
  { id: "trang", label: "Tiếng ồn trắng" },
  { id: "hong", label: "Tiếng ồn hồng" },
  { id: "nau", label: "Tiếng ồn nâu" },
];

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  return ctx;
}

/** Gọi khi người dùng bấm nút để trình duyệt cho phép phát tiếng sau này. */
export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume();
}

function tone(c: AudioContext, freq: number, start: number, dur: number, vol: number, type: OscillatorType = "sine") {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(c.destination);
  o.start(start);
  o.stop(start + dur + 0.05);
}

/** Phát chuông. volume từ 0 đến 1. */
export function playChime(kind: ChimeKind, volume: number) {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  const v = Math.max(0, Math.min(1, volume)) * 0.5;
  const t = c.currentTime + 0.02;
  if (kind === "chuong") {
    // Chuông: vài âm hài chồng nhau, ngân dài
    [[660, 1], [1320, 0.5], [1980, 0.25], [2640, 0.12]].forEach(([f, k]) => tone(c, f, t, 2.4, v * k));
  } else if (kind === "dingdong") {
    tone(c, 880, t, 1.0, v);
    tone(c, 660, t + 0.55, 1.6, v);
  } else {
    for (let i = 0; i < 3; i++) tone(c, 1000, t + i * 0.28, 0.16, v * 0.8, "square");
  }
}

export interface Playing {
  setVolume(v: number): void;
  stop(): void;
}

function noiseBuffer(c: AudioContext, kind: NoiseKind): AudioBuffer {
  const len = c.sampleRate * 4;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === "trang") {
      d[i] = w * 0.5;
    } else if (kind === "hong") {
      // Bộ lọc Paul Kellet cho tiếng ồn hồng
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      // Tiếng ồn nâu: cộng dồn tiếng ồn trắng
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  return buf;
}

/** Phát tiếng ồn lặp vô hạn. */
export function startNoise(kind: NoiseKind, volume: number): Playing | null {
  const c = getCtx();
  if (!c) return null;
  if (c.state === "suspended") void c.resume();
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, kind);
  src.loop = true;
  const g = c.createGain();
  g.gain.value = volume;
  src.connect(g).connect(c.destination);
  src.start();
  return {
    setVolume: (v) => { g.gain.value = v; },
    stop: () => { try { src.stop(); } catch { /* đã dừng */ } src.disconnect(); g.disconnect(); },
  };
}

/** Phát một file âm thanh từ thư viện. */
export function startTrack(url: string, volume: number, loop: boolean): Playing {
  const a = new Audio(url);
  a.loop = loop;
  a.volume = volume;
  void a.play().catch(() => { /* trình duyệt chặn: người dùng bấm lại */ });
  return {
    setVolume: (v) => { a.volume = v; },
    stop: () => { a.pause(); a.src = ""; },
  };
}

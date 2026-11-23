"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider.tsx";
import { validateMedia } from "@/lib/media.ts";
import { store } from "@/lib/store.ts";
import type { MediaItem } from "@/lib/types.ts";

const SOURCES: [string, string][] = [
  ["Pixabay (ảnh, âm thanh, nhạc) – giấy phép Pixabay License", "https://pixabay.com"],
  ["Freesound – lọc giấy phép Creative Commons 0", "https://freesound.org"],
  ["Wikimedia Commons – chỉ lấy file ghi CC0 hoặc public domain", "https://commons.wikimedia.org"],
  ["Free Music Archive – lọc giấy phép CC0", "https://freemusicarchive.org"],
];

export default function MediaAdminPage() {
  const { user, demo } = useAuth();
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [kind, setKind] = useState<"sound" | "image">("sound");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [license, setLicense] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([store.listMedia("sound"), store.listMedia("image")]);
    setItems([...a, ...b]);
  }, []);

  useEffect(() => {
    if (demo || !user) { setAdmin(false); return; }
    store.isAdmin().then(setAdmin).catch(() => setAdmin(false));
    load().catch(() => {});
  }, [demo, user, load]);

  if (demo) return <div className="card">Trang này cần Supabase để tải file lên. Chế độ thử chưa dùng được.</div>;
  if (admin === null) return <div className="center">Đang kiểm tra quyền…</div>;
  if (!admin) return <div className="card">Trang này chỉ dành cho quản trị viên. Cách tự thêm mình làm quản trị viên có trong README (mục Quản trị).</div>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const bad = validateMedia({ title, source, license }, !!file);
    if (bad) { setMsg(bad); return; }
    setBusy(true);
    try {
      await store.addMedia(file!, { kind, title: title.trim(), source: source.trim(), license: license.trim() });
      setMsg("Đã tải lên: " + title.trim());
      setTitle(""); setSource(""); setLicense(""); setFile(null);
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setMsg("Không tải lên được: " + (err instanceof Error ? err.message : "lỗi không rõ"));
    }
    setBusy(false);
  };

  return (
    <>
      <h1>Quản trị âm thanh và ảnh nền</h1>
      <div className="grid g2">
        <form className="card" onSubmit={submit}>
          <h2>Tải lên</h2>
          <div className="row">
            <label><input type="radio" checked={kind === "sound"} onChange={() => setKind("sound")} /> Âm thanh</label>
            <label><input type="radio" checked={kind === "image"} onChange={() => setKind("image")} /> Ảnh nền</label>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input type="file" accept={kind === "sound" ? "audio/*" : "image/*"} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            <input placeholder="Tên hiển thị (VD: Tiếng mưa rơi)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input placeholder="Nguồn * (VD: pixabay.com/users/ten-tac-gia)" value={source} onChange={(e) => setSource(e.target.value)} />
            <input list="licenses" placeholder="Giấy phép * (CC0 hoặc Pixabay License)" value={license} onChange={(e) => setLicense(e.target.value)} />
            <datalist id="licenses"><option value="CC0" /><option value="Pixabay License" /></datalist>
          </div>
          {msg && <div className="warn" style={{ marginTop: 8 }}>{msg}</div>}
          <div style={{ marginTop: 10 }}><button className="btn primary" disabled={busy}>{busy ? "Đang tải…" : "Lưu"}</button></div>
          <h3>Nơi lấy file miễn phí bản quyền</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {SOURCES.map(([t, u]) => <li key={u}><a href={u} target="_blank" rel="noreferrer">{t}</a></li>)}
          </ul>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Chỉ dùng file CC0 hoặc Pixabay License. Không tải nhạc có bản quyền. Mỗi file tối đa 20 MB (gói miễn phí tổng 1 GB).</div>
        </form>
        <div className="card">
          <h2>Đã có ({items.length})</h2>
          {items.length === 0 ? <div className="muted">Chưa có file nào.</div> : (
            <ul className="todo">
              {items.map((i) => (
                <li key={i.id}>
                  <span className="tag">{i.kind === "sound" ? "Âm thanh" : "Ảnh"}</span>
                  <span style={{ flex: 1 }}>{i.title}<div className="muted" style={{ fontSize: 12 }}>{i.source} · {i.license}</div></span>
                  <button className="btn sm danger" onClick={async () => {
                    if (!confirm(`Xóa "${i.title}"?`)) return;
                    try { await store.deleteMedia(i); await load(); } catch (e) { setMsg("Không xóa được: " + (e instanceof Error ? e.message : "")); }
                  }}>Xóa</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

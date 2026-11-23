"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider.tsx";
import { callApi, loadProfile, saveProfile, type MyProfile, type ProfilePatch } from "@/lib/profile.ts";
import { exportAll } from "@/lib/store.ts";

type Msg = { ok: boolean; text: string } | null;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function SettingsPage() {
  const router = useRouter();
  const { user, demo, signOut } = useAuth();
  const [p, setP] = useState<MyProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [delStep, setDelStep] = useState(0);
  const [delWord, setDelWord] = useState("");

  const reload = useCallback(async () => {
    try {
      setP(await loadProfile());
    } catch (e) {
      setMsg({ ok: false, text: "Chưa đọc được hồ sơ: " + (e as Error).message + ". Bạn đã chạy file supabase/02-nen-tang.sql chưa?" });
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (user && !demo) reload();
    else setLoaded(true);
  }, [user, demo, reload]);

  // Sau khi bấm Start ở Telegram, quay lại tab này thì cập nhật trạng thái kết nối
  useEffect(() => {
    if (demo || !user) return;
    const on = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [demo, user, reload]);

  const update = async (patch: ProfilePatch) => {
    if (!p) return;
    const before = p;
    setP({ ...p, ...patch });
    try {
      await saveProfile(p.id, patch);
      setMsg({ ok: true, text: "Đã lưu cài đặt." });
    } catch (e) {
      setP(before);
      setMsg({ ok: false, text: "Chưa lưu được: " + (e as Error).message });
    }
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
  };

  const connect = () =>
    run(async () => {
      const r = await callApi<{ url: string }>("/api/telegram/ket-noi");
      window.open(r.url, "_blank", "noopener");
      setMsg({ ok: true, text: "Đã mở Telegram. Bấm nút Start ở đó (mã dùng được trong 10 phút), rồi quay lại trang này." });
    });

  const disconnect = () =>
    run(async () => {
      await callApi("/api/telegram/ket-noi", "DELETE");
      await reload();
      setMsg({ ok: true, text: "Đã ngắt kết nối Telegram." });
    });

  const download = () =>
    run(async () => {
      const data = await exportAll();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `allstack-du-lieu-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ ok: true, text: "Đã tải file dữ liệu về máy." });
    });

  const registerHook = () =>
    run(async () => {
      const r = await callApi<{ bot: string; url: string }>("/api/telegram/dang-ky");
      setMsg({ ok: true, text: `Đã đăng ký bot @${r.bot}. Mở Telegram và thử nhắn cho bot.` });
    });

  const deleteAccount = () =>
    run(async () => {
      await callApi("/api/tai-khoan/xoa");
      await signOut();
      router.replace("/dang-nhap");
    });

  if (!loaded) return <div className="center">Đang tải…</div>;

  if (demo) {
    return (
      <>
        <h1>Cài đặt và nhắc việc</h1>
        <div className="card">
          <p>Chế độ thử chưa nối cơ sở dữ liệu nên chưa có hồ sơ, nhắc việc qua email/Telegram và xóa tài khoản.</p>
          <p className="muted">Khi nối Supabase xong (xem README), trang này sẽ có đủ cài đặt. Bạn vẫn tải được dữ liệu đang lưu trong trình duyệt:</p>
          <button className="btn" disabled={busy} onClick={download}>⬇ Tải toàn bộ dữ liệu (JSON)</button>
          {msg && <div className={msg.ok ? "ok" : "err"}>{msg.text}</div>}
        </div>
      </>
    );
  }

  if (!p) {
    return (
      <>
        <h1>Cài đặt và nhắc việc</h1>
        <div className="card">
          <div className="err">{msg?.text ?? "Không thấy hồ sơ của bạn. Hãy chạy file supabase/02-nen-tang.sql trong Supabase rồi tải lại trang."}</div>
          <button className="btn" onClick={() => { setMsg(null); reload(); }}>Tải lại</button>
        </div>
      </>
    );
  }

  const tgOn = p.telegram_chat_id != null;
  return (
    <>
      <h1>Cài đặt và nhắc việc</h1>
      {msg && <div className={msg.ok ? "ok" : "err"}>{msg.text}</div>}

      <div className="card" style={{ marginBottom: 12 }}>
        <h2>Tài khoản</h2>
        <div className="row" style={{ gap: 12 }}>
          <label className="row">Tên hiển thị
            <input defaultValue={p.display_name} maxLength={60} onBlur={(e) => e.target.value.trim() !== p.display_name && update({ display_name: e.target.value.trim() })} />
          </label>
          <span className="muted">{p.email}</span>
          <span className="tag t-cn">{p.role === "admin" ? "Quản trị viên" : p.role === "moderator" ? "Điều hành" : "Thành viên"}</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h2>Kênh nhắc việc</h2>
        <p className="muted" style={{ marginTop: 0 }}>Sự kiện có đặt “Nhắc trước” sẽ được báo qua các kênh bạn bật dưới đây (kiểm tra mỗi 5 phút).</p>
        <label className="row" style={{ marginBottom: 8 }}>
          <input type="checkbox" checked={p.notify_email} onChange={(e) => update({ notify_email: e.target.checked })} />
          Nhắc qua email <span className="muted">({p.email || "chưa có email"})</span>
        </label>
        <label className="row" style={{ marginBottom: 8 }}>
          <input type="checkbox" checked={p.notify_telegram} onChange={(e) => update({ notify_telegram: e.target.checked })} />
          Nhắc qua Telegram
        </label>
        <div className="row" style={{ marginBottom: 12 }}>
          {tgOn ? (
            <>
              <span className="tag t-hoc">Đã kết nối Telegram</span>
              <button className="btn sm" disabled={busy} onClick={disconnect}>Ngắt kết nối</button>
            </>
          ) : (
            <>
              <span className="tag t-han">Chưa kết nối Telegram</span>
              <button className="btn primary sm" disabled={busy} onClick={connect}>Kết nối Telegram</button>
            </>
          )}
        </div>
        <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "12px 0" }} />
        <label className="row" style={{ marginBottom: 8 }}>
          <input type="checkbox" checked={p.digest_enabled} onChange={(e) => update({ digest_enabled: e.target.checked })} />
          Gửi email tóm tắt lịch trong ngày vào lúc
          <select value={p.digest_hour} disabled={!p.digest_enabled} onChange={(e) => update({ digest_hour: Number(e.target.value) })}>
            {HOURS.map((h) => <option key={h} value={h}>{h}h</option>)}
          </select>
        </label>
        <div className="muted" style={{ fontSize: 12.5 }}>Chỉ gửi khi hôm đó có lịch, và cần bật “Nhắc qua email”. Múi giờ: {p.timezone}.</div>
      </div>

      {p.role === "admin" && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h2>Quản trị: bot Telegram</h2>
          <p className="muted" style={{ marginTop: 0 }}>Làm một lần sau khi điền biến môi trường trên Vercel và Redeploy.</p>
          <button className="btn sm" disabled={busy} onClick={registerHook}>Đăng ký webhook cho bot</button>
        </div>
      )}

      <div className="card" style={{ marginBottom: 12 }}>
        <h2>Dữ liệu của bạn</h2>
        <button className="btn" disabled={busy} onClick={download}>⬇ Tải toàn bộ dữ liệu (JSON)</button>
      </div>

      <div className="card" style={{ borderColor: "var(--red)" }}>
        <h2 style={{ color: "var(--red)" }}>Xóa tài khoản</h2>
        {delStep === 0 && <button className="btn" onClick={() => setDelStep(1)}>Xóa tài khoản…</button>}
        {delStep === 1 && (
          <>
            <p>Xóa tài khoản sẽ <b>xóa vĩnh viễn</b> toàn bộ lịch, ghi chú, phiên học và hồ sơ của bạn. Không khôi phục được. Nên tải dữ liệu về trước.</p>
            <div className="row">
              <button className="btn" onClick={() => setDelStep(2)}>Tôi hiểu, tiếp tục</button>
              <button className="btn" onClick={() => setDelStep(0)}>Không xóa nữa</button>
            </div>
          </>
        )}
        {delStep === 2 && (
          <>
            <p>Xác nhận lần cuối: gõ chữ <b>XOA</b> vào ô dưới rồi bấm nút đỏ.</p>
            <div className="row">
              <input value={delWord} onChange={(e) => setDelWord(e.target.value)} placeholder="XOA" style={{ width: 100 }} />
              <button className="btn" style={{ background: "var(--red)", color: "#fff", borderColor: "var(--red)" }}
                disabled={busy || delWord.trim().toUpperCase() !== "XOA"} onClick={deleteAccount}>Xóa vĩnh viễn tài khoản</button>
              <button className="btn" onClick={() => { setDelStep(0); setDelWord(""); }}>Hủy</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

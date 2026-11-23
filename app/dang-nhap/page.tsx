"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase.ts";
import { useAuth } from "@/components/AuthProvider.tsx";

export default function LoginPage() {
  const router = useRouter();
  const { user, demo } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user || demo) router.replace("/");
  }, [user, demo, router]);

  // Google/Supabase báo lỗi qua địa chỉ khi quay về web (sai Client ID, thiếu địa chỉ chuyển hướng...)
  useEffect(() => {
    const raw = window.location.search.slice(1) + "&" + window.location.hash.slice(1);
    const q = new URLSearchParams(raw);
    const desc = q.get("error_description") || q.get("error");
    if (desc) {
      setMsg({ ok: false, text: "Đăng nhập chưa xong: " + viError(desc.replace(/\+/g, " ")) });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  if (!supabase) return null;

  const google = async () => {
    const { error } = await supabase!.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/" },
    });
    if (error) setMsg({ ok: false, text: "Chưa đăng nhập Google được: " + error.message });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === "in") {
      const { error } = await supabase!.auth.signInWithPassword({ email, password: pass });
      if (error) setMsg({ ok: false, text: viError(error.message) });
    } else {
      const { error } = await supabase!.auth.signUp({
        email,
        password: pass,
        options: { emailRedirectTo: window.location.origin + "/" },
      });
      if (error) setMsg({ ok: false, text: viError(error.message) });
      else setMsg({ ok: true, text: "Đã gửi email xác nhận. Mở hộp thư, bấm vào đường link trong thư rồi quay lại đăng nhập." });
    }
    setBusy(false);
  };

  const forgot = async () => {
    if (!email) return setMsg({ ok: false, text: "Nhập email trước rồi bấm Quên mật khẩu." });
    const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/" });
    setMsg(error ? { ok: false, text: viError(error.message) } : { ok: true, text: "Đã gửi email đặt lại mật khẩu." });
  };

  return (
    <div className="login card">
      <h1 style={{ textAlign: "center" }}>{mode === "in" ? "Đăng nhập AllStack" : "Tạo tài khoản"}</h1>
      <button className="gbtn" onClick={google}>
        <b style={{ color: "#4285f4" }}>G</b> Tiếp tục với Google
      </button>
      <div className="or">hoặc dùng email</div>
      <form onSubmit={submit} style={{ display: "grid", gap: 8 }}>
        <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" required minLength={6} placeholder="Mật khẩu (ít nhất 6 ký tự)" value={pass} onChange={(e) => setPass(e.target.value)} />
        <button className="btn primary" disabled={busy}>{mode === "in" ? "Đăng nhập" : "Tạo tài khoản"}</button>
      </form>
      {msg && <div className={msg.ok ? "ok" : "err"}>{msg.text}</div>}
      <div className="row" style={{ justifyContent: "space-between", marginTop: 10, fontSize: 13 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === "in" ? "up" : "in"); setMsg(null); }}>
          {mode === "in" ? "Chưa có tài khoản? Tạo mới" : "Đã có tài khoản? Đăng nhập"}
        </a>
        {mode === "in" && <a href="#" onClick={(e) => { e.preventDefault(); forgot(); }}>Quên mật khẩu</a>}
      </div>
    </div>
  );
}

function viError(m: string): string {
  if (/invalid login/i.test(m)) return "Sai email hoặc mật khẩu.";
  if (/not confirmed/i.test(m)) return "Email chưa được xác nhận. Mở hộp thư và bấm link xác nhận.";
  if (/already registered/i.test(m)) return "Email này đã có tài khoản, hãy đăng nhập.";
  if (/provider is not enabled|unsupported provider/i.test(m)) return "Chưa bật đăng nhập Google trong Supabase (Authentication > Providers > Google).";
  if (/redirect_uri_mismatch/i.test(m)) return "Google từ chối vì địa chỉ chuyển hướng chưa khớp. Kiểm tra lại mục Authorized redirect URIs trên Google Cloud.";
  if (/rate limit/i.test(m)) return "Gửi quá nhiều lần, chờ ít phút rồi thử lại.";
  return m;
}

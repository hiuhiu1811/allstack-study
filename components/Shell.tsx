"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { store } from "@/lib/store.ts";
import { useAuth } from "./AuthProvider.tsx";

const AREAS = [
  { href: "/", label: "Cá nhân", match: (p: string) => !p.startsWith("/sap-co") },
  { href: "/sap-co?k=nhom", label: "Nhóm", match: () => false },
  { href: "/sap-co?k=congcu", label: "Công cụ", match: () => false },
  { href: "/sap-co?k=khoahoc", label: "Khóa học", match: () => false },
];

const SUB: { href: string; label: string; soon?: boolean }[] = [
  { href: "/", label: "Hôm nay" },
  { href: "/lich", label: "Lịch" },
  { href: "/nhap-lich", label: "Nhập lịch" },
  { href: "/ghi-chu", label: "Ghi chú" },
  { href: "/pomodoro", label: "Pomodoro" },
];

const PUBLIC = ["/dang-nhap", "/sap-co"];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { user, loading, demo, signOut } = useAuth();
  const [menu, setMenu] = useState(false);
  const [admin, setAdmin] = useState(false);
  const isPublic = PUBLIC.some((p) => path.startsWith(p));
  const needLogin = !demo && !loading && !user && !isPublic;

  useEffect(() => {
    if (needLogin) router.replace("/dang-nhap");
  }, [needLogin, router]);

  // Chỉ quản trị viên mới thấy mục tải âm thanh/ảnh
  useEffect(() => {
    if (user && !demo) store.isAdmin().then(setAdmin).catch(() => setAdmin(false));
    else setAdmin(false);
  }, [user, demo]);

  useEffect(() => {
    const close = () => setMenu(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const name = demo ? "Chế độ thử" : user?.user_metadata?.full_name || user?.email || "";
  const showSub = !path.startsWith("/dang-nhap") && !path.startsWith("/sap-co");

  return (
    <>
      <header>
        <div className="top">
          <Link href="/" className="logo" style={{ textDecoration: "none" }}>
            AllStack
          </Link>
          <nav className="areas">
            {AREAS.map((a) => (
              <Link key={a.label} href={a.href} className={a.match(path) && showSub ? "on" : ""}>
                {a.label}
              </Link>
            ))}
          </nav>
          {(user || demo) && (
            <div className="acc" onClick={(e) => e.stopPropagation()}>
              <button className="avatar" title="Tài khoản" onClick={() => setMenu(!menu)}>
                {(name[0] || "?").toUpperCase()}
              </button>
              <div className={"menu" + (menu ? " open" : "")}>
                <div className="muted" style={{ padding: "6px 10px", fontSize: 12.5 }}>{name}</div>
                <div className="sep" />
                <Link href="/sap-co?k=caidat" onClick={() => setMenu(false)}>⚙ Cài đặt và nhắc việc</Link>
                {admin && <Link href="/quan-tri/am-thanh" onClick={() => setMenu(false)}>🎵 Quản trị âm thanh và ảnh</Link>}
                {!demo && (
                  <>
                    <div className="sep" />
                    <a
                      href="#"
                      onClick={async (e) => {
                        e.preventDefault();
                        await signOut();
                        router.replace("/dang-nhap");
                      }}
                    >
                      Đăng xuất
                    </a>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        {showSub && (
          <nav className="subnav">
            {SUB.map((s) => (
              <Link key={s.label} href={s.href} className={(path === s.href || (s.href !== "/" && path.startsWith(s.href)) ? "on" : "") + (s.soon ? " soon" : "")}>
                {s.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main>
        {demo && (
          <div className="demo">
            <b>Chế độ thử:</b> web chưa nối cơ sở dữ liệu nên lịch chỉ lưu trong trình duyệt này. Khi cài xong Supabase, mục này tự biến mất.
          </div>
        )}
        {loading || needLogin ? <div className="center">Đang tải…</div> : children}
      </main>
    </>
  );
}

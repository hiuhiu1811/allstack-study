import Link from "next/link";

const NAMES: Record<string, string> = {
  nhom: "Nhóm (phân công, Drive, vote lịch họp)",
  congcu: "Công cụ (chuẩn hóa tiểu luận, văn bản hành chính)",
  khoahoc: "Khóa học và lộ trình học",
  pomodoro: "Pomodoro và thống kê học",
  caidat: "Cài đặt, nhắc việc qua email/Telegram",
};

export default async function Soon({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k } = await searchParams;
  return (
    <div className="card" style={{ maxWidth: 520, margin: "30px auto", textAlign: "center" }}>
      <h1>{NAMES[k ?? ""] ?? "Tính năng này"} đang được làm</h1>
      <p className="muted">Bản hiện tại có phần Lịch cá nhân. Các phần khác sẽ có ở các giai đoạn sau.</p>
      <Link className="btn primary" href="/lich">Về Lịch</Link>
    </div>
  );
}

// Kiểm tra thông tin âm thanh/ảnh trước khi lưu: bắt buộc có tên, nguồn, giấy phép.

export interface MediaMeta {
  title: string;
  source: string;
  license: string;
}

/** Trả về câu báo lỗi tiếng Việt, hoặc null nếu hợp lệ. */
export function validateMedia(m: MediaMeta, hasFile: boolean): string | null {
  if (!hasFile) return "Chưa chọn file.";
  if (!m.title.trim()) return "Hãy nhập tên.";
  if (!m.source.trim()) return "Ô Nguồn đang trống. Hãy ghi trang hoặc tác giả đã lấy file.";
  if (!m.license.trim()) return "Ô Giấy phép đang trống. Chỉ dùng file CC0 hoặc Pixabay License.";
  return null;
}

/** Tên file an toàn để đặt trong Storage (bỏ dấu, ký tự lạ). */
export function safeFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const clean = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return (clean || "file") + (ext ? "." + ext : "");
}

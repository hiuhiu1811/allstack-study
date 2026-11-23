// Gửi email qua Gmail SMTP bằng mật khẩu ứng dụng (miễn phí, khoảng 500 thư/ngày). Chỉ dùng trên máy chủ.

import nodemailer, { type Transporter } from "nodemailer";

export function mailConfigured(): boolean {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

let transport: Transporter | null = null;

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!mailConfigured()) throw new Error("Chưa cấu hình GMAIL_USER / GMAIL_APP_PASSWORD.");
  transport ??= nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  await transport.sendMail({ from: `AllStack <${process.env.GMAIL_USER}>`, to, subject, text });
}

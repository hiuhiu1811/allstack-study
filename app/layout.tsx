import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider.tsx";
import { Shell } from "@/components/Shell.tsx";

export const metadata: Metadata = {
  title: "AllStack",
  description: "Lịch, học tập và làm việc nhóm cho sinh viên",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <AuthProvider>
          <Shell>{children}</Shell>
        </AuthProvider>
      </body>
    </html>
  );
}

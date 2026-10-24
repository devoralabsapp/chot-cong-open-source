import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "LessonBrook — Sổ buổi dạy & học phí",
    template: "%s | LessonBrook",
  },
  description:
    "Sổ buổi dạy và học phí dành cho giáo viên tự do. Ghi từng buổi, giữ đúng đơn giá, nhẹ đầu cuối tháng.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "LessonBrook",
    statusBarStyle: "default",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#296447",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}

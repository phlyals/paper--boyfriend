import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "纸片人男友 2.0",
  description: "一个会记得你的虚拟陪伴聊天应用",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "記帳助手 Dashboard",
  description: "Edge AI 記帳助手管理後台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-950 text-gray-100 min-h-screen`}>
        <nav className="border-b border-gray-800 bg-gray-900/70 backdrop-blur sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
            <span className="text-lg font-bold text-indigo-400">💰 記帳助手</span>
            <Link href="/" className="text-sm text-gray-400 hover:text-white transition-colors">📊 總覽</Link>
            <Link href="/expenses" className="text-sm text-gray-400 hover:text-white transition-colors">📋 帳目</Link>
            <Link href="/categories" className="text-sm text-gray-400 hover:text-white transition-colors">📂 分類</Link>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}

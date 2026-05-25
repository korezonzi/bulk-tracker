import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { DesktopSidebar } from "@/components/desktop-sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bulk Tracker",
  description: "Lean bulk management - PFC tracking & workout logging",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Bulk Tracker",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#141416",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col md:flex-row">
        {/* Desktop sidebar - hidden on mobile */}
        <DesktopSidebar />

        {/* Main content area */}
        <main className="flex-1 pb-20 md:pb-0 w-full md:ml-56">
          <div className="w-full max-w-5xl mx-auto px-4 md:px-8">
            {children}
          </div>
        </main>

        {/* Mobile bottom tab - hidden on desktop */}
        <BottomTabBar />
      </body>
    </html>
  );
}

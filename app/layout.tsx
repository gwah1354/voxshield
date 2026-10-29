import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoxShield — speech enhancement prototype",
  description: "Every word heard, even in the loudest moments. A browser-based signal-processing baseline for noisy speech.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

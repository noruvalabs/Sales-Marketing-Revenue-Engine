import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RevForge OS — Autonomous Sales Engine by Noruva Labs",
  description: "Autonomous B2B Customer Acquisition, Qualification & Conversion Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="bg-[#07111f] text-slate-100 antialiased selection:bg-[#34d399]/30 selection:text-[#34d399]"
      >
        {children}
      </body>
    </html>
  );
}


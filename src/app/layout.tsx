import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Noruva AI — Sales, Marketing & Revenue Engine",
  description: "Autonomous B2B Customer Acquisition, Qualification & Revenue Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#07111f] text-slate-100 antialiased selection:bg-[#34d399]/30 selection:text-[#34d399]">
        {children}
      </body>
    </html>
  );
}


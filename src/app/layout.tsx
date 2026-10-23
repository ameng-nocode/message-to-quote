import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Shell from "@/components/Shell";

const fontUi = Geist({ subsets: ["latin"], variable: "--font-ui" });
const fontMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Message to Quote",
  description: "Paste a customer's order. The quotation builds itself.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${fontUi.variable} ${fontMono.variable} lg:min-h-screen`}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans, DM_Mono } from "next/font/google";

import { AuthProvider } from "@/lib/auth-context";
import { Nav } from "@/components/nav";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "BGO Games",
  description: "Internal fantasy and prediction platform for BGO competitions."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${dmMono.variable}`}>
      <body>
        <AuthProvider>
          <Nav />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

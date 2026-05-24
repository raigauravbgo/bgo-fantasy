import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AuthProvider } from "@/lib/auth-context";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "BGO Games",
  description: "Internal fantasy and prediction platform for BGO competitions."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Nav />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

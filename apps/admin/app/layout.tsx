import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dogly Control Center",
  description: "Console admin interna Dogly — business, utenti, AI, costi, privacy.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}

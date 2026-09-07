import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // TODO: impostare NEXT_PUBLIC_SITE_URL al dominio reale prima del lancio
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Dogly — Capisci il tuo cane",
  description:
    "Dogly interpreta il comportamento del cane da un breve video e tiene d'occhio la sua digestione. Sembra ansioso? Probabilmente c'è un motivo: scoprilo con Dogly.",
  openGraph: {
    title: "Dogly — Capisci il tuo cane",
    description:
      "Interpreta il comportamento del cane da un breve video e monitora la digestione, con risultati onesti a banda di confidenza.",
    images: ["/screenshots/risultato.png"],
    locale: "it_IT",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#F4F7FB",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}

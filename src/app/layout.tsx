import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Boteco do Turde — Reserva de mesa",
  description:
    "Reserve sua mesa no Boteco do Turde, em Pederneiras. Escolha o dia, o horário e a mesa em menos de um minuto.",
  openGraph: {
    title: "Boteco do Turde — Reserva de mesa",
    description: "Garanta sua mesa antes de sair de casa. 🍻",
    type: "website",
    locale: "pt_BR",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#14110E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'eCF SaaS — Comprobantes Fiscales Electrónicos',
  description: 'Sistema de gestión de e-Comprobantes Fiscales para la DGII',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}

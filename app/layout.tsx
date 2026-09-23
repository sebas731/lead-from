import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "ComuniK2 · Leads API",
  description: "Endpoint para capturar leads de la landing de ComuniK2 (Claro).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          background: "#f4f4f5",
          color: "#18181b",
        }}
      >
        {children}
      </body>
    </html>
  );
}

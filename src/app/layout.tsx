import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Folio — recursos digitales para tus ideas", description: "Plantillas y recursos digitales con acceso privado a tu biblioteca." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
 return <html lang="es-MX"><body>{children}</body></html>;
}

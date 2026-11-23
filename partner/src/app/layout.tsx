import "./globals.css";
import type { ReactNode } from "react";
export const metadata = { title: "EarthLabs Partner Portal", description: "EarthLabs partner and distribution management" };
export default function Root({ children }: { children: ReactNode }) {
  return (<html lang="en"><head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  </head><body>{children}</body></html>);
}

import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "agents/ui — A2A platform",
  description: "Runs, variance, trigger — the A2A agent mesh dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <span className="brand">agents/ui</span>
          <nav>
            <Link href="/runs">Runs</Link>
            <Link href="/trigger">Trigger</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}

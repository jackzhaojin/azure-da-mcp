import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { auth, authEnabled, signOut } from "@/auth";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Coordinator — A2A platform",
  description: "Intelligent content coordinator: trigger, watch, and score pipeline runs across the agent mesh",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = authEnabled ? await auth() : null;
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <nav className="border-b">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <Link href="/" className="text-xl font-bold">
                Coordinator
              </Link>
              <div className="hidden sm:flex items-center gap-4 text-sm">
                <Link href="/" className="text-muted-foreground hover:text-foreground">
                  Single
                </Link>
                <Link href="/bulk" className="text-muted-foreground hover:text-foreground">
                  Bulk
                </Link>
                <Link href="/eval" className="text-muted-foreground hover:text-foreground">
                  Direct eval
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {session?.user?.email && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="hidden sm:inline">{session.user.email}</span>
                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/login" });
                    }}
                  >
                    <button type="submit" className="underline underline-offset-2 hover:text-foreground">
                      Sign out
                    </button>
                  </form>
                </div>
              )}
              <div className="text-xs font-mono text-muted-foreground tracking-tight">v2.0 · :4004</div>
            </div>
          </div>
        </nav>
        <main className="container mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}

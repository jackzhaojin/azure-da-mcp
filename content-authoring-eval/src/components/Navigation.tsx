"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

export function Navigation() {
  const pathname = usePathname();

  const version = process.env.NEXT_PUBLIC_APP_VERSION;

  return (
    <nav className="border-b">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <Link href="/" className="text-xl font-bold">
            Content Authoring Eval
          </Link>
          <div className="flex space-x-2">
            <Link href="/">
              <Button
                variant={pathname === "/" ? "default" : "ghost"}
                size="sm"
              >
                Dashboard
              </Button>
            </Link>
            <Link href="/evaluate">
              <Button
                variant={pathname === "/evaluate" ? "default" : "ghost"}
                size="sm"
              >
                New Evaluation
              </Button>
            </Link>
            <Link href="/evaluate/batch">
              <Button
                variant={pathname === "/evaluate/batch" ? "default" : "ghost"}
                size="sm"
              >
                Batch Mode
              </Button>
            </Link>
          </div>
        </div>
        {version && (
          <span
            className="text-xs font-mono text-muted-foreground tracking-tight"
            title="Deployed version"
          >
            v{version}
          </span>
        )}
      </div>
    </nav>
  );
}

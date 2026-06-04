"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/recovery", label: "Recovery" },
  { href: "/sleep", label: "Sleep" },
  { href: "/strain", label: "Strain" },
  { href: "/patterns", label: "Patterns" },
  { href: "/compare", label: "Compare" },
  { href: "/tags", label: "Tags" },
] as const;

/** Dashboard section tabs. Carries the active `?from=&to=` range across pages. */
export function DashboardNav() {
  const pathname = usePathname();
  const qs = useSearchParams().toString();

  return (
    <nav className="flex gap-1">
      {ITEMS.map(({ href, label }) => (
        <Link
          key={href}
          href={qs ? `${href}?${qs}` : href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            pathname === href
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

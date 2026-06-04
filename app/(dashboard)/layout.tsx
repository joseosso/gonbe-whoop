import { Suspense, type ReactNode } from "react";
import Link from "next/link";

import { DashboardNav } from "@/components/dashboard-nav";
import { DateRangePicker } from "@/components/date-range-picker";

export default function DashboardLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-6 py-3">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Whoop Insights
          </Link>
          {/* useSearchParams needs a Suspense boundary to keep the shell static. */}
          <Suspense>
            <DashboardNav />
          </Suspense>
          <div className="ml-auto">
            <Suspense>
              <DateRangePicker />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}

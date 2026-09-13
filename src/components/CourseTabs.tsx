"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function CourseTabs({ courseId, ready }: { courseId: string; ready: boolean }) {
  const pathname = usePathname();
  const base = `/courses/${courseId}`;
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/graph`, label: "Map", needsReady: true },
    { href: `${base}/schedule`, label: "Schedule", needsReady: true },
    { href: `${base}/check`, label: "Practice", needsReady: true },
    { href: `${base}/insights`, label: "Insights", needsReady: true },
  ];

  return (
    <nav aria-label="Course sections" className="-mb-px flex gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        const disabled = tab.needsReady && !ready;
        const className = [
          "inline-flex h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium",
          active ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink",
          disabled ? "pointer-events-none text-ink-3/60" : "",
        ].join(" ");
        return disabled ? (
          <span key={tab.href} className={className} aria-disabled>
            {tab.label}
          </span>
        ) : (
          <Link key={tab.href} href={tab.href} className={className} aria-current={active ? "page" : undefined}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

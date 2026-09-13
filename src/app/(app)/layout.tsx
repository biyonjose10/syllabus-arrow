import Link from "next/link";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { ExitDemoButton } from "@/components/ExitDemoButton";
import { Wordmark } from "@/components/ui";
import { PLANS } from "@/lib/plans";
import { requireWorkspace } from "@/lib/session";
import { getWorkspace } from "@/lib/tenancy";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { ctx, user } = await requireWorkspace();
  const workspace = await getWorkspace(ctx);

  return (
    <div className="flex flex-1 flex-col">
      {ctx.isDemo ? (
        <div className="bg-ink text-paper">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-2 text-sm sm:px-8">
            <span>
              You&apos;re exploring a demo student&apos;s course — view-only. Try the <strong>Insights</strong> tab.
            </span>
            <ExitDemoButton />
          </div>
        </div>
      ) : null}
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard" className="shrink-0">
              <Wordmark />
            </Link>
            <span className="hidden truncate text-sm text-ink-3 sm:inline">{workspace.name}</span>
            <Link
              href={ctx.isDemo ? "/pricing" : "/billing"}
              className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs font-medium text-ink-2 hover:border-ink-3"
            >
              {ctx.isDemo ? "Demo" : PLANS[ctx.plan].name}
            </Link>
          </div>
          <div className="flex min-w-0 items-center gap-1">
            <span className="hidden truncate text-sm text-ink-3 md:inline">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:px-8">{children}</main>
    </div>
  );
}

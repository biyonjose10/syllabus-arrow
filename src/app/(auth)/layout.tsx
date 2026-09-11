import Link from "next/link";

import { Wordmark } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center px-5 py-10 sm:justify-center">
      <Link href="/" className="mb-8 text-xl">
        <Wordmark />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}

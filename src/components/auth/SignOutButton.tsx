"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}

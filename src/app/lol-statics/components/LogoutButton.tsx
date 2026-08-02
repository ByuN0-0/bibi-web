"use client";

import {useRouter} from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button onClick={async () => {
      await fetch("/api/lol-statics/auth/logout", {method: "POST"});
      router.replace("/lol-statics/login");
      router.refresh();
    }} className="flex min-h-12 w-full items-center rounded-xl border border-[var(--hairline)] bg-white px-4 text-sm font-medium text-[var(--muted)] hover:border-[var(--ink)] hover:text-[var(--ink)]">
      로그아웃
    </button>
  );
}

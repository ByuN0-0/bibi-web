"use client";

import {useRouter} from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button onClick={async () => {
      await fetch("/api/lol-statics/auth/logout", {method: "POST"});
      router.replace("/lol-statics/login");
      router.refresh();
    }} className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white">
      로그아웃
    </button>
  );
}

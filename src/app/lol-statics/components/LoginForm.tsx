"use client";

import {FormEvent, useState} from "react";
import {useRouter} from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/lol-statics/auth/login", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({username: data.get("username"), password: data.get("password")}),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "로그인하지 못했습니다.");
      setPending(false);
      return;
    }
    router.replace("/lol-statics");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm text-slate-300">
        아이디
        <input name="username" autoComplete="username" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/10" />
      </label>
      <label className="block text-sm text-slate-300">
        비밀번호
        <input name="password" type="password" autoComplete="current-password" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/10" />
      </label>
      {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
      <button disabled={pending} className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-3 font-bold text-slate-950 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">
        {pending ? "확인 중…" : "관리 화면 열기"}
      </button>
    </form>
  );
}

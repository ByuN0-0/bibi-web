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
      <label className="block text-sm font-medium text-[var(--body)]">
        아이디
        <input name="username" autoComplete="username" required className="form-control" />
      </label>
      <label className="block text-sm font-medium text-[var(--body)]">
        비밀번호
        <input name="password" type="password" autoComplete="current-password" required className="form-control" />
      </label>
      {error && <p role="alert" className="rounded-xl border border-[#f2b8aa] bg-[var(--error-soft)] px-4 py-3 text-sm text-[var(--error)]">{error}</p>}
      <button disabled={pending} className="primary-button w-full">
        {pending ? "확인 중…" : "관리 화면 열기"}
      </button>
    </form>
  );
}

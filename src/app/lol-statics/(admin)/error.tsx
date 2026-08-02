"use client";

import {useEffect} from "react";

export default function LolAdminError({
  error,
  reset,
}: {
  error: Error & {digest?: string};
  reset: () => void;
}) {
  useEffect(() => {
    console.error("LoL admin page error", error.digest ?? "unknown");
  }, [error]);

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-xl place-items-center text-center">
      <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] p-8">
        <p className="text-sm font-semibold text-rose-300">데이터 연결 오류</p>
        <h1 className="mt-3 text-2xl font-bold">관리 데이터를 불러오지 못했습니다.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Oracle SODA 연결과 컬렉션 상태를 확인한 뒤 다시 시도해 주세요.
        </p>
        {error.digest && <p className="mt-3 text-xs text-slate-600">오류 코드: {error.digest}</p>}
        <button onClick={reset} className="mt-6 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-bold text-slate-950">
          다시 시도
        </button>
      </div>
    </div>
  );
}

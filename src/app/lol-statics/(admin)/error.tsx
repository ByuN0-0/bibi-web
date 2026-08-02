"use client";

import {useEffect} from "react";

export default function LolAdminError({error, reset}: {error: Error & {digest?: string}; reset: () => void}) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-xl place-items-center text-center">
      <div className="surface-card border-[#f2b8aa] bg-[var(--error-soft)] p-8">
        <p className="text-sm font-semibold text-[var(--error)]">데이터 연결 오류</p>
        <h1 className="mt-3 text-2xl font-bold">관리 데이터를 불러오지 못했습니다.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">저장소 연결 상태를 확인한 뒤 다시 시도해 주세요.</p>
        {error.digest && <p className="mt-3 text-xs text-[var(--muted-soft)]">오류 코드: {error.digest}</p>}
        <button onClick={reset} className="primary-button mt-6">다시 시도</button>
      </div>
    </div>
  );
}

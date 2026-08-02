import type {Metadata} from "next";
import Image from "next/image";
import Link from "next/link";
import LoginForm from "@/app/lol-statics/components/LoginForm";

export const metadata: Metadata = {title: "관리자 로그인 | 비비"};

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--surface-soft)] px-4 py-12">
      <section className="surface-card w-full max-w-md p-7 shadow-[var(--shadow-float)] sm:p-10">
        <Link href="/" className="inline-flex items-center gap-3">
          <Image src="/images/bibi-logo.png" alt="" width={46} height={46} className="h-[46px] w-[46px] rounded-full object-cover" priority />
          <span className="font-bold">비비</span>
        </Link>
        <div className="mb-8 mt-8">
          <p className="eyebrow">BIBI control room</p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em]">LoL 내전 관리</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">등록 선수와 전적, 팀 편성 기록을 관리하려면 로그인하세요.</p>
        </div>
        <LoginForm />
        <Link href="/lol-member" className="mt-7 flex min-h-11 items-center justify-center text-sm font-semibold text-[var(--muted)] hover:text-[var(--ink)]">공개 팀 편성으로 돌아가기</Link>
      </section>
    </main>
  );
}

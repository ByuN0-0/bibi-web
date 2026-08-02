import Image from "next/image";
import Link from "next/link";
import {requirePageSession} from "@/lib/auth-server";
import LogoutButton from "@/app/lol-statics/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function LolAdminLayout({children}: {children: React.ReactNode}) {
  await requirePageSession();
  return (
    <div className="min-h-screen bg-[var(--surface-soft)] text-[var(--ink)]">
      <header className="sticky top-0 z-40 border-b border-[var(--hairline-soft)] bg-white/95 px-4 py-3 backdrop-blur-sm lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <Link href="/lol-statics" className="flex min-h-12 items-center gap-2 font-bold">
            <Image src="/images/bibi-logo.png" alt="" width={34} height={34} className="h-[34px] w-[34px] rounded-full object-cover" />
            <span>BIBI LoL</span>
          </Link>
          <details className="group relative">
            <summary className="grid h-12 w-12 cursor-pointer list-none place-items-center rounded-full border border-[var(--hairline)] bg-white [&::-webkit-details-marker]:hidden" aria-label="관리 메뉴 열기">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round"><path d="M5 7h14M5 12h14M5 17h14" /></svg>
            </summary>
            <div className="absolute right-0 top-14 w-56 rounded-2xl border border-[var(--hairline-soft)] bg-white p-2 shadow-[var(--shadow-float)]">
              <nav className="text-sm" aria-label="관리 메뉴">
                <Link href="/lol-statics" className="block rounded-xl px-4 py-3 font-semibold hover:bg-[var(--surface-soft)]">팀 편성</Link>
                <Link href="/lol-statics/players" className="block rounded-xl px-4 py-3 font-semibold hover:bg-[var(--surface-soft)]">선수 관리</Link>
                <Link href="/lol-statics/history" className="block rounded-xl px-4 py-3 font-semibold hover:bg-[var(--surface-soft)]">팀 기록</Link>
              </nav>
              <div className="mt-2 border-t border-[var(--hairline-soft)] pt-2"><LogoutButton /></div>
            </div>
          </details>
        </div>
      </header>
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-64 shrink-0 border-r border-[var(--hairline-soft)] bg-white p-6 lg:flex lg:flex-col">
          <Link href="/lol-statics" className="mb-9 flex items-center gap-3 rounded-xl">
            <Image src="/images/bibi-logo.png" alt="" width={44} height={44} className="h-11 w-11 rounded-full object-cover" />
            <div><p className="eyebrow text-[10px]">BIBI CONTROL</p><p className="mt-1 font-bold">LoL 내전 관리</p></div>
          </Link>
          <nav className="space-y-1 text-sm" aria-label="관리 메뉴">
            <NavLink href="/lol-statics" label="팀 편성" icon="⚔" />
            <NavLink href="/lol-statics/players" label="선수 관리" icon="♙" />
            <NavLink href="/lol-statics/history" label="팀 기록" icon="◷" />
          </nav>
          <div className="mt-auto space-y-2">
            <Link href="/" className="flex min-h-12 items-center rounded-xl px-4 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]">비비 홈으로</Link>
            <LogoutButton />
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}

function NavLink({href, label, icon}: {href: string; label: string; icon: string}) {
  return <Link href={href} className="flex min-h-12 items-center gap-3 rounded-xl px-4 font-semibold text-[var(--body)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"><span aria-hidden="true" className="w-5 text-center">{icon}</span>{label}</Link>;
}

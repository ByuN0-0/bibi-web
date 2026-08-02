import Link from "next/link";
import {requirePageSession} from "@/lib/auth-server";
import LogoutButton from "@/app/lol-statics/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function LolAdminLayout({children}: {children: React.ReactNode}) {
  await requirePageSession();
  return (
    <div className="min-h-screen bg-[#080c15] text-slate-100">
      <header className="border-b border-white/10 bg-[#0b111e]/90 px-5 py-4 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/lol-statics" className="font-bold">BIBI LoL</Link>
          <nav className="flex gap-4 text-sm text-slate-300">
            <Link href="/lol-statics/players">선수</Link>
            <Link href="/lol-statics/history">기록</Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#0b111e] p-6 lg:flex lg:flex-col">
          <Link href="/lol-statics" className="mb-10 block">
            <p className="text-[10px] font-bold tracking-[0.26em] text-cyan-300">BIBI CONTROL</p>
            <p className="mt-2 text-xl font-bold">LoL 내전 관리</p>
          </Link>
          <nav className="space-y-2 text-sm">
            <NavLink href="/lol-statics" label="팀 편성" />
            <NavLink href="/lol-statics/players" label="선수 관리" />
            <NavLink href="/lol-statics/history" label="팀 기록" />
          </nav>
          <div className="mt-auto"><LogoutButton /></div>
        </aside>
        <main className="min-w-0 flex-1 px-5 py-7 sm:px-8 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}

function NavLink({href, label}: {href: string; label: string}) {
  return <Link href={href} className="block rounded-xl px-4 py-3 text-slate-300 transition hover:bg-white/[0.06] hover:text-white">{label}</Link>;
}

import Image from "next/image";
import Link from "next/link";

const navigation = [
  {href: "/", label: "팀 편성"},
  {href: "/?tab=history", label: "내전 기록"},
  {href: "/?tab=stats", label: "개인 스탯"},
  {href: "/about", label: "비비 소개"},
];

export default function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[var(--hairline-soft)] bg-white/95 backdrop-blur-sm">
      <div className="page-shell flex h-[72px] items-center justify-between gap-5">
        <Link href="/" className="flex min-h-12 items-center gap-3" aria-label="비비 홈">
          <Image
            src="/images/bibi-logo.png"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-full object-cover"
            priority
          />
          <span className="text-lg font-bold tracking-[-0.02em]">비비</span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex" aria-label="주요 메뉴">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-12 items-center rounded-full px-4 text-sm font-semibold text-[var(--body)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <details className="group relative sm:hidden">
          <summary className="grid h-12 w-12 cursor-pointer list-none place-items-center rounded-full border border-[var(--hairline)] bg-white [&::-webkit-details-marker]:hidden" aria-label="메뉴 열기">
            <MenuIcon />
          </summary>
          <nav className="absolute right-0 top-14 w-52 overflow-hidden rounded-2xl border border-[var(--hairline-soft)] bg-white p-2 shadow-[var(--shadow-float)]" aria-label="모바일 메뉴">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} className="block rounded-xl px-4 py-3 text-sm font-semibold hover:bg-[var(--surface-soft)]">
                {item.label}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}

function MenuIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round"><path d="M5 7h14M5 12h14M5 17h14" /></svg>;
}

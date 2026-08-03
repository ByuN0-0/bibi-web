import Image from "next/image";
import Link from "next/link";

const links = [
  {href: "/", label: "팀 편성"},
  {href: "/?tab=history", label: "내전 기록"},
  {href: "/?tab=stats", label: "개인 스탯"},
  {href: "/about", label: "비비 소개"},
  {href: "/lol-statics/login", label: "관리자"},
];

export default function Footer() {
  return (
    <footer className="border-t border-[var(--hairline-soft)] bg-white">
      <div className="page-shell py-12 sm:py-14">
        <div className="flex flex-col justify-between gap-9 sm:flex-row sm:items-start">
          <div className="max-w-sm">
            <Link href="/" className="inline-flex items-center gap-3">
              <Image src="/images/bibi-logo.png" alt="" width={42} height={42} className="h-[42px] w-[42px] rounded-full object-cover" />
              <span className="text-lg font-bold">비비</span>
            </Link>
            <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
              친구들의 일상과 LoL 내전을 가볍고 편리하게 돕는 Discord 봇입니다.
            </p>
          </div>
          <nav className="grid grid-cols-2 gap-x-10 gap-y-1 text-sm sm:flex sm:gap-1" aria-label="푸터 메뉴">
            {links.map((item) => (
              <Link key={item.href} href={item.href} className="flex min-h-11 items-center rounded-lg px-3 font-medium text-[var(--body)] hover:bg-[var(--surface-soft)]">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-10 border-t border-[var(--hairline-soft)] pt-6 text-xs text-[var(--muted)]">
          © {new Date().getFullYear()} BIBI. 친구들과 함께 만든 Discord 봇.
        </div>
      </div>
    </footer>
  );
}

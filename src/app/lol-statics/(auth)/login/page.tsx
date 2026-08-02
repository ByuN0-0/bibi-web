import type {Metadata} from "next";
import LoginForm from "@/app/lol-statics/components/LoginForm";

export const metadata: Metadata = {title: "관리자 로그인 | BIBI LoL"};

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#070b14] text-white grid place-items-center px-5 py-12">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-violet-500/15 blur-3xl" />
      </div>
      <section className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-xl sm:p-10">
        <div className="mb-9">
          <p className="text-xs font-semibold tracking-[0.28em] text-cyan-300">BIBI CONTROL ROOM</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">LoL 내전 관리</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">등록 선수와 전적, 팀 편성 기록을 관리하려면 로그인하세요.</p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}

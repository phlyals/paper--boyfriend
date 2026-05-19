import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="safe-page grid place-items-center px-5">
      <section className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-xl">
        <h1 className="text-2xl font-semibold text-white">欢迎回来</h1>
        <p className="mt-2 text-sm text-white/55">登录后，他会继续记得你们上次聊过的事。</p>
        <AuthForm mode="login" />
        <p className="mt-5 text-center text-sm text-white/45">
          还没有账号？{" "}
          <Link className="font-medium text-[#5ecfc3] hover:text-[#94e9e0]" href="/register">
            去注册
          </Link>
        </p>
      </section>
    </main>
  );
}

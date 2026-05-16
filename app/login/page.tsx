import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="safe-page grid place-items-center px-5">
      <section className="w-full max-w-sm rounded-lg bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">欢迎回来</h1>
        <p className="mt-2 text-sm text-[#667085]">登录后，他会继续记得你们上次聊过的事。</p>
        <AuthForm mode="login" />
        <p className="mt-5 text-center text-sm text-[#667085]">
          还没有账号？{" "}
          <Link className="font-medium text-[#176c63]" href="/register">
            去注册
          </Link>
        </p>
      </section>
    </main>
  );
}

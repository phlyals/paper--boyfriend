import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  return (
    <main className="safe-page grid place-items-center px-5">
      <section className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-xl">
        <h1 className="text-2xl font-semibold text-white">创建账号</h1>
        <p className="mt-2 text-sm text-white/55">用一个邮箱开始，先选一个会陪你聊天的人。</p>
        <AuthForm mode="register" />
        <p className="mt-5 text-center text-sm text-white/45">
          已经注册？{" "}
          <Link className="font-medium text-[#5ecfc3] hover:text-[#94e9e0]" href="/login">
            去登录
          </Link>
        </p>
      </section>
    </main>
  );
}

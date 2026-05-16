"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    const result =
      mode === "register"
        ? await authClient.signUp.email({
            email,
            password,
            name: email.split("@")[0] || "新用户",
          })
        : await authClient.signIn.email({
            email,
            password,
          });
    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? "操作失败");
      return;
    }
    router.push("/pick");
    router.refresh();
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={onSubmit}>
      <label className="block text-sm font-medium">
        邮箱
        <input
          className="mt-2 w-full rounded-md border border-[#dce3ee] px-3 py-2 outline-none focus:border-[#2f8f83]"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </label>
      <label className="block text-sm font-medium">
        密码
        <input
          className="mt-2 w-full rounded-md border border-[#dce3ee] px-3 py-2 outline-none focus:border-[#2f8f83]"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={6}
          required
        />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        className="tap w-full rounded-md bg-[#176c63] px-4 py-2.5 font-medium text-white disabled:opacity-60"
        disabled={loading}
      >
        {loading ? "处理中..." : mode === "login" ? "登录" : "注册并继续"}
      </button>
    </form>
  );
}

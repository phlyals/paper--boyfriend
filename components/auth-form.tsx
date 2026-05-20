"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Turnstile } from "@marsidev/react-turnstile";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");

    // 配了 Turnstile 且 token 未就绪，先拦截
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError("请先完成人机验证");
      return;
    }

    setLoading(true);

    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password, turnstileToken }),
    });
    const result = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(result.error ?? (mode === "register" ? "注册失败，请重试" : "登录失败，请重试"));
      return;
    }

    router.push("/pick");
    router.refresh();
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={onSubmit}>
      <label className="block text-sm font-medium text-white/80">
        邮箱
        <input
          className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-white placeholder:text-white/30 outline-none focus:border-[#5ecfc3] focus:ring-1 focus:ring-[#5ecfc3]/30"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="your@email.com"
          required
        />
      </label>
      <label className="block text-sm font-medium text-white/80">
        密码
        <input
          className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-white placeholder:text-white/30 outline-none focus:border-[#5ecfc3] focus:ring-1 focus:ring-[#5ecfc3]/30"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder="至少 6 位"
          minLength={6}
          required
        />
      </label>

      {/* 配了 site key 时登录/注册都显示 Turnstile */}
      {TURNSTILE_SITE_KEY ? (
        <Turnstile
          siteKey={TURNSTILE_SITE_KEY}
          onSuccess={(token) => setTurnstileToken(token)}
          onExpire={() => setTurnstileToken("")}
          onError={() => setTurnstileToken("")}
          options={{ theme: "dark" }}
        />
      ) : null}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <button
        className="tap w-full rounded-md bg-[#2f8f83] px-4 py-2.5 font-medium text-white shadow-lg shadow-[#2f8f83]/25 hover:bg-[#3aa89b] disabled:opacity-60"
        disabled={loading || (!!TURNSTILE_SITE_KEY && !turnstileToken)}
      >
        {loading ? "处理中..." : mode === "login" ? "登录" : "注册并继续"}
      </button>
    </form>
  );
}

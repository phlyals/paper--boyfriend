import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { email, password, turnstileToken } = body as {
    email?: string;
    password?: string;
    turnstileToken?: string;
  };

  if (!email || !password) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  // Turnstile 验证（仅在配了 secret key 时执行）
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (secretKey) {
    if (!turnstileToken) {
      return Response.json({ error: "请先完成人机验证" }, { status: 403 });
    }
    const verifyRes = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: secretKey, response: turnstileToken }),
      },
    );
    const verifyResult = (await verifyRes.json()) as { success: boolean };
    if (!verifyResult.success) {
      return Response.json({ error: "人机验证失败，请重试" }, { status: 403 });
    }
  }

  // 调 better-auth 服务端 API 登录，返回带 Set-Cookie 的 Response
  const signInResponse = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });

  return signInResponse;
}

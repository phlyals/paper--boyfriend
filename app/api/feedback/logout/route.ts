import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { sendLogoutFeedback } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser();
  if (!user) return response;

  const body = await request.json().catch(() => ({}));
  const feedback = String(body.feedback ?? "").trim();
  if (!feedback) return Response.json({ ok: true }); // 跳过空反馈

  try {
    await sendLogoutFeedback(user.name, user.email, feedback);
  } catch (err) {
    console.error("[feedback] 发送失败：", err);
    // 失败不阻塞退出流程
  }

  return Response.json({ ok: true });
}

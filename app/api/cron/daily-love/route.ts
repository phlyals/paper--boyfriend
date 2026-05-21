import { type NextRequest, NextResponse } from "next/server";
import { sendDailyLoveLetterToAll } from "@/lib/email";

export const runtime = "nodejs";
// Vercel Cron 超时设置长一点，批量发邮件可能需要时间
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  // 验证请求来自 Vercel Cron（或持有 CRON_SECRET 的合法调用方）
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "未授权访问" }, { status: 401 });
  }

  try {
    const result = await sendDailyLoveLetterToAll();
    return NextResponse.json({
      message: "每日情话发送完成",
      ...result,
      time: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron] 每日情话发送失败：", error);
    return NextResponse.json({ error: "发送失败" }, { status: 500 });
  }
}

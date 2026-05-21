import { type NextRequest, NextResponse } from "next/server";
import { recallInactiveUsers } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "未授权访问" }, { status: 401 });
  }

  try {
    const result = await recallInactiveUsers();
    return NextResponse.json({
      success: true,
      message: `召回完成，共发送 ${result.recalled} 封`,
      time: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron] recall-inactive-users 失败：", error);
    return NextResponse.json({ error: "发送失败" }, { status: 500 });
  }
}

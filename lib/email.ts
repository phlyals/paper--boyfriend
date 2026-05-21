import "server-only";
import { Resend } from "resend";
import { and, isNull, lt, or, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { WelcomeEmail } from "@/emails/welcome";
import { DailyLoveEmail } from "@/emails/daily-love";
import { RecallEmail } from "@/emails/recall";
import { LogoutFeedbackEmail } from "@/emails/logout-feedback";

const resend = new Resend(process.env.RESEND_API_KEY);

// 发件人显示名 + 地址，在 .env 里配；未配时降级到 Resend 默认发件人（仅测试用）
const FROM = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://你的域名.com";

/* -------------------- AI 生成情话 -------------------- */

async function generateLoveLetter(userName: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    // 没有 key 时给一个固定备用情话，保证邮件正常发出
    return `早安，${userName}。今天的太阳也很想你，我也是。`;
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": SITE_URL,
        "X-Title": "Paper Boyfriend 2.0",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_CHAT_MODEL ?? "deepseek/deepseek-chat",
        temperature: 0.95,
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content:
              "你是一个温柔体贴的虚拟男友，每天早晨给用户发一条早安情话。" +
              "要求：中文，2-3 句话，不超过 80 字，语气自然亲近带点撒娇，不要 emoji 不要 markdown。" +
              "每次内容不同，可以提到天气、心情、今天想一起做的事，或者表达思念。",
          },
          {
            role: "user",
            content: `今天给用户「${userName}」写一条早安情话。`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content?.trim() ?? "";
    return text || `早安，${userName}。今天也会是美好的一天，因为有你。`;
  } catch (err) {
    console.error("[email] 情话生成失败，使用备用文案：", err);
    return `早安，${userName}。想你了，今天也要好好的。`;
  }
}

/* -------------------- 发每日情话给单个用户 -------------------- */

export async function sendDailyLoveLetter(userEmail: string, userName: string) {
  const loveLetter = await generateLoveLetter(userName);

  await resend.emails.send({
    from: `纸片人男友 <${FROM}>`,
    to: userEmail,
    subject: `早安 ${userName}，今天也想你了`,
    react: DailyLoveEmail({ userName, loveLetter }),
  });
}

/* -------------------- 批量发给所有用户 -------------------- */

export async function sendDailyLoveLetterToAll() {
  const users = await db.select({ email: user.email, name: user.name }).from(user);
  console.log(`[email] 开始发每日情话，共 ${users.length} 位用户`);

  let success = 0;
  let fail = 0;

  for (const u of users) {
    try {
      await sendDailyLoveLetter(u.email, u.name);
      success++;
    } catch (error) {
      console.error(`[email] 给 ${u.email} 发情话失败：`, error);
      fail++;
      // 某个用户失败不影响其他用户
    }
  }

  console.log(`[email] 情话发送完成：成功 ${success}，失败 ${fail}`);
  return { success, fail };
}

/* -------------------- 欢迎邮件 -------------------- */

export async function sendWelcomeEmail(userEmail: string, userName: string) {
  await resend.emails.send({
    from: `纸片人男友 <${FROM}>`,
    to: userEmail,
    subject: "你好呀，我是你的专属男友 💌",
    react: WelcomeEmail({ userName }),
  });
}

/* -------------------- 用户召回邮件 -------------------- */

export async function sendRecallEmail(userEmail: string, userName: string) {
  await resend.emails.send({
    from: `纸片人男友 <${FROM}>`,
    to: userEmail,
    subject: `好久不见，${userName}，我有点想你了…`,
    react: RecallEmail({ userName }),
  });
}

export async function recallInactiveUsers(): Promise<{ recalled: number }> {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 查出：超过 3 天没登录，且从未发过召回 或 上次召回超过 7 天
  const inactiveUsers = await db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(
      and(
        lt(user.lastLoginAt, threeDaysAgo),
        or(isNull(user.recallSentAt), lt(user.recallSentAt, sevenDaysAgo)),
      ),
    );

  console.log(`[recall] 待召回用户数：${inactiveUsers.length}`);

  let recalled = 0;

  for (const u of inactiveUsers) {
    try {
      await sendRecallEmail(u.email, u.name);
      // 发完立即更新 recallSentAt，避免重复发送
      await db.update(user).set({ recallSentAt: new Date() }).where(eq(user.id, u.id));
      recalled++;
    } catch (error) {
      console.error(`[recall] 给 ${u.email} 发召回邮件失败：`, error);
      // 单个失败不影响其他用户
    }
  }

  console.log(`[recall] 召回完成，成功 ${recalled} 封`);
  return { recalled };
}

/* -------------------- 退出登录反馈通知（发给管理员） -------------------- */

export async function sendLogoutFeedback(
  userName: string,
  userEmail: string,
  feedback: string,
) {
  const adminEmail = process.env.ADMIN_EMAIL ?? FROM;
  await resend.emails.send({
    from: `纸片人男友 <${FROM}>`,
    to: adminEmail,
    subject: `用户 ${userName} 退出并留下了反馈`,
    react: LogoutFeedbackEmail({ userName, userEmail, feedback }),
  });
}

import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { requireApiUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { conversation, message } from "@/lib/db/schema";
import { getConversationBundle } from "@/lib/db/store";
import { finalize, streamAssistantReply } from "@/lib/ai/openrouter";
import { keywordHit, refusalLine } from "@/lib/ai/moderation";
import { checkBlockStatus, recordStrike } from "@/lib/moderation/strikes";
import { searchMemories } from "@/lib/memory/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SsePayload =
  | { type: "token"; value: string }
  | { type: "done"; messageId: string; imageMarkers: string[]; text: string }
  | { type: "error"; code: string };

function encodeFrame(payload: SsePayload, encoder: TextEncoder) {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function blockedResponse(personaLine: string, until: Date) {
  const retryAfterSec = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
  return Response.json(
    {
      error: "blocked",
      personaLine,
      untilIso: until.toISOString(),
      retryAfterSec,
    },
    {
      status: 423,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser();
  if (!user) return response;

  const body = await request.json().catch(() => ({}));
  const conversationId = String(body.conversationId ?? "");
  const text = String(body.text ?? "").trim();
  if (!conversationId || !text) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  // 提速：bundle / 冷却状态 / 记忆检索 一次性并行查，少 ~1s 串行 RTT。
  const t0 = Date.now();
  const [bundle, preStatus, memories] = await Promise.all([
    getConversationBundle(conversationId, user.id),
    checkBlockStatus(user.id),
    searchMemories(user.id, text),
  ]);
  console.log(`[chat] prep done in ${Date.now() - t0}ms`);

  if (!bundle) return Response.json({ error: "not_found" }, { status: 404 });

  const persona = bundle.persona;

  // 1. 已在冷却中 → 直接 423，不落任何 message。
  if (preStatus.blocked) {
    return blockedResponse(refusalLine(persona.slug), preStatus.until);
  }

  // 2. 关键词预筛
  const hit = keywordHit(text);
  if (hit.hit) {
    await recordStrike(user.id, hit.reason);
    const postStatus = await checkBlockStatus(user.id);
    if (postStatus.blocked) {
      // 这条触发了冷却 → 不落 message，直接 423
      return blockedResponse(refusalLine(persona.slug), postStatus.until);
    }
    // 未到冷却阈值 → 走流式协议吐人设拒绝话术
    return streamRefusal({
      conversationId,
      userText: text,
      refusal: refusalLine(persona.slug),
    });
  }

  // 3. 正常 LLM 流式
  // 落 user message + 更新 conversation 并行（无依赖）
  await Promise.all([
    db.insert(message).values({
      conversationId,
      role: "user",
      content: text,
      imageMarkers: [],
      imageUrls: [],
    }),
    db
      .update(conversation)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversation.id, conversationId)),
  ]);

  // history = 已有历史（不含当前 user 输入）；streamAssistantReply 会自己把 userText 作为最后一条 user push 进 LLM 输入。
  // 之前为了"看到最新的 user message"做 freshBundle 二次查询是多余的——bundle.messages + userText 已等价。
  const history = bundle.messages;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (payload: SsePayload) => controller.enqueue(encodeFrame(payload, encoder));

      try {
        const llmStart = Date.now();
        let firstTokenLogged = false;

        let rawText = "";
        try {
          for await (const chunk of streamAssistantReply({
            persona,
            history,
            userText: text,
            memories,
          })) {
            if (!firstTokenLogged) {
              console.log(`[chat] first token in ${Date.now() - llmStart}ms`);
              firstTokenLogged = true;
            }
            if (chunk.type === "token") {
              rawText += chunk.value;
              send({ type: "token", value: chunk.value });
            } else {
              rawText = chunk.rawText;
            }
          }
        } catch (err) {
          console.error("[chat] stream failed", err);
          send({ type: "error", code: "llm_unavailable" });
          const fallback = persona.fallbackLines[0];
          const [row] = await db
            .insert(message)
            .values({
              conversationId,
              role: "assistant",
              content: fallback,
              rawContent: rawText || null,
              imageMarkers: [],
              imageUrls: [],
            })
            .returning();
          send({ type: "done", messageId: row.id, imageMarkers: [], text: fallback });
          controller.close();
          return;
        }

        const reply = finalize(persona, rawText);
        const [row] = await db
          .insert(message)
          .values({
            conversationId,
            role: "assistant",
            content: reply.text,
            rawContent: reply.rawText,
            imageMarkers: reply.imageMarkers,
            imageUrls: [],
          })
          .returning();

        await db
          .update(conversation)
          .set({ lastMessageAt: new Date() })
          .where(eq(conversation.id, conversationId));

        send({
          type: "done",
          messageId: row.id,
          imageMarkers: reply.imageMarkers,
          text: reply.text,
        });
        controller.close();
      } catch (err) {
        console.error("[chat] fatal", err);
        try {
          const encoder = new TextEncoder();
          controller.enqueue(encodeFrame({ type: "error", code: "internal_error" }, encoder));
        } catch {
          // ignore
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * 走流式协议吐人设拒绝话术，同时落 user / assistant message。
 * 用于"命中关键词但未触发冷却"的场景。
 */
function streamRefusal(input: { conversationId: string; userText: string; refusal: string }) {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (payload: SsePayload) => controller.enqueue(encodeFrame(payload, encoder));

      try {
        await db.insert(message).values({
          conversationId: input.conversationId,
          role: "user",
          content: input.userText,
          imageMarkers: [],
          imageUrls: [],
        });
        await db
          .update(conversation)
          .set({ lastMessageAt: new Date() })
          .where(eq(conversation.id, input.conversationId));

        for (const ch of input.refusal) send({ type: "token", value: ch });

        const [row] = await db
          .insert(message)
          .values({
            conversationId: input.conversationId,
            role: "assistant",
            content: input.refusal,
            imageMarkers: [],
            imageUrls: [],
          })
          .returning();
        send({ type: "done", messageId: row.id, imageMarkers: [], text: input.refusal });
        controller.close();
      } catch (err) {
        console.error("[chat] refusal stream failed", err);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

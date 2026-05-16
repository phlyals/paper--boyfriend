import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { requireApiUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { characterPreset, conversation, message, userCharacter } from "@/lib/db/schema";
import { uploadToR2 } from "@/lib/storage/r2";
import { getPersona } from "@/lib/ai/personas";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser();
  if (!user) return response;

  const body = await request.json().catch(() => ({}));
  const messageId = String(body.messageId ?? "");
  if (!messageId) return Response.json({ error: "bad_request" }, { status: 400 });

  // 前端在流式还没完成时点了播放：messageId 是占位字符串，不能作为 UUID 查 DB。
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId)) {
    return Response.json({ error: "message_not_ready" }, { status: 409 });
  }

  // 取 message + 校验归属
  const foundMessage = await db.query.message.findFirst({
    where: eq(message.id, messageId),
  });
  if (!foundMessage) return Response.json({ error: "not_found" }, { status: 404 });

  const foundConversation = await db.query.conversation.findFirst({
    where: eq(conversation.id, foundMessage.conversationId),
  });
  if (!foundConversation || foundConversation.userId !== user.id) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // 幂等：已有 audio_url 直接返回
  if (foundMessage.audioUrl) {
    return Response.json({ audioUrl: foundMessage.audioUrl, cached: true });
  }
  if (foundMessage.role !== "assistant" || !foundMessage.content.trim()) {
    return Response.json({ error: "nothing_to_speak" }, { status: 400 });
  }

  // 取 persona.voice
  const foundUserCharacter = await db.query.userCharacter.findFirst({
    where: eq(userCharacter.id, foundConversation.userCharacterId),
  });
  const preset = foundUserCharacter
    ? await db.query.characterPreset.findFirst({
        where: eq(characterPreset.id, foundUserCharacter.presetId),
      })
    : null;
  const persona = getPersona(preset?.slug ?? "sunshine");

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "tts_failed", reason: "missing_key" }, { status: 503 });
  }

  try {
    const upstream = await fetch("https://openrouter.ai/api/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        "X-Title": "Paper Boyfriend 2.0",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_TTS_MODEL ?? "openai/gpt-4o-mini-tts-2025-12-15",
        input: foundMessage.content,
        voice: persona.voice,
        response_format: "mp3",
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      console.error("[tts] upstream failed", upstream.status, errText);
      return Response.json({ error: "tts_failed" }, { status: 502 });
    }

    const audioBuffer = Buffer.from(await upstream.arrayBuffer());
    const key = `audio/${user.id}/${messageId}.mp3`;
    const audioUrl = await uploadToR2(key, audioBuffer, "audio/mpeg");

    await db.update(message).set({ audioUrl }).where(eq(message.id, messageId));
    return Response.json({ audioUrl, cached: false });
  } catch (err) {
    console.error("[tts] failed", err);
    return Response.json({ error: "tts_failed" }, { status: 500 });
  }
}

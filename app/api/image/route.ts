import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { requireApiUser } from "@/lib/auth/session";
import { getPersona } from "@/lib/ai/personas";
import { db } from "@/lib/db/client";
import { characterPreset, conversation, imageAsset, message, userCharacter } from "@/lib/db/schema";
import { countTodayImages } from "@/lib/db/store";
import { uploadToR2 } from "@/lib/storage/r2";

export const runtime = "nodejs";

const IMAGE_LIMIT = 5;

type SelfieBody = { kind: "selfie"; messageId: string; markerIndex?: number };
type BaseBody = { kind: "base"; userCharacterId: string };
type RequestBody = SelfieBody | BaseBody;

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser();
  if (!user) return response;

  const body = (await request.json().catch(() => ({}))) as Partial<RequestBody>;
  const kind = body.kind === "base" ? "base" : "selfie";

  // 配额检查（selfie / base 合并计数）
  const used = await countTodayImages(user.id);
  if (used >= IMAGE_LIMIT) {
    return Response.json(
      { error: "quota_exceeded", used, limit: IMAGE_LIMIT },
      { status: 429 },
    );
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "image_failed", reason: "missing_key" }, { status: 503 });
  }

  let context;
  try {
    context =
      kind === "selfie"
        ? await loadSelfieContext(user.id, body as SelfieBody)
        : await loadBaseContext(user.id, body as BaseBody);
  } catch (err) {
    console.error("[image] context load failed", err);
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const { persona, sourceBaseImageUrl, prompt, foundConversation, foundMessage, foundUserCharacter, markerIndex } =
    context;

  let dataUrl: string;
  try {
    dataUrl = await fetchAsDataUrl(sourceBaseImageUrl);
  } catch (err) {
    console.error("[image] base image read failed", err);
    return Response.json({ error: "image_failed", reason: "base_unreadable" }, { status: 500 });
  }

  let generatedDataUrl: string;
  try {
    generatedDataUrl = await callGeminiImage(apiKey, dataUrl, prompt);
  } catch (err) {
    console.error("[image] upstream failed", err);
    return Response.json({ error: "image_failed" }, { status: 502 });
  }

  let resultUrl: string;
  try {
    const { buffer, mime } = decodeDataUrl(generatedDataUrl);
    const ext = mime === "image/jpeg" ? "jpg" : "png";
    const assetId = crypto.randomUUID();
    const key = `images/${user.id}/${assetId}.${ext}`;
    resultUrl = await uploadToR2(key, buffer, mime);
  } catch (err) {
    console.error("[image] upload failed", err);
    return Response.json({ error: "image_failed", reason: "upload" }, { status: 500 });
  }

  await db.insert(imageAsset).values({
    userId: user.id,
    conversationId: foundConversation?.id,
    messageId: foundMessage?.id,
    kind,
    prompt,
    sourceImageUrl: sourceBaseImageUrl,
    resultUrl,
  });

  if (kind === "selfie" && foundMessage) {
    const imageUrls = [...(foundMessage.imageUrls ?? [])];
    imageUrls[markerIndex ?? 0] = resultUrl;
    await db.update(message).set({ imageUrls }).where(eq(message.id, foundMessage.id));
  } else if (kind === "base" && foundUserCharacter) {
    await db
      .update(userCharacter)
      .set({ baseImageUrl: resultUrl })
      .where(eq(userCharacter.id, foundUserCharacter.id));
  }

  return Response.json({ imageUrl: resultUrl, quotaRemaining: IMAGE_LIMIT - used - 1 });
}

/* ---------- helpers ---------- */

async function loadSelfieContext(userId: string, body: SelfieBody) {
  const messageId = String(body.messageId ?? "");
  const markerIndex = Number(body.markerIndex ?? 0);
  if (!messageId) throw new Error("messageId required");

  const foundMessage = await db.query.message.findFirst({ where: eq(message.id, messageId) });
  if (!foundMessage) throw new Error("message not found");

  const foundConversation = await db.query.conversation.findFirst({
    where: eq(conversation.id, foundMessage.conversationId),
  });
  if (!foundConversation || foundConversation.userId !== userId) throw new Error("conversation mismatch");

  const foundUserCharacter = await db.query.userCharacter.findFirst({
    where: eq(userCharacter.id, foundConversation.userCharacterId),
  });
  if (!foundUserCharacter) throw new Error("user_character not found");

  const preset = await db.query.characterPreset.findFirst({
    where: eq(characterPreset.id, foundUserCharacter.presetId),
  });
  const persona = getPersona(preset?.slug ?? "sunshine");

  const description = foundMessage.imageMarkers?.[markerIndex];
  const prompt = description
    ? `${persona.imageStylePrompt}。具体场景：${description}。严格保持同一张脸、同一发型、同一气质。`
    : `${persona.imageStylePrompt}。正面半身、看向镜头。严格保持同一张脸、同一发型、同一气质。`;

  return {
    persona,
    foundMessage,
    foundConversation,
    foundUserCharacter,
    sourceBaseImageUrl: foundUserCharacter.baseImageUrl,
    prompt,
    markerIndex,
  };
}

async function loadBaseContext(userId: string, body: BaseBody) {
  const userCharacterId = String(body.userCharacterId ?? "");
  if (!userCharacterId) throw new Error("userCharacterId required");

  const foundUserCharacter = await db.query.userCharacter.findFirst({
    where: eq(userCharacter.id, userCharacterId),
  });
  if (!foundUserCharacter || foundUserCharacter.userId !== userId) throw new Error("user_character mismatch");

  const preset = await db.query.characterPreset.findFirst({
    where: eq(characterPreset.id, foundUserCharacter.presetId),
  });
  const persona = getPersona(preset?.slug ?? "sunshine");

  const prompt = `${persona.imageStylePrompt}。正面半身基准照、温柔表情、自然光、干净背景。严格保持同一张脸、同一发型、同一气质。`;

  return {
    persona,
    foundMessage: null,
    foundConversation: null,
    foundUserCharacter,
    sourceBaseImageUrl: foundUserCharacter.baseImageUrl,
    prompt,
    markerIndex: undefined,
  };
}

async function fetchAsDataUrl(srcUrl: string): Promise<string> {
  // 本地 public 资源：/characters/sunshine.png → 直接读文件
  if (srcUrl.startsWith("/")) {
    const absPath = path.join(process.cwd(), "public", srcUrl.replace(/^\//, ""));
    const buf = await fs.readFile(absPath);
    const mime = guessMime(absPath);
    return `data:${mime};base64,${buf.toString("base64")}`;
  }
  // 远程 URL：R2 公开图、外链
  const resp = await fetch(srcUrl);
  if (!resp.ok) throw new Error(`fetch base image failed: ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const mime = resp.headers.get("content-type") ?? guessMime(srcUrl);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function guessMime(p: string): string {
  const ext = p.toLowerCase().split(".").pop();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "image/png";
}

async function callGeminiImage(apiKey: string, baseDataUrl: string, prompt: string): Promise<string> {
  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
      "X-Title": "Paper Boyfriend 2.0",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_IMAGE_MODEL ?? "google/gemini-2.5-flash-image",
      modalities: ["image", "text"],
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: baseDataUrl } },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });

  if (!upstream.ok) {
    const txt = await upstream.text().catch(() => "");
    throw new Error(`gemini image ${upstream.status}: ${txt.slice(0, 200)}`);
  }

  const data = await upstream.json();
  const images = data.choices?.[0]?.message?.images;
  const first = images?.[0]?.image_url?.url;
  if (typeof first !== "string" || !first.startsWith("data:")) {
    throw new Error("no image in response");
  }
  return first;
}

function decodeDataUrl(dataUrl: string): { buffer: Buffer; mime: string } {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new Error("invalid data URL");
  return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
}

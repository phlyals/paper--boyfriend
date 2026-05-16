import "server-only";
import { extractImageMarkers } from "@/lib/parsers/image-marker";
import type { Message } from "@/lib/db/store";
import type { PersonaPreset } from "./personas";
import { buildSystemPrompt } from "./system-template";

export type ChatTurn = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatMessage = ChatTurn;

export type AssistantReply = {
  text: string;
  imageMarkers: string[];
  rawText: string;
};

export type StreamChunk =
  | { type: "token"; value: string }
  | { type: "done"; rawText: string };

type GenInput = {
  persona: PersonaPreset;
  history: Message[];
  userText: string;
  memories: string[];
};

function buildMessages({ persona, history, userText, memories }: GenInput): ChatMessage[] {
  return [
    { role: "system", content: buildSystemPrompt(persona, memories) },
    ...history.slice(-20).map((m) => ({
      role: m.role as ChatMessage["role"],
      content: m.content,
    })),
    { role: "user", content: userText },
  ];
}

function openRouterHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    "X-Title": "Paper Boyfriend 2.0",
  };
}

/**
 * 非流式回复（保留给 memory extract、本地调试等场景）。
 * 用户聊天主链路走 streamAssistantReply。
 */
export async function generateAssistantReply(input: GenInput): Promise<AssistantReply> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return buildLocalReply(input);
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({
      model: process.env.OPENROUTER_CHAT_MODEL ?? "deepseek/deepseek-chat",
      messages: buildMessages(input),
      temperature: 0.86,
      max_tokens: 240,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter chat failed: ${response.status}`);
  }

  const data = await response.json();
  const rawText = (data.choices?.[0]?.message?.content ?? "").trim();
  return finalize(input.persona, rawText);
}

/**
 * 流式回复：逐 token yield；流结束最后 yield 一个 done chunk 携带 rawText。
 * 调用方按 type 分发写 SSE / 累计 rawText / 落库。
 */
export async function* streamAssistantReply(input: GenInput): AsyncGenerator<StreamChunk> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    yield* simulateLocalStream(input);
    return;
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({
      model: process.env.OPENROUTER_CHAT_MODEL ?? "deepseek/deepseek-chat",
      messages: buildMessages(input),
      temperature: 0.86,
      max_tokens: 240,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`OpenRouter stream failed: ${response.status}`);
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let rawText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE 帧以 \n\n 分隔，单帧内每行 "data: ..." 或 "event: ..." 等
    let frameEnd = buffer.indexOf("\n\n");
    while (frameEnd !== -1) {
      const frame = buffer.slice(0, frameEnd);
      buffer = buffer.slice(frameEnd + 2);
      const token = parseSseFrame(frame);
      if (token === "[DONE]") {
        buffer = "";
        yield { type: "done", rawText: rawText.trim() };
        return;
      }
      if (token) {
        rawText += token;
        yield { type: "token", value: token };
      }
      frameEnd = buffer.indexOf("\n\n");
    }
  }

  yield { type: "done", rawText: rawText.trim() };
}

/**
 * 从单个 SSE 帧（去掉尾随 \n\n）里抽 delta.content；返回 [DONE] 表示流结束。
 */
function parseSseFrame(frame: string): string | "[DONE]" | null {
  let content = "";
  for (const line of frame.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    if (payload === "[DONE]") return "[DONE]";
    try {
      const json = JSON.parse(payload);
      const delta = json.choices?.[0]?.delta?.content;
      if (typeof delta === "string") content += delta;
    } catch {
      // 忽略 keep-alive 注释 / 非 JSON 行
    }
  }
  return content || null;
}

/**
 * 解析 [IMAGE: ...] 标记，返回最终 AssistantReply。
 * 适用于流结束后由 chat route 调用。
 */
export function finalize(persona: PersonaPreset, rawText: string): AssistantReply {
  const parsed = extractImageMarkers(rawText);
  return {
    text: parsed.cleaned || persona.fallbackLines[0],
    imageMarkers: parsed.markers,
    rawText,
  };
}

/* ----------------------- 无 API key 时的本地模拟 ----------------------- */

function buildLocalReplyText({ persona, history, userText, memories }: GenInput) {
  const remembered = memories[0] ? `我还记得你之前说过，${memories[0]}。` : "";
  const line = persona.fallbackLines[history.length % persona.fallbackLines.length];
  const wantsPhoto = /照片|自拍|想看你|发张|看看你/.test(userText);
  const periodicPhoto = history.length > 0 && history.length % 7 === 0;
  const imageMarker =
    wantsPhoto || periodicPhoto
      ? `\n[IMAGE: ${persona.imageStylePrompt}，看向镜头，像刚刚专门拍给对方]`
      : "";
  return `${remembered}${remembered ? "\n" : ""}${line}${imageMarker}`;
}

function buildLocalReply(input: GenInput): AssistantReply {
  const rawText = buildLocalReplyText(input);
  return finalize(input.persona, rawText);
}

async function* simulateLocalStream(input: GenInput): AsyncGenerator<StreamChunk> {
  const rawText = buildLocalReplyText(input);
  // 按字符切，模拟打字效果，给本地调试看流式 UI 用
  for (const ch of rawText) {
    yield { type: "token", value: ch };
    // 轻微延迟，避免一帧到底；本地体验更接近真流式
    await new Promise((r) => setTimeout(r, 16));
  }
  yield { type: "done", rawText };
}

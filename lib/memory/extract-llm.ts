import "server-only";
import type { ChatTurn } from "@/lib/ai/openrouter";

export type MemoryCategory = "fact" | "preference" | "emotion" | "recent_status" | "relation";

export type ExtractedFact = {
  text: string;
  category: MemoryCategory;
  importance: number; // 1-5
};

const SYSTEM_PROMPT = `你是一个对话摘要助手。任务：从一段"用户↔虚拟陪伴对象"的对话中，抽取关于【用户】本人的、值得长期记住的信息。

输出严格 JSON，不要包含任何 markdown / 解释 / 多余文字：
{ "facts": [ { "text": string, "category": "fact"|"preference"|"emotion"|"recent_status"|"relation", "importance": 1-5 } ] }

规则：
- text 一律用第二人称（以"你..."开头），方便后续直接拼回 system prompt。例：「你下周三过生日」「你最近在准备期中作业」。
- 只抽关于用户的信息；虚拟陪伴对象自己的言行不要记。
- 一次性闲聊（"今天天气真好"）不要记。
- 情绪/近况尽量具体，例："最近加班严重、老板换了" 优于 "工作不顺"。
- 重要程度：1=顺嘴提到的小事；3=会反复提的近况/偏好；5=关键人物/纪念日/重要决定。
- 没有可记的就返回 { "facts": [] }。`;

const VALID_CATEGORIES = new Set<MemoryCategory>([
  "fact",
  "preference",
  "emotion",
  "recent_status",
  "relation",
]);

export async function extractFactsWithLLM(turns: ChatTurn[]): Promise<ExtractedFact[]> {
  if (turns.length === 0) return [];

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [];

  const dialogue = turns
    .filter((t) => t.role !== "system")
    .map((t) => `${t.role === "user" ? "用户" : "陪伴对象"}：${t.content}`)
    .join("\n");

  try {
    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        "X-Title": "Paper Boyfriend 2.0",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_EXTRACT_MODEL ?? "deepseek/deepseek-chat",
        temperature: 0.2,
        max_tokens: 600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `以下是对话：\n${dialogue}` },
        ],
      }),
    });

    if (!upstream.ok) {
      console.error("[memory.extract] upstream", upstream.status, await upstream.text().catch(() => ""));
      return [];
    }

    const data = await upstream.json();
    const raw = data.choices?.[0]?.message?.content;
    if (typeof raw !== "string") return [];

    const parsed = safeParseJson(raw);
    if (!parsed || !Array.isArray(parsed.facts)) return [];

    return parsed.facts.flatMap((f: unknown) => normalize(f) ?? []);
  } catch (err) {
    console.error("[memory.extract] failed", err);
    return [];
  }
}

function safeParseJson(text: string): { facts?: unknown[] } | null {
  try {
    return JSON.parse(text);
  } catch {
    // 容错：模型偶尔会在 JSON 外加 ```json fences
    const match = /\{[\s\S]*\}/.exec(text);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalize(input: unknown): ExtractedFact | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const text = typeof obj.text === "string" ? obj.text.trim() : "";
  if (!text) return null;

  const categoryRaw = typeof obj.category === "string" ? obj.category : "fact";
  const category = VALID_CATEGORIES.has(categoryRaw as MemoryCategory)
    ? (categoryRaw as MemoryCategory)
    : "fact";

  const importanceRaw = Number(obj.importance);
  const importance =
    Number.isFinite(importanceRaw) ? Math.max(1, Math.min(5, Math.round(importanceRaw))) : 3;

  return { text, category, importance };
}

import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { memory } from "@/lib/db/schema";
import type { Message } from "@/lib/db/store";
import { extractFactsWithLLM, type MemoryCategory } from "@/lib/memory/extract-llm";
import { Mem0MemoryService } from "@/lib/memory/mem0";

export type MemoryHit = {
  id: string;
  text: string;
  category: MemoryCategory;
  importance: number;
  score: number;
};

export interface MemoryService {
  /**
   * 检索与 query 相关的记忆，按相关度 + 重要度排序，取 top N。
   * 查不到返回空数组；任何故障都不应抛错，调用方按"无记忆"继续。
   */
  search(userId: string, query: string, limit?: number): Promise<MemoryHit[]>;

  /**
   * 从一段会话片段抽取关于"用户"的事实/偏好/情绪/近况，写入持久存储。
   * 返回新增条目数（去重后）；解析失败 / 上游不可用一律返回 0，不抛错。
   */
  extract(userId: string, messages: Message[], conversationId?: string): Promise<number>;
}

/* ------------------------- LocalMemoryService ------------------------- */

class LocalMemoryService implements MemoryService {
  async search(userId: string, query: string, limit = 8): Promise<MemoryHit[]> {
    const rows = await db.query.memory.findMany({
      where: eq(memory.userId, userId),
      orderBy: desc(memory.updatedAt),
    });
    if (rows.length === 0) return [];

    const tokens = tokenize(query);
    return rows
      .map((row) => {
        const text = row.text;
        const score = tokens.reduce((sum, t) => sum + (text.includes(t) ? 1 : 0), 0);
        return {
          id: row.id,
          text,
          category: (row.category as MemoryCategory) ?? "fact",
          importance: row.importance ?? 3,
          score,
        };
      })
      .sort((a, b) =>
        b.score !== a.score
          ? b.score - a.score
          : b.importance - a.importance,
      )
      .slice(0, limit);
  }

  async extract(userId: string, messages: Message[], conversationId?: string): Promise<number> {
    if (messages.length === 0) return 0;

    const turns = messages.map((m) => ({ role: m.role, content: m.content }));
    const facts = await extractFactsWithLLM(turns);
    if (facts.length === 0) return 0;

    let added = 0;
    for (const fact of facts) {
      const existing = await db.query.memory.findFirst({
        where: and(eq(memory.userId, userId), eq(memory.text, fact.text)),
      });
      if (existing) {
        await db
          .update(memory)
          .set({
            updatedAt: new Date(),
            importance: Math.max(existing.importance ?? 3, fact.importance),
          })
          .where(eq(memory.id, existing.id));
        continue;
      }
      await db.insert(memory).values({
        userId,
        text: fact.text,
        category: fact.category,
        importance: fact.importance,
        sourceConversationId: conversationId,
      });
      added += 1;
    }
    return added;
  }
}

function tokenize(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  // 按空白与中文标点切；对纯中文短语也按 2-gram 兜底，增加命中机会。
  const bySpace = trimmed.split(/[\s，。！？、,.!?;:；：]+/).filter(Boolean);
  const grams = new Set<string>(bySpace);
  for (const piece of bySpace) {
    for (let i = 0; i < piece.length - 1; i++) {
      grams.add(piece.slice(i, i + 2));
    }
  }
  return Array.from(grams);
}

/* ------------------------- factory ------------------------- */

let cached: MemoryService | null = null;

export function getMemoryService(): MemoryService {
  if (cached) return cached;
  if (process.env.MEM0_API_KEY) {
    cached = new Mem0MemoryService();
  } else {
    cached = new LocalMemoryService();
  }
  return cached;
}

/* ------- 兼容旧调用点的薄包装（chat route 等仍用这两个 name） ------- */

export async function searchMemories(userId: string, query: string, limit = 8): Promise<string[]> {
  const hits = await getMemoryService().search(userId, query, limit);
  return hits.map((h) => h.text);
}

export async function extractMemories(
  userId: string,
  messages: Message[],
  conversationId?: string,
): Promise<number> {
  return getMemoryService().extract(userId, messages, conversationId);
}
